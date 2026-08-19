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
├── data/
│   └── candidatos.json     # CAMADA DE DADOS MOCKADA (trocar por fonte real)
└── README.md
```

## Funcionalidades

- **KPIs**: candidaturas monitoradas, registros deferidos, tendência de alta, viabilidade média.
- **Filtros**: por cargo (Presidente/Governador/Senador), por UF e ordenação.
- **Busca** por nome, partido, UF, coligação ou tema.
- **Cards** com anel de viabilidade, mini-gráfico (sparkline) da série e temas.
- **Drawer de detalhe** com indicadores, alcance em redes e principais assuntos na imprensa (com sentimento).
- **Tema claro/escuro** (persistido) e **layout responsivo** (desktop, tablet, mobile).

## Trocando por dados reais do TSE

Toda a leitura de dados passa por **uma única função** em `app.js`:

```js
async function fetchDados() {
  const res = await fetch("data/candidatos.json");
  return res.json();
}
```

Basta fazê-la retornar o mesmo formato (`{ meta, candidatos: [...] }`) a partir de:

- **TSE — Dados Abertos / DivulgaCand**: os dados de candidaturas são publicados por
  pleito em arquivos (CSV/ZIP) no portal de Dados Abertos do TSE. Um passo de ETL
  (script ou backend) baixa e normaliza esses arquivos para o formato acima. Campos
  como `nome`, `cargo`, `partido`, `uf`, `coligacao` e `situacao` (deferido/análise)
  mapeiam diretamente para o registro oficial.
- **Notícias / assuntos**: alimente `candidatos[].noticias[]` com um agregador
  (feeds RSS dos portais, ou uma API de notícias). O campo `sentimento`
  (`positivo`/`neutro`/`negativo`) pode vir de uma análise automática.
- **Viabilidade / série / redes**: substitua por seus indicadores (pesquisas
  agregadas, métricas de engajamento etc.).

Enquanto essas integrações não existem, o `data/candidatos.json` mantém o sistema
totalmente funcional para demonstração e desenvolvimento de UI.

## Notas de responsabilidade

Como o sistema pode exibir informações sobre candidaturas reais, mantenha sempre:
a citação da **fonte** e da **data** de cada dado, um **aviso** claro quando os
números forem estimativas, e nunca atribua estatísticas não verificadas a pessoas
reais.
