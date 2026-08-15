# Handoff — Gestor Bolsa Família Saúde

Documento de passagem do projeto. Leia antes de editar qualquer coisa: quase tudo
aqui é conhecimento que **não se deduz olhando o código**, e vários itens já
custaram retrabalho quando foram ignorados.

---

## 1. O que é

App de acompanhamento das condicionalidades de saúde do Bolsa Família, usado por
agentes de saúde em campo. Registra peso, altura, vacinação e pré-natal de cada
beneficiário dentro da vigência (o semestre corrente), funciona offline e
sincroniza com o Supabase quando há internet.

Distribuído como **APK Android** (WebView) e também publicado como site.

---

## 2. Arquitetura — leia com atenção

**É um arquivo único.** Todo o app vive em `app/assets/index.html`: ~11.300
linhas, ~676 KB, HTML + CSS + JavaScript puro.

- **Não há `package.json`.** Sem npm, sem React, sem Next, sem Tailwind, sem
  Lucide, sem bundler. Não existe `npm run build`, `npm run lint` nem
  `typecheck` — se um roteiro pedir esses passos, eles não existem aqui.
- **Verificação que existe:** extrair os blocos `<script>` e rodar
  `node --check`. Testes de interface foram feitos com Playwright dirigindo o
  Chromium.

**Espelho obrigatório.** `web/index.html` é cópia de `app/assets/index.html`. A
**única** diferença permitida é a tag do `xlsx` (local no APK, CDN na web).
Depois de qualquer alteração:

```
diff app/assets/index.html web/index.html   # tem de fechar em 1 hunk, só o xlsx
```

**CSP restritiva** (`index.html:5`): `default-src 'self'`; scripts só de si mesmo
e de cdnjs/jsdelivr; **imagens só `data:`** — nada de `blob:` para imagem;
`connect-src` limitado a `*.supabase.co`. Qualquer recurso externo novo esbarra
nisso.

**Telas.** Cada tela é uma função `async () => htmlString` montada no `#mc`, que
é regenerado inteiro a cada `nav()`. Rotas em `nav()`: `home`, `search`, `acomp`,
`families`, `agenda`, `config`, `design` (Editor Visual), `manual`.

**Dados locais.** IndexedDB via o wrapper `IDB`, com as stores `beneficiarios`,
`familias`, `acompanhamentos` e `meta` (configurações). `IDB.setMeta` marca
sozinho as chaves de `SYNC_SETTINGS_KEYS` como pendentes de envio.

---

## 3. Git

**Não existe `main`.** O branch `claude/beneficiary-tracking-reports-07as12`
**é** o branch padrão do repositório. Não há pull request a abrir — commit e push
direto nele.

---

## 4. Banco de dados (Supabase)

Projeto `oyqldvuzkqvjcjdyplou` (`https://oyqldvuzkqvjcjdyplou.supabase.co`).
A chave publicável está no código; a de serviço, não — e não deve entrar.

**Tabelas deste app:** `beneficiarios` (PK `nis`), `familias` (PK `family_id`),
`acompanhamentos` (PK `id`), `app_settings` (PK `key`), mais `audit_logs`,
`sync_log`, `presence`, `active_sessions`.

> ⚠️ As tabelas `cycle_*`, `beneficiary_registry`, `local_followup_records`,
> `official_followup_snapshots`, `tracking_cycles`, `organizations`,
> `health_facilities` e `user_profiles` pertencem a **outro sistema** (um portal
> web separado) que compartilha o mesmo projeto Supabase. **Este app não as usa e
> não deve tocá-las.**

**Colunas acrescentadas recentemente** — se você recriar o banco, elas precisam
existir:

```sql
alter table public.beneficiarios   add column if not exists vigencia_ref text;
alter table public.acompanhamentos add column if not exists motivo_nutricional text,
                                   add column if not exists motivo_vacinacao   text,
                                   add column if not exists motivo_prenatal    text;
```

> **Regra de ouro:** a migração de coluna vai **antes** de publicar o app. O
> upload usa lista fixa de colunas; se o app enviar uma coluna que o banco não
> tem, o `upsert` é rejeitado e **a sincronização quebra para todo mundo**.

**Exclusão é soft-delete.** `acompanhamentos.deleted_at` é o que faz a exclusão
propagar entre aparelhos. Um `DELETE` de verdade faz outro aparelho reenviar o
registro no próximo upload.

---

## 5. Como gerar o APK

