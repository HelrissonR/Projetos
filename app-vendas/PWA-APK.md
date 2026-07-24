# Instalar como app (PWA) e gerar APK

## PWA — instalar direto do navegador (mais rápido)
Com o app publicado por HTTPS (ex.: Vercel):

- **Android (Chrome):** abra a URL → menu ⋮ → **Instalar app** / "Adicionar à tela inicial".
- **Windows/Chrome ou Edge:** ícone de instalar na barra de endereço → **Instalar**.
- **iOS (Safari):** Compartilhar → **Adicionar à Tela de Início**.

O app abre em tela cheia, com ícone próprio, e funciona offline (assets em cache
via service worker).

> Observação: o service worker exige HTTPS (ou localhost). No pacote de teste de
> arquivo único (`file://`) a PWA não é instalável — use a URL publicada.

## APK — via GitHub Actions (Trusted Web Activity)
Gera um APK que embrulha a PWA publicada.

1. Publique o app (Vercel) e confirme que `https://SEU-APP/manifest.webmanifest` abre.
2. No GitHub: **Actions → Build APK (TWA) → Run workflow**.
3. Informe a **URL** pública (sem barra final) e rode.
4. Baixe o APK em **Artifacts** (`app-vendas-apk`).

O APK é de **teste** (assinado com chave de debug). Para publicar na Play Store,
gere uma chave de release própria e configure o Digital Asset Links
(`.well-known/assetlinks.json`) no domínio.

### Alternativa sem CI: PWABuilder
Acesse [pwabuilder.com](https://www.pwabuilder.com), cole a URL da PWA e baixe o
pacote Android — caminho gráfico equivalente.
