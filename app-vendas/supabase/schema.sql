-- ==========================================================================
-- App de Vendas e Gestão de Produtos — Schema Supabase
-- Execute no SQL Editor do seu projeto Supabase.
-- ==========================================================================

create extension if not exists "pgcrypto";

-- Configurações (linha única de personalização) -----------------------------
create table if not exists public.settings (
  id uuid primary key default gen_random_uuid(),
  company_name text not null default 'Minha Loja',
  logo_url text,
  currency text not null default 'BRL',
  locale text not null default 'pt-BR',
  brand_color text not null default '79 70 229',
  theme text not null default 'light',
  payment_methods jsonb not null default '[]',
  product_custom_fields jsonb not null default '[]',
  low_stock_threshold int not null default 5,
  whatsapp_number text not null default '',
  catalog_enabled boolean not null default true,
  catalog_message text not null default '',
  updated_at timestamptz not null default now()
);

-- Categorias ----------------------------------------------------------------
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- Produtos ------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sku text,
  category_id uuid references public.categories(id) on delete set null,
  price numeric(12,2) not null default 0,
  cost numeric(12,2) default 0,
  stock int not null default 0,
  active boolean not null default true,
  image text,
  custom jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Clientes ------------------------------------------------------------------
create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  document text,
  address text,
  notes text,
  created_at timestamptz not null default now()
);

-- Vendas --------------------------------------------------------------------
create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete set null,
  customer_name text,
  total numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  payment_method text not null default '',
  status text not null default 'completed',
  created_at timestamptz not null default now()
);

create table if not exists public.sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity int not null default 1,
  unit_price numeric(12,2) not null default 0,
  subtotal numeric(12,2) not null default 0,
  cost numeric(12,2) not null default 0 -- custo histórico (snapshot no momento da venda)
);

create index if not exists idx_sale_items_sale on public.sale_items(sale_id);
create index if not exists idx_sales_created on public.sales(created_at);

-- Pedidos do catálogo (inseridos por clientes anônimos; itens em jsonb) -------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text,
  customer_phone text,
  customer_address text,
  note text,
  items jsonb not null default '[]',
  total numeric(12,2) not null default 0,
  status text not null default 'pending',
  source text not null default 'catalog',
  created_at timestamptz not null default now()
);
create index if not exists idx_orders_status on public.orders(status);

-- Ajuste atômico de estoque: evita "lost update" quando duas vendas baixam o
-- estoque do mesmo produto ao mesmo tempo (ler-depois-escrever no cliente
-- não é atômico e pode perder uma das baixas sob concorrência).
create or replace function public.adjust_product_stock(p_id uuid, p_delta int)
returns void
language sql
security definer
set search_path = public
as $$
  -- greatest(0, ...) impede estoque negativo mesmo sob concorrência/offline.
  update public.products set stock = greatest(0, stock + p_delta) where id = p_id;
$$;
-- Postgres concede EXECUTE a PUBLIC por padrão ao criar a função — sem estes
-- revokes, um visitante anônimo poderia chamar a RPC e alterar o estoque de
-- qualquer produto livremente. Restringe explicitamente a autenticados.
revoke all on function public.adjust_product_stock(uuid, int) from public;
revoke all on function public.adjust_product_stock(uuid, int) from anon;
grant execute on function public.adjust_product_stock(uuid, int) to authenticated;

