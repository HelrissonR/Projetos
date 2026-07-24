# Deploy na Vercel

O repositório contém mais de um app. Para publicar **este** app (`app-vendas/`):

1. No painel da Vercel, abra o projeto → **Settings → General → Root Directory**.
2. Defina **Root Directory = `app-vendas`** e salve.
3. Em **Settings → Environment Variables**, adicione (se for usar Supabase):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Faça um novo deploy (ou push).

A Vercel detecta o Vite automaticamente. O arquivo [`vercel.json`](./vercel.json) já garante o roteamento SPA (todas as rotas caem em `index.html`), necessário para o React Router.

> Sem as variáveis de ambiente, o app roda em **modo demonstração** (dados no navegador) e **sem autenticação**.
