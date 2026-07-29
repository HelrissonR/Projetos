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
  subtotal numeric(12,2) not null default 0
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

-- Migrações para bancos criados antes destes campos (idempotentes)
alter table public.products  add column if not exists image text;
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