-- ==========================================================================
-- Transações atômicas (venda/cancelamento/aprovação) — evitam venda incompleta,
-- estoque baixado sem venda e aprovação duplicada. SECURITY DEFINER + guardas;
-- execução restrita a `authenticated` (o admin logado). O aviso do linter sobre
-- "signed-in users can execute SECURITY DEFINER" é ESPERADO: é exatamente quem
-- deve poder registrar vendas. Os anônimos estão revogados.
-- ==========================================================================
create or replace function public.create_sale_tx(p_sale jsonb, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb; v_pid uuid; v_qty int; v_new int; v_sid uuid := (p_sale->>'id')::uuid;
begin
  if v_sid is null then raise exception 'Venda sem id'; end if;
  insert into public.sales (id, customer_id, customer_name, total, discount, payment_method, status, created_at)
  values (v_sid, nullif(p_sale->>'customer_id','')::uuid, p_sale->>'customer_name',
          coalesce((p_sale->>'total')::numeric,0), coalesce((p_sale->>'discount')::numeric,0),
          coalesce(p_sale->>'payment_method',''), coalesce(p_sale->>'status','completed'),
          coalesce((p_sale->>'created_at')::timestamptz, now()))
  on conflict (id) do nothing;
  if not found then return; end if; -- reenvio idempotente
  for it in select * from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) loop
    insert into public.sale_items (id, sale_id, product_id, product_name, quantity, unit_price, subtotal, cost)
    values (coalesce((it->>'id')::uuid, gen_random_uuid()), v_sid, nullif(it->>'product_id','')::uuid,
            it->>'product_name', coalesce((it->>'quantity')::int,1),
            coalesce((it->>'unit_price')::numeric,0), coalesce((it->>'subtotal')::numeric,0),
            coalesce((it->>'cost')::numeric,0))
    on conflict (id) do nothing;
    v_pid := nullif(it->>'product_id','')::uuid; v_qty := coalesce((it->>'quantity')::int,0);
    if v_pid is not null and v_qty <> 0 then
      update public.products set stock = stock - v_qty where id = v_pid returning stock into v_new;
      if v_new is null then raise exception 'Produto % não encontrado', v_pid using errcode='no_data_found'; end if;
      if v_new < 0 then raise exception 'Estoque insuficiente para o produto %', v_pid using errcode='check_violation'; end if;
    end if;
  end loop;
end; $$;

