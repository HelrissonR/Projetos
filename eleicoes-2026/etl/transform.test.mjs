// Teste do transform com um CSV sintético no layout do TSE (consulta_cand).
import { transformCsv, parseCsv } from "./transform.mjs";
import assert from "node:assert";

const header = [
  "ANO_ELEICAO", "CD_ELEICAO", "SG_UF", "CD_CARGO", "DS_CARGO",
  "SQ_CANDIDATO", "NR_CANDIDATO", "NM_CANDIDATO", "NM_URNA_CANDIDATO",
  "SG_PARTIDO", "NM_COLIGACAO", "DS_SITUACAO_CANDIDATURA",
].join(";");

const linhas = [
  `"2026";"1234";"BR";"1";"PRESIDENTE";"800001";"11";"MARIA DE SOUZA";"MARIA SOUZA";"XYZ";"COLIGACAO A; B E C";"DEFERIDO"`,
  `"2026";"1234";"SP";"3";"GOVERNADOR";"800002";"22";"JOAO DA SILVA";"JOAO SILVA";"ABC";"PARTIDO ISOLADO";"AGUARDANDO JULGAMENTO"`,
  `"2026";"1234";"SP";"7";"DEPUTADO ESTADUAL";"800003";"33333";"OUTRO NOME";"OUTRO";"ABC";"";"DEFERIDO"`, // cargo 7 deve ser filtrado
  `"2026";"1234";"BR";"1";"PRESIDENTE";"800001";"11";"MARIA DE SOUZA";"MARIA SOUZA";"XYZ";"";"DEFERIDO"`, // duplicado SQ deve ser ignorado
].join("\n");

const csv = header + "\n" + linhas;

// parseCsv respeita ';' dentro de aspas
const linhasParse = parseCsv(csv);
assert.strictEqual(linhasParse[1][10], "COLIGACAO A; B E C", "campo com ';' entre aspas");

const cands = transformCsv(csv);
assert.strictEqual(cands.length, 2, "deve manter só cargos majoritários e sem duplicados");

const maria = cands.find((c) => c.id === "800001");
assert.strictEqual(maria.cargo, "Presidente");
assert.strictEqual(maria.iniciais, "MS");
assert.strictEqual(maria.situacao, "Deferido");
assert.strictEqual(maria.partido, "XYZ");
assert.ok(maria.foto.includes("/img/1234/800001"), "URL da foto do DivulgaCand");

const joao = cands.find((c) => c.id === "800002");
assert.strictEqual(joao.cargo, "Governador");
assert.strictEqual(joao.uf, "SP");
assert.strictEqual(joao.situacao, "Aguardando julgamento", "situação não-deferida capitalizada");

console.log("✓ transform.test.mjs: todos os asserts passaram (" + cands.length + " candidatos).");
