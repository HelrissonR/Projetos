// Função serverless (Vercel, região gru1) que busca candidaturas reais na
// API pública do TSE — DivulgaCandContas — e normaliza para o formato do app.
//
// Observações importantes:
// - O TSE bloqueia acesso de fora do Brasil; por isso esta função DEVE rodar
//   na região gru1 (São Paulo). Ver regions em vercel.json.
// - Os códigos de eleição/UF de 2026 são publicados progressivamente pelo TSE.
//   Enquanto uma UF/cargo não tiver dados, a função responde { live:false } e o
//   front-end usa os dados de demonstração empacotados.
// - Configurável por querystring: ?uf=SP&cargo=3 (3=Governador, 1=Presidente,
//   5=Senador, conforme códigos do TSE).

const TSE = "https://divulgacandcontas.tse.jus.br/divulga/rest/v1";

// Ano/eleição. Atualize codEleicao quando o TSE divulgar o código oficial de 2026.
const ANO = "2026";

// Mapa de cargos (código TSE -> rótulo)
const CARGOS = { "1": "Presidente", "3": "Governador", "5": "Senador" };

async function getJson(url) {
  const r = await fetch(url, {
    headers: { "User-Agent": "MonitorEleicoes2026/1.0", Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`TSE ${r.status} em ${url}`);
  return r.json();
}

// Descobre a eleição "ordinária" do ano e retorna seu código.
async function descobrirEleicao() {
  const lista = await getJson(`${TSE}/eleicao/listar/${ANO}`);
  const arr = lista?.eleicoes || lista || [];
  const ord = arr.find((e) => /ordin|geral/i.test(e?.nomeEleicao || "")) || arr[0];
  return ord?.codElei || ord?.id || null;
}

// Monta a URL pública da foto oficial do candidato no TSE.
function fotoUrl(codEleicao, ue, sqCand) {
  return `${TSE.replace("/rest/v1", "")}/rest/arquivo/img/${codEleicao}/${ue}/${sqCand}`;
}

function corPorPartido(sigla) {
  let h = 0;
  for (const c of sigla || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 55%)`;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
  const uf = (req.query.uf || "BR").toUpperCase();
  const cargo = String(req.query.cargo || "1");
  try {
    const codEleicao = await descobrirEleicao();
    if (!codEleicao) return res.status(200).json({ live: false, motivo: "Eleição 2026 ainda não publicada pelo TSE." });

    const data = await getJson(`${TSE}/candidatura/listar/${ANO}/${uf}/${codEleicao}/${cargo}/candidatos`);
    const brutos = data?.candidatos || [];
    if (!brutos.length) return res.status(200).json({ live: false, motivo: `Sem candidatos publicados para ${uf}/${CARGOS[cargo] || cargo}.` });

    const candidatos = brutos.map((c) => ({
      id: String(c.id || c.sqCandidato),
      nome: c.nomeUrna || c.nomeCompleto,
      nomeCompleto: c.nomeCompleto,
      iniciais: (c.nomeUrna || "?").split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]).join("").toUpperCase(),
      foto: fotoUrl(codEleicao, uf, c.id || c.sqCandidato),
      cor: corPorPartido(c.partido?.sigla),
      cargo: CARGOS[cargo] || c.descricaoCargo || "",
      partido: c.partido?.sigla || "",
      coligacao: c.nomeColigacao || c.coligacao?.nomeColigacao || "",
      uf,
      situacao: /deferid/i.test(c.descricaoSituacao || "") ? "Deferido" : (c.descricaoSituacao || "Análise"),
      numero: c.numero,
      temas: [],
      redes: {},
      noticias: [],
    }));

    res.status(200).json({ live: true, fonte: "TSE DivulgaCandContas", codEleicao, uf, cargo, candidatos });
  } catch (e) {
    // Degrada com elegância: o front-end cai para os dados de demonstração.
    res.status(200).json({ live: false, motivo: String(e.message || e) });
  }
}
