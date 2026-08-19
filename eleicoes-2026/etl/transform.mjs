// Transformação pura dos dados abertos do TSE (consulta_cand) para o formato do app.
// Sem dependências externas — fácil de testar. Recebe o TEXTO de um CSV do TSE
// (separado por ';', campos entre aspas, codificação latin1 já decodificada para
// string) e devolve a lista de candidatos normalizada.

// Códigos de cargo do TSE que o painel monitora.
export const CARGOS_TSE = {
  "1": "Presidente",
  "3": "Governador",
  "5": "Senador",
  "6": "Deputado Federal",
  "7": "Deputado Estadual",
  "8": "Deputado Distrital",
};

// Parser de CSV simples que respeita aspas e o separador ';' do TSE.
export function parseCsv(texto, sep = ";") {
  const linhas = [];
  let campo = "";
  let linha = [];
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += c;
    } else if (c === '"') {
      aspas = true;
    } else if (c === sep) {
      linha.push(campo); campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); campo = "";
      if (linha.length > 1 || linha[0] !== "") linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas;
}

function iniciais(nome) {
  return (nome || "?")
    .split(/\s+/).filter(Boolean).slice(0, 2)
    .map((s) => s[0]).join("").toUpperCase();
}

function corPorPartido(sigla) {
  let h = 0;
  for (const c of sigla || "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 65% 55%)`;
}

// URL da foto oficial no DivulgaCand (carregada pelo navegador do visitante).
export function fotoUrl(cdEleicao, sqCandidato) {
  return `https://divulgacandcontas.tse.jus.br/divulga/rest/arquivo/img/${cdEleicao}/${sqCandidato}`;
}

// Converte um CSV do TSE em candidatos. `cargosAceitos` filtra por código.
export function transformCsv(texto, cargosAceitos = Object.keys(CARGOS_TSE)) {
  const linhas = parseCsv(texto);
  if (!linhas.length) return [];
  const header = linhas[0].map((h) => h.trim().toUpperCase());
  const idx = (nome) => header.indexOf(nome);
  const col = {
    uf: idx("SG_UF"),
    cdCargo: idx("CD_CARGO"),
    dsCargo: idx("DS_CARGO"),
    nomeUrna: idx("NM_URNA_CANDIDATO"),
    nome: idx("NM_CANDIDATO"),
    partido: idx("SG_PARTIDO"),
    coligacao: idx("NM_COLIGACAO") !== -1 ? idx("NM_COLIGACAO") : idx("NM_UNIAO_PARTIDO"),
    situacao: idx("DS_SITUACAO_CANDIDATURA") !== -1 ? idx("DS_SITUACAO_CANDIDATURA") : idx("DS_DETALHE_SITUACAO_CAND"),
    numero: idx("NR_CANDIDATO"),
    sq: idx("SQ_CANDIDATO"),
    cdEleicao: idx("CD_ELEICAO"),
  };
  const get = (l, k) => (col[k] >= 0 ? (l[col[k]] || "").trim() : "");

  const out = [];
  const vistos = new Set();
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    const cd = get(l, "cdCargo");
    if (cargosAceitos.length && !cargosAceitos.includes(cd)) continue;
    const sq = get(l, "sq");
    if (!sq || vistos.has(sq)) continue;
    vistos.add(sq);

    const nomeUrna = get(l, "nomeUrna") || get(l, "nome");
    const partido = get(l, "partido");
    const sit = get(l, "situacao");
    out.push({
      id: sq,
      nome: nomeUrna,
      nomeCompleto: get(l, "nome"),
      iniciais: iniciais(nomeUrna),
      foto: fotoUrl(get(l, "cdEleicao"), sq),
      cor: corPorPartido(partido),
      cargo: CARGOS_TSE[cd] || get(l, "dsCargo"),
      partido,
      coligacao: get(l, "coligacao"),
      uf: get(l, "uf"),
      situacao: /deferid/i.test(sit) ? "Deferido" : (sit ? capitalizar(sit) : "Análise"),
      numero: get(l, "numero"),
      temas: [],
      redes: {},
      noticias: [],
    });
  }
  return out;
}

function capitalizar(s) {
  const t = s.toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}