create or replace function public.cancel_sale_tx(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  update public.sales set status='canceled' where id=p_id and status='completed';
  if not found then return; end if; -- já cancelada/inexistente (idempotente)
  for it in select product_id, quantity from public.sale_items where sale_id=p_id and product_id is not null loop
    update public.products set stock = stock + it.quantity where id = it.product_id;
  end loop;
end; $$;

create or replace function public.approve_order_tx(p_id uuid, p_sale_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_order record; it jsonb; v_pid uuid; v_qty int; v_new int;
begin
  select * into v_order from public.orders where id=p_id and status='pending' for update;
  if not found then raise exception 'Pedido já processado ou inexistente' using errcode='check_violation'; end if;
  insert into public.sales (id, customer_id, customer_name, total, discount, payment_method, status, created_at)
  values (p_sale_id, null, v_order.customer_name, coalesce(v_order.total,0), 0, 'Catálogo/WhatsApp', 'completed', now())
  on conflict (id) do nothing;
  for it in select * from jsonb_array_elements(coalesce(v_order.items,'[]'::jsonb)) loop
    v_pid := nullif(it->>'product_id','')::uuid; v_qty := coalesce((it->>'quantity')::int,0);
    insert into public.sale_items (id, sale_id, product_id, product_name, quantity, unit_price, subtotal, cost)
    values (gen_random_uuid(), p_sale_id, v_pid, it->>'product_name', coalesce(v_qty,1),
            coalesce((it->>'unit_price')::numeric,0), coalesce((it->>'subtotal')::numeric,0),
            coalesce((select cost from public.products where id = v_pid), 0));
    if v_pid is not null and v_qty <> 0 then
      update public.products set stock = stock - v_qty where id = v_pid returning stock into v_new;
      if v_new is not null and v_new < 0 then raise exception 'Estoque insuficiente para o produto %', v_pid using errcode='check_violation'; end if;
    end if;
  end loop;
  update public.orders set status='approved' where id=p_id;
end; $$;

revoke all on function public.create_sale_tx(jsonb, jsonb) from public, anon;
revoke all on function public.cancel_sale_tx(uuid)         from public, anon;
revoke all on function public.approve_order_tx(uuid, uuid) from public, anon;
grant execute on function public.create_sale_tx(jsonb, jsonb) to authenticated;
grant execute on function public.cancel_sale_tx(uuid)         to authenticated;
grant execute on function public.approve_order_tx(uuid, uuid) to authenticated;

-- Migrações para bancos criados antes destes campos (idempotentes)
alter table public.products  add column if not exists image text;
alter table public.products  add column if not exists description text;
alter table public.products  add column if not exists min_stock int;
alter table public.products  add column if not exists max_stock int;
alter table public.sale_items add column if not exists cost numeric(12,2) not null default 0;
alter table public.products  drop constraint if exists products_min_le_max;
alter table public.products  add constraint products_min_le_max
  check (min_stock is null or max_stock is null or min_stock <= max_stock);
alter table public.customers add column if not exists address text;
alter table public.settings  add column if not exists whatsapp_number text not null default '';
alter table public.settings  add column if not exists catalog_enabled boolean not null default true;
alter table public.settings  add column if not exists catalog_message text not null default '';

-- Integridade de dados (rede de segurança; o app já valida no cliente).
alter table public.products drop constraint if exists products_price_nonneg;
alter table public.products add constraint products_price_nonneg check (price >= 0);
alter table public.products drop constraint if exists products_stock_nonneg;
alter table public.products add constraint products_stock_nonneg check (stock >= 0);
alter table public.orders drop constraint if exists orders_total_nonneg;
alter table public.orders add constraint orders_total_nonneg check (total >= 0);
alter table public.orders drop constraint if exists orders_status_valid;
alter table public.orders add constraint orders_status_valid check (status in ('pending','approved','rejected'));

create index if not exists idx_products_sku on public.products(sku);

-- ==========================================================================
-- Storage — imagens de produtos/logo (evita base64 gigante dentro do banco)
--  • Bucket público "product-images": leitura por qualquer visitante (catálogo);
--    escrita/edição/remoção apenas pelo admin autenticado.
--  • O app grava a URL pública em products.image / settings.logo_url.
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public_read_product_images" on storage.objects;
drop policy if exists "auth_insert_product_images" on storage.objects;
drop policy if exists "auth_update_product_images" on storage.objects;
drop policy if exists "auth_delete_product_images" on storage.objects;

-- Obs.: bucket público serve as URLs diretas SEM policy de SELECT; não criamos
-- policy de leitura para não permitir LISTAR todos os arquivos do bucket.
create policy "auth_insert_product_images"
  on storage.objects for insert to authenticated with check (bucket_id = 'product-images');
create policy "auth_update_product_images"
  on storage.objects for update to authenticated using (bucket_id = 'product-images');
create policy "auth_delete_product_images"
  on storage.objects for delete to authenticated using (bucket_id = 'product-images');

-- ==========================================================================
-- RLS — modelo de segurança
--
--  • Catálogo público: qualquer visitante (anon) pode LER products,
--    categories e settings — necessário para o storefront funcionar.
--  • Pedidos: qualquer visitante pode INSERIR em orders (fazer um pedido),
--    mas apenas usuários autenticados podem LER/ATUALIZAR.
--  • Dados sensíveis (customers, sales, sale_items) e toda ESCRITA de
--    catálogo exigem usuário autenticado (o admin logado).
--
--  Ajuste conforme sua necessidade (ex.: multi-loja por auth.uid()).
-- ==========================================================================
alter table public.settings   enable row level security;
alter table public.categories enable row level security;
alter table public.products   enable row level security;
alter table public.customers  enable row level security;
alter table public.sales      enable row level security;
alter table public.sale_items enable row level security;
alter table public.orders     enable row level security;

-- Limpa policies anteriores (idempotente)
do $$
declare t text; p record;
begin
  foreach t in array array['settings','categories','products','customers','sales','sale_items','orders']
  loop
    for p in select policyname from pg_policies where schemaname='public' and tablename=t
    loop
      execute format('drop policy if exists %I on public.%I', p.policyname, t);
    end loop;
  end loop;
end $$;

-- Leitura pública (catálogo)
create policy "public_read_products"   on public.products   for select using (true);
create policy "public_read_categories" on public.categories for select using (true);
create policy "public_read_settings"   on public.settings   for select using (true);

-- Escrita de catálogo/config apenas autenticado
create policy "auth_write_products"   on public.products   for all to authenticated using (true) with check (true);
create policy "auth_write_categories" on public.categories for all to authenticated using (true) with check (true);
create policy "auth_write_settings"   on public.settings   for all to authenticated using (true) with check (true);

-- Dados sensíveis: somente autenticado
create policy "auth_all_customers"  on public.customers  for all to authenticated using (true) with check (true);
create policy "auth_all_sales"       on public.sales       for all to authenticated using (true) with check (true);
create policy "auth_all_sale_items"  on public.sale_items  for all to authenticated using (true) with check (true);

-- Pedidos: insert público (cliente faz pedido); leitura/gestão autenticada
create policy "public_insert_orders" on public.orders for insert with check (true);
create policy "auth_read_orders"     on public.orders for select to authenticated using (true);
create policy "auth_update_orders"   on public.orders for update to authenticated using (true) with check (true);
