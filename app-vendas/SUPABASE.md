# Conectar o Supabase (sair do modo demonstração)

Enquanto não houver Supabase configurado, o app roda em **modo demonstração**
(dados no navegador, sem login e sem catálogo compartilhável de verdade).
Siga estes passos para ativar o backend real:

## 1. Criar o projeto
1. Acesse [supabase.com](https://supabase.com) e crie um projeto.
2. Guarde a **Project URL** e a **anon key** (Settings → API).

## 2. Criar as tabelas e as policies
No **SQL Editor**, cole e rode o conteúdo de [`supabase/schema.sql`](./supabase/schema.sql).
Ele cria as tabelas e aplica o **RLS**:

- **Catálogo público:** visitantes podem *ler* `products`, `categories` e `settings`.
- **Pedidos:** visitantes podem *inserir* em `orders`; só o admin logado lê/gerencia.
- **Dados sensíveis** (`customers`, `sales`, `sale_items`) e toda **escrita** de
  catálogo exigem usuário **autenticado**.

## 3. Criar o usuário admin
Em **Authentication → Users → Add user**, crie o e-mail/senha que fará login no
painel. (Ou use a tela de cadastro do próprio app.)

> Opcional: em **Authentication → Providers → Email**, desligue "Confirm email"
> para agilizar o primeiro acesso em testes.

## 4. Configurar as variáveis de ambiente
Local (arquivo `.env`, veja `.env.example`) e/ou na **Vercel**
(Settings → Environment Variables):

```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

Reinicie o `npm run dev` (ou refaça o deploy) para aplicar.

## 5. Pronto
- O painel passa a exigir **login**.
- O **catálogo** (`/catalogo`) fica público e compartilhável — clientes veem os
  mesmos produtos de qualquer aparelho.
- **Pedidos** feitos no catálogo aparecem na aba **Pedidos** do painel para
  aprovar (vira venda + baixa de estoque) ou rejeitar.

## Migração de um banco já existente
Se você já tinha rodado uma versão anterior do `schema.sql`, apenas rode o
arquivo novamente — os `add column if not exists`, `create table if not exists`
e a recriação de policies são **idempotentes**.
