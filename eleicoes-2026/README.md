# Monitor de Candidaturas — Eleições 2026

Dashboard interativo, minimalista e responsivo para monitoramento das candidaturas
das Eleições 2026 no Brasil. Agrega, por candidatura, dados de registro e os
principais assuntos veiculados na imprensa.

> ⚠️ **Dados ilustrativos.** Os candidatos e números em `data/candidatos.json` são
> **fictícios** e servem apenas para demonstrar o funcionamento do sistema. Nenhuma
> informação representa pessoas reais. A camada de dados foi projetada para ser
> substituída por fontes oficiais (ver abaixo).

## Como executar

Não há build. É um site estático — basta servir a pasta:

```bash
cd eleicoes-2026
python3 -m http.server 8000
# abra http://localhost:8000
```

(É necessário um servidor HTTP porque o `fetch` do JSON não funciona via `file://`.)

## Estrutura

```
eleicoes-2026/
├── index.html              # marcação do dashboard
├── styles.css              # tema claro/escuro, layout responsivo
├── app.js                  # render, filtros, busca, drawer de detalhe
├── api/
│   ├── candidatos.js       # serverless: candidaturas + fotos reais (TSE)
│   └── pesquisas.js        # serverless: pesquisas registradas (TSE)
├── vercel.json             # região gru1 (Brasil) + cache das APIs
├── data/
│   └── candidatos.json     # dados de DEMONSTRAÇÃO (fallback)
└── README.md
```

## Funcionalidades

- **KPIs**: candidaturas monitoradas, registros deferidos, tendência de alta, viabilidade média.
- **Filtros**: por cargo (Presidente/Governador/Senador), por UF e ordenação.
- **Busca** por nome, partido, UF, coligação ou tema.
- **Cards** com anel de viabilidade, mini-gráfico (sparkline) da série e temas.
- **Drawer de detalhe** com indicadores, alcance em redes e principais assuntos na imprensa (com sentimento).
- **Tema claro/escuro** (persistido) e **layout responsivo** (desktop, tablet, mobile).

## Dados reais (TSE) + acesso público

O sistema busca **dados reais** e cai para demonstração se ainda não houver dados
publicados — o site nunca fica quebrado. Um selo no topo indica **"Dados ao vivo (TSE)"**
ou **"Modo demonstração"**.

### Como os dados reais chegam

```
Navegador (público)  →  /api/candidatos, /api/pesquisas  (funções serverless Vercel, região gru1)
                                        ↓
                          API pública do TSE — DivulgaCandContas
```

- **Fotos + candidaturas**: `api/candidatos.js` consulta a API pública do TSE
  (nome de urna, partido, coligação, número, situação de registro) e monta a
  **foto oficial** de cada candidato. Configurável por `?uf=SP&cargo=3`.
- **Pesquisas eleitorais**: `api/pesquisas.js` lê o **registro oficial de pesquisas**
  do TSE (instituto, nº de registro, data, contratante e resultados). Usamos apenas
  o registro público — não republicamos conteúdo proprietário de institutos privados.
- **Por que serverless na região `gru1`?** O TSE bloqueia acessos de fora do Brasil.
  As funções rodam em São Paulo (`vercel.json` → `"regions": ["gru1"]`), então
  alcançam o TSE mesmo com visitantes de qualquer lugar.
- **Fallback**: se a eleição/UF de 2026 ainda não estiver publicada (o TSE libera
  progressivamente após o registro), a função responde `{ live:false }` e o
  front-end usa `data/candidatos.json` (demonstração, claramente sinalizada).

### Acesso público

Publicado no **Vercel**, acessível por **qualquer pessoa, sem login**:

**https://monitor-eleicoes-2026-helrisson-ltda.vercel.app**

(A "Vercel Authentication" foi desativada neste projeto para permitir acesso público.)

### ⚠️ Limitação real da fonte TSE (importante)

Ao publicar, verificou-se que o endpoint `divulgacandcontas.tse.jus.br` responde
**HTTP 403 (Akamai "Access Denied")** para requisições programáticas — **inclusive
a partir da região `gru1` (Brasil)**. Ou seja, o TSE não bloqueia apenas por
geografia: ele bloqueia acesso automatizado (bot) a essa API. Por isso, hoje o site
funciona em **modo demonstração**.

O caminho de produção implementado é o **ETL dos Dados Abertos do TSE**.

## ETL agendado (Dados Abertos do TSE)

Em vez do endpoint bloqueado, o ETL usa o pacote oficial
`consulta_cand_2026.zip` (CDN do TSE), converte os CSVs e grava
`data/candidatos.json` com `meta.live=true`. O front-end então exibe o selo
**"Dados ao vivo (TSE)"** automaticamente.

```
eleicoes-2026/etl/
├── transform.mjs        # CSV do TSE -> candidatos (puro, testável)
├── build-data.mjs       # lê etl/_raw/*.csv -> data/candidatos.json
└── transform.test.mjs   # testes do parser/mapeamento
```

**Rodar localmente:**

```bash
cd eleicoes-2026
npm run etl:download   # baixa e descompacta o pacote do TSE em etl/_raw/
npm run etl            # transforma e grava data/candidatos.json
npm test               # valida a transformação
```

**Agendamento:** `.github/workflows/etl-tse.yml` roda todo dia às 06:00 BRT
(e sob demanda via *Run workflow*), baixa, transforma e **commita** o JSON
atualizado.

> ⚠️ **Bloqueio anti-bot do TSE.** Verificou-se que `cdn.tse.jus.br` (Akamai)
> responde **403 a IPs de datacenter** — incluindo runners hospedados do GitHub e
> funções do Vercel. Por isso o job é tolerante a falha: se o download for
> bloqueado (ou 2026 ainda não estiver publicado), ele **mantém os dados atuais** e
> o site segue em modo demonstração. Para dados reais garantidos, rode o ETL de um
> ambiente que o TSE não bloqueie — um **runner self-hosted no Brasil** ou a sua
> **máquina local** (`npm run etl:download && npm run etl`) — e faça commit do
> `data/candidatos.json` gerado.

As funções `api/*` continuam disponíveis como leitura alternativa, mas a fonte
de produção recomendada é o JSON gerado pelo ETL (sem dependência de runtime do TSE).

## Notas de responsabilidade

Como o sistema pode exibir informações sobre candidaturas reais, mantenha sempre:
a citação da **fonte** e da **data** de cada dado, um **aviso** claro quando os
números forem estimativas, e nunca atribua estatísticas não verificadas a pessoas
reais.
