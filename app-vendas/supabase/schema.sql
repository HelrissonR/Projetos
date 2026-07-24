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

-- ==========================================================================
-- RLS — habilite e ajuste conforme sua estratégia de autenticação.
-- As policies abaixo são PERMISSIVAS (acesso público) para uso rápido/demo.
-- Em produção, restrinja por auth.uid() / roles conforme necessário.
-- ==========================================================================
alter table public.settings       enable row level security;
alter table public.categories     enable row level security;
alter table public.products       enable row level security;
alter table public.customers      enable row level security;
alter table public.sales          enable row level security;
alter table public.sale_items     enable row level security;

do $$
declare t text;
begin
  foreach t in array array['settings','categories','products','customers','sales','sale_items']
  loop
    execute format($f$
      drop policy if exists "public_all_%1$s" on public.%1$s;
      create policy "public_all_%1$s" on public.%1$s
        for all using (true) with check (true);
    $f$, t);
  end loop;
end $$;
