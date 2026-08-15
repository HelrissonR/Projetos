# Texto para colar na primeira mensagem do ChatGPT

Copie daqui para baixo.

---

Vou passar a desenvolver comigo um app que já está em produção. **Antes de
propor ou escrever qualquer código, leia o arquivo `HANDOFF.md` na raiz do
repositório** — ele tem a arquitetura, as regras de domínio e as armadilhas já
descobertas.

Resumo do essencial:

**O que é:** app de acompanhamento das condicionalidades de saúde do Bolsa
Família, usado por agentes em campo. Funciona offline e sincroniza com Supabase.
Distribuído como APK Android (WebView) e como site.

**A stack não é a que você vai supor.** Todo o app é **um arquivo só**:
`app/assets/index.html`, ~11.300 linhas de HTML + CSS + JavaScript puro. **Não
existe `package.json`, npm, React, Next, Tailwind, Lucide nem bundler.** Não há
`npm run build`, `lint` nem `typecheck` — se o seu roteiro pedir esses comandos,
eles não existem aqui. A verificação que existe é `node --check` nos blocos
`<script>` e teste de interface com Playwright.

**Regras que não podem ser quebradas:**

1. `web/index.html` é espelho de `app/assets/index.html`. Depois de qualquer
   alteração, `diff` entre os dois tem de fechar em **1 hunk** (só a tag do
   xlsx).
2. **Nunca reempacotar o APK com `zip -r`** — o `resources.arsc` tem de ficar sem
   compressão, senão o Android 11+ recusa a instalação. Use
   `tools/empacotar.py`.
3. **Migração de coluna no Supabase vai antes de publicar o app.** Enviar uma
   coluna que o banco não tem derruba a sincronização de todo mundo.
4. As tabelas `cycle_*`, `beneficiary_registry` e `local_followup_records` no
   Supabase são de **outro sistema**. Não toque nelas.
5. O markup das telas tem atributos `data-blk` e `data-txt` que o Editor Visual
   embutido usa. Reescrever uma tela sem mantê-los quebra o editor.
6. **Não redesenhe marcas oficiais** (SUS, Ministério da Saúde, Governo Federal).
   Onde faltam arquivos há placeholder com `TODO`.
7. **Não simule autenticação.** O botão "Entrar com e-Gestor AB" está
   desabilitado porque essa integração não existe.

**Git:** não existe branch `main`. O padrão do repositório é
`claude/beneficiary-tracking-reports-07as12` — commit e push direto nele, sem
pull request.

**Antes de mexer em contagem de beneficiários ou em vigência**, leia a seção 6 do
`HANDOFF.md`: esse ponto já quebrou duas vezes por parecer mais simples do que é.

Confirme que leu o `HANDOFF.md` e me diga o que entendeu do modelo de vigência
antes de propormos a primeira mudança.
