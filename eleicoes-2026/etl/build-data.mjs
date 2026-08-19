// ETL — Dados Abertos do TSE (consulta_cand) -> data/candidatos.json
//
// Fluxo:
//   1) O workflow baixa e descompacta consulta_cand_2026.zip em etl/_raw/
//      (curl + unzip — ver .github/workflows/etl-tse.yml).
//   2) Este script lê os CSVs por UF, transforma e escreve data/candidatos.json
//      com meta.live=true. Se não houver CSV (ex.: 2026 ainda não publicado,
//      ou download bloqueado), preserva o data/candidatos.json existente e sai
//      com código 0 — o site continua funcional em modo demonstração.
//
// Uso local:  node etl/build-data.mjs [dirDosCsv]
// Requer Node 18+ (fs/promises, sem dependências externas).

import { readdir, readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { transformCsv } from "./transform.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const RAW_DIR = resolve(process.argv[2] || join(__dir, "_raw"));
const OUT = resolve(join(__dir, "..", "data", "candidatos.json"));

// Decodifica latin1 (ISO-8859-1) — codificação padrão dos CSVs do TSE.
async function lerCsvLatin1(caminho) {
  const buf = await readFile(caminho);
  return buf.toString("latin1");
}

async function existe(p) {
  try { await access(p); return true; } catch { return false; }
}

async function main() {
  if (!(await existe(RAW_DIR))) {
    console.log(`[etl] Pasta ${RAW_DIR} não existe — nada a processar. Mantendo dados atuais.`);
    return;
  }
  const arquivos = (await readdir(RAW_DIR)).filter((f) => /consulta_cand.*\.csv$/i.test(f));
  if (!arquivos.length) {
    console.log("[etl] Nenhum CSV consulta_cand encontrado. Mantendo dados atuais (modo demonstração).");
    return;
  }

  let candidatos = [];
  for (const arq of arquivos) {
    const texto = await lerCsvLatin1(join(RAW_DIR, arq));
    const parte = transformCsv(texto);
    console.log(`[etl] ${arq}: ${parte.length} candidatos.`);
    candidatos = candidatos.concat(parte);
  }

  if (!candidatos.length) {
    console.log("[etl] CSVs lidos, mas 0 candidatos. Mantendo dados atuais.");
    return;
  }

  // Preserva as pesquisas existentes (do arquivo atual), se houver.
  let pesquisas = [];
  if (await existe(OUT)) {
    try { pesquisas = JSON.parse(await readFile(OUT, "utf8")).pesquisas || []; } catch {}
  }

  const doc = {
    meta: {
      titulo: "Monitor de Candidaturas — Eleições 2026",
      atualizadoEm: new Date().toISOString().slice(0, 10),
      live: true,
      fonte: "TSE — Dados Abertos (consulta_cand_2026)",
      aviso: "Dados oficiais de registro do TSE (Dados Abertos). Indicadores de viabilidade/tendência/redes/notícias, quando exibidos, são enriquecimentos à parte.",
    },
    pesquisas,
    candidatos: candidatos.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };

  await writeFile(OUT, JSON.stringify(doc, null, 2) + "\n", "utf8");
  console.log(`[etl] OK: ${candidatos.length} candidatos gravados em ${OUT}`);
}

main().catch((e) => { console.error("[etl] Falha:", e); process.exit(1); });
