// Pesquisas eleitorais registradas oficialmente no TSE.
//
// O TSE mantém um registro público das pesquisas eleitorais (empresa, data,
// contratante e resultados) no sistema DivulgaCandContas. Esta função consulta
// esse registro por UF/cargo e normaliza. Quando não houver pesquisas
// registradas para 2026, responde { live:false } e o front-end usa exemplos.
//
// Nota legal: aqui usamos apenas o REGISTRO OFICIAL do TSE (dado público),
// não a republicação de conteúdo proprietário de institutos privados.

const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";
const ANO = "2026";

async function getJson(url) {
  const r = await fetch(url, { headers: { "User-Agent": "MonitorEleicoes2026/1.0", Accept: "application/json" } });
  if (!r.ok) throw new Error(`TSE ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=7200");
  const uf = (req.query.uf || "BR").toUpperCase();
  try {
    // Endpoint de pesquisas registradas (formato pode variar por ciclo eleitoral).
    const data = await getJson(`${TSE}/pesquisa/listar/${ANO}/${uf}`);
    const brutas = data?.pesquisas || data || [];
    if (!Array.isArray(brutas) || !brutas.length) {
      return res.status(200).json({ live: false, motivo: "Sem pesquisas registradas para 2026 nesta UF." });
    }
    const pesquisas = brutas.map((p) => ({
      instituto: p.empresa || p.nomeEmpresa || p.instituto,
      registro: p.numeroRegistro || p.registro,
      data: p.dataDivulgacao || p.data,
      contratante: p.contratante,
      resultados: p.resultados || [],
    }));
    res.status(200).json({ live: true, fonte: "TSE — Registro de Pesquisas Eleitorais", uf, pesquisas });
  } catch (e) {
    res.status(200).json({ live: false, motivo: String(e.message || e) });
  }
}
