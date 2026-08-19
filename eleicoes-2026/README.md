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

Projeto pronto para deploy no **Vercel** (as funções `api/*` são detectadas
automaticamente). Após o deploy, a URL é acessível por **qualquer pessoa**, sem login.

> **Limitação honesta:** este ambiente de desenvolvimento (fora do Brasil) não
> consegue validar as respostas do TSE — o bloqueio geográfico só é contornado na
> região `gru1` do deploy. Confirme os dados ao vivo na URL publicada. Os campos de
> viabilidade/série/redes/notícias por candidato são enriquecimentos opcionais:
> preencha-os via seu próprio ETL quando desejar.

## Notas de responsabilidade

Como o sistema pode exibir informações sobre candidaturas reais, mantenha sempre:
a citação da **fonte** e da **data** de cada dado, um **aviso** claro quando os
números forem estimativas, e nunca atribua estatísticas não verificadas a pessoas
reais.
