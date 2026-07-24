# App de Vendas e Gestão de Produtos

App web **totalmente personalizável** para vendas e gestão de produtos, construído com **React + Vite + TypeScript + Tailwind + Supabase**.

## ✨ Funcionalidades

- **Dashboard** — KPIs (faturamento, ticket médio, valor em estoque), gráfico de faturamento dos últimos 7 dias, produtos mais vendidos e alerta de estoque baixo.
- **Vendas / PDV** — catálogo com busca, carrinho, desconto, seleção de cliente, múltiplas formas de pagamento e **baixa automática de estoque**.
- **Produtos & Estoque** — CRUD completo, categorias, SKU, preço/custo, controle de estoque com alerta e **campos personalizados**.
- **Clientes (CRM)** — cadastro, histórico de compras e total gasto por cliente.
- **Histórico de vendas** — detalhamento e cancelamento com devolução de estoque.
- **Configurações (personalização)**:
  - Nome e logo da empresa
  - Cor principal (8 presets) e tema claro/escuro — aplicados em tempo real
  - Moeda e locale
  - Formas de pagamento configuráveis
  - Campos personalizados de produto (texto, número, sim/não)
  - Limite de estoque baixo

## 🚀 Como rodar

```bash
cd app-vendas
npm install
cp .env.example .env   # preencha com as credenciais do Supabase (opcional)
npm run dev
```

> **Modo demonstração:** sem `.env`, o app roda usando `localStorage` — ideal para experimentar. Ao configurar o Supabase, os dados passam a ser persistidos no banco.

## 🗄️ Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. No **SQL Editor**, execute o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql).
3. Copie a **Project URL** e a **anon key** para o arquivo `.env`.

> As policies de RLS no schema são permissivas (acesso público) para facilitar o início. **Restrinja-as antes de ir para produção.**

## 🛠️ Stack

| Camada        | Tecnologia                    |
| ------------- | ----------------------------- |
| UI            | React 18 + TypeScript         |
| Build         | Vite 5                        |
| Estilo        | Tailwind CSS (dark mode)      |
| Gráficos      | Recharts                      |
| Backend/DB    | Supabase (Postgres)           |
| Roteamento    | React Router                  |

## 📁 Estrutura

```
app-vendas/
├── src/
│   ├── components/   # Layout, Modal, PageHeader, EmptyState
│   ├── context/      # SettingsContext (tema/personalização), ToastContext
│   ├── lib/          # supabase, db (repositórios), format
│   ├── pages/        # Dashboard, Pos, Products, Customers, SalesHistory, SettingsPage
│   └── types/        # tipos de domínio
└── supabase/
    └── schema.sql
```