**Nunca use `zip -r` para reempacotar.** Ele comprime tudo, inclusive o
`resources.arsc`, que o APK original guarda cru. Como o manifesto mira
`targetSdkVersion 34`, o Android 11+ **recusa a instalação** de um APK com
`resources.arsc` comprimido (`INSTALL_PARSE_FAILED_RESOURCES_ARSC_COMPRESSED`).
Isso já aconteceu neste projeto.

```
# 1. extrair um APK de referência (o assinado mais recente serve)
mkdir extracted && (cd extracted && unzip -q ../Gestor-Bolsa-Familia-Saude.apk)

# 2. atualizar o app
cp app/assets/index.html extracted/assets/index.html
rm -rf extracted/META-INF

# 3. reempacotar preservando compressão e alinhamento
python3 tools/empacotar.py extracted referencia.apk unsigned.apk

# 4. assinar
javac -cp apksig.jar tools/SignKS.java -d .
java -cp .:apksig.jar -Dks=bolsafamilia-release.jks -Dpw='<senha>' \
     -Dalias=bolsafamilia -Din=unsigned.apk -Dout=Gestor-Bolsa-Familia-Saude.apk SignKS
```

`empacotar.py` copia o método de compressão de cada entrada a partir do APK de
referência (~188 entradas ficam cruas) e alinha em 4 bytes o início dos dados
delas — o que o `zipalign` faria. Ele confere o próprio resultado e falha se
algo divergir.

**Identidade do app:** pacote `br.com.hr.bolsafamilia.branco`. O nome sob o
ícone (**"Gestor Bolsa Família saúde"**) mora dentro do `resources.arsc`, que é
binário; troque com `tools/renomear_app.py`.

**A chave de assinatura** (`bolsafamilia-release.jks`, alias `bolsafamilia`)
**não está no repositório** e não deve entrar — o `.gitignore` bloqueia `*.jks`.
Sem ela, nenhuma atualização instala por cima do app instalado. Guarde-a num
gerenciador de senhas ou armazenamento cifrado.

---

## 6. Regras de domínio que não são óbvias

### Vigência

É o semestre: 1ª de janeiro a junho, 2ª de julho a dezembro, virando sozinha.
`vigenciaAtual()` e `naVigencia()` são o **critério único** — não recrie
comparações de data espalhadas. Há um modo "Personalizada" (`vigenciaModo`)
para um intervalo escolhido à mão.

### A base da contagem é um arquivo, não um intervalo

Os beneficiários que contam são os do **último MAPA 1 importado**, e não
"qualquer um carimbado nesta vigência". O vínculo é:

- `app_settings.baseImportId` = id da importação corrente (`<início>#<momento>`);
- `beneficiarios.vigencia_ref` = o id da importação a que aquela pessoa pertence.

`getBaseVigencia()` compara por **igualdade** com o `baseImportId`. Isso já falhou
duas vezes de outras formas: primeiro contando qualquer coisa dentro do ano,
depois aceitando "carimbado a partir do início da vigência" — em ambos os casos a
base antiga voltava a contar e o total inflava. Não volte para critério por
intervalo de datas.

Importar MAPA 1 com **Substituir** cria uma base nova (e não apaga ninguém: quem
ficou de fora continua guardado, só sai das contas). Com **Mesclar**, soma à base
atual.

### Um registro por pessoa por semestre

`acompId(nis, data) = NIS + '-' + semestre` é a **chave primária** de
`acompanhamentos` no Supabase. Não mude essa fórmula: quebraria todos os
registros já sincronizados.

### Motivos oficiais (Ministério da Saúde, anexo de dez/2023)

São **quatro** tabelas e elas medem coisas diferentes:

| Lista | Quando | Itens |
|---|---|---|
| `MOTIVOS_NA` — não acompanhamento | pessoa **não** foi acompanhada; vale para todos | 6 |
| `MOTIVOS_NUTRI` — descumprimento nutricional | criança < 7 anos, sem peso ou altura | 10 |
| `MOTIVOS_VACINA` — descumprimento de vacinação | criança < 7 anos, vacinação "Não" | 9 |
| `MOTIVOS_PRENATAL` — descumprimento de pré-natal | gestante, pré-natal "Não" | 8 |

Descumprimento **não** é o mesmo que não acompanhamento: a pessoa foi
acompanhada, mas uma condicionalidade específica não foi cumprida. O texto é
transcrição literal do anexo — se sair tabela nova, tudo está num ponto só do
código.

---

## 7. Editor Visual — contrato a preservar

O app tem um editor de design embutido (Config → Editor Visual, só admin) que
permite mudar cores, textos, ordem dos blocos, inserir objetos e criar seções.
Ele depende de marcadores no markup:

