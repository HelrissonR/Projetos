# Bolsa Família — versão web (desktop)

Esta pasta é o app web pronto para hospedar. É o **mesmo** app do APK
(`app/assets/index.html`), que já possui **layout adaptado para desktop**
(a partir de ~1000px de largura o menu vira uma barra lateral e o conteúdo
usa a largura da tela). Usa o mesmo backend Supabase do aplicativo.

Arquivos:
- `index.html` — o app completo (HTML + CSS + JS).
- O `xlsx` é carregado via CDN (jsdelivr) — sem arquivo local nesta pasta.
- `app-icon.png` — ícone do app (login/PWA).
- `vercel.json` — configuração de hospedagem estática.

## Publicar na Vercel (1 clique)

1. Acesse https://vercel.com/new e importe o repositório
   `HelrissonR/Projetos`.
2. Em **Root Directory**, selecione `web`.
3. **Framework Preset**: *Other* (site estático — sem build).
4. Clique em **Deploy**. Ao final, a Vercel entrega a URL pública para
   acesso no desktop.

> Não é necessário comando de build: são arquivos estáticos.

## Alternativa: Vercel CLI

```
npm i -g vercel
cd web
vercel --prod
```