- **`data-blk="..."`** em cada bloco de tela — é por aí que o editor reordena,
  oculta e ancora objetos, e é também o que o **tour guiado** do manual usa.
- **`data-txt="..."`** em cada texto fixo editável.
- `VD_HOST` (onde ficam os blocos de cada tela), `VD_NAO_OCULTAR` (blocos que não
  podem ser escondidos — o formulário do login está aí, senão o app fica sem
  como entrar), `VD_LABELS` (nomes amigáveis), `VD_LOGIN_HTML` (o login é markup
  estático, capturado no parse).

**Se você reescrever o markup de uma tela sem manter esses marcadores, o editor
quebra naquela tela.**

Estado salvo nas chaves `vdTokens`, `vdStyles`, `vdText`, `vdLayout`, `vdFlat`,
`vdOverlays`, `vdAssets`, `vdBlocos` — todas sincronizadas.

**Escotilha:** abrir com `#vdreset` na URL ignora todo o design salvo. É o jeito
de recuperar o app se alguém salvar algo que o deixe inutilizável.

---

## 8. Estilo

**FLAT.** O app roda com `body.flat`, que zera cantos e bordas de quase tudo. As
exceções são declaradas **na origem do seletor**: hoje `.plum-hero` e `.blogin`.

> Não tente escapar do FLAT com `border-radius: revert`. `revert` descarta o
> valor do **próprio autor** e devolve o do navegador — o resultado é o canto
> zerado do mesmo jeito. Já erramos isso; a saída é acrescentar o `:not(...)` no
> seletor do FLAT.

**Identidade.** Verde institucional. Os tokens estão em `:root`
(`--accent: #169447`, `--accent-hi: #087A3A`, `--accent-soft: #EAF8EF`,
`--brand-blue: #14518A` reservado à marca). **O tema escuro foi desativado** por
decisão de identidade: `applyTheme()` força o claro, inclusive em aparelhos que
tenham `tema:'dark'` salvo de antes.

A **cor primária** configurável (`corPrimaria`) é aplicada em
`applyCustomDesign()` desde a abertura.

---

## 9. Pendências e limitações conhecidas

- **Marcas oficiais ausentes.** SUS, Ministério da Saúde, Governo Federal e a
  marca "Bolsa Família Saúde" estão como **placeholder com `TODO`** no login. Não
  redesenhe marca oficial à mão — substitua pelos arquivos quando existirem.
- **Ícone do aplicativo** segue o PNG antigo, dentro do `resources.arsc`.
- **e-Gestor AB**: o botão existe no login, **desabilitado de propósito**. Não há
  essa integração; `loginEGestorAB()` é um ponto de entrada vazio. Não simule
  autenticação.
- **Esqueci minha senha**: quem redefine é o administrador; não há fluxo
  self-service.
- **Versões antigas em campo**: aparelho que não atualizar continua contando a
  base inteira e não carimba o que importar. Atualize todos antes da virada de
  vigência.
- **Relatórios não recebem objetos do Editor Visual** — `#printArea` é outra
  árvore de DOM.

---

## 10. Correções já feitas — não desfaça sem querer

| O que era | Correção |
|---|---|
| Importar sobrescrevia o registro inteiro e **apagava a data de nascimento** já coletada | merge campo a campo, preservando o que existe |
| Contagem inflada: uma marcação em massa fez a base antiga voltar a contar | base identificada pela importação, não por intervalo |
| "Cor primária" era gravada mas **nunca aplicada** na abertura | aplicada em `applyCustomDesign()` |
| `_setLoginLoading` / `_showLoginErr` miravam `.lcard-btn` / `.lcard`, de um login anterior — loading e destaque de erro estavam mortos | seletores atualizados |
| `resources.arsc` comprimido pelo `zip -r` | `tools/empacotar.py` |
| Cor primária salva de antes da identidade verde abriria o app na cor antiga | limpeza única (`corPrimariaMigrada`); e a aplicação passou para **depois** do `_vdApply()`, que apaga tokens inline que não conhece |
| Relatórios desalinhados (tabela sem largura fixa) | `table-layout:fixed` + `colgroup` |
| Beneficiários sem EAS sumiam do relatório | vinculados a "CENTRO DE SAÚDE DE LÁBREA" |

---

## 11. Onde procurar

| Assunto | Referência |
|---|---|
| Build e assinatura | `tools/README.md`, `tools/empacotar.py`, `tools/renomear_app.py` |
| Manual do usuário | dentro do app: botão de ajuda no cabeçalho (15 capítulos) |
| Publicação web | `web/README.md` (Vercel) |
