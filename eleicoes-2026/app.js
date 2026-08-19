/* Monitor de Candidaturas — Eleições 2026
 * Front-end com camada de dados mockada.
 * Para usar dados reais, substitua fetchDados() por uma chamada à sua API/ETL do TSE.
 */

const state = {
  todos: [],
  cargo: "Todos",
  uf: "",
  ordem: "viab",
  busca: "",
  view: "painel",
};

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmtNum = (n) => Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const fmtData = (d) => new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });

/* ---- Camada de dados (troque por fonte real do TSE aqui) ---- */
async function fetchDados() {
  const res = await fetch("data/candidatos.json");
  if (!res.ok) throw new Error("Falha ao carregar dados");
  return res.json();
}

/* ---- Inicialização ---- */
init();
async function init() {
  setupTema();
  setupNav();
  setupBusca();
  setupMenuMobile();
  try {
    const dados = await fetchDados();
    state.todos = dados.candidatos;
    $("#avisoTexto").textContent = " " + dados.meta.aviso;
    montarFiltros();
    render();
  } catch (e) {
    $("#cards").innerHTML = `<div class="empty">Não foi possível carregar os dados.</div>`;
  }
}

/* ---- Filtros ---- */
function montarFiltros() {
  const cargos = ["Todos", ...new Set(state.todos.map((c) => c.cargo))];
  $("#filterCargo").innerHTML = cargos
    .map((c) => `<button class="chip ${c === state.cargo ? "active" : ""}" data-cargo="${c}">${c}</button>`)
    .join("");
  $$("#filterCargo .chip").forEach((b) =>
    b.addEventListener("click", () => {
      state.cargo = b.dataset.cargo;
      $$("#filterCargo .chip").forEach((x) => x.classList.toggle("active", x === b));
      render();
    })
  );

  const ufs = [...new Set(state.todos.map((c) => c.uf))].sort();
  $("#filterUf").innerHTML =
    `<option value="">Todas as UFs</option>` + ufs.map((u) => `<option value="${u}">${u}</option>`).join("");
  $("#filterUf").addEventListener("change", (e) => { state.uf = e.target.value; render(); });
  $("#filterOrder").addEventListener("change", (e) => { state.ordem = e.target.value; render(); });
}

function filtrados() {
  let arr = state.todos.filter((c) => {
    if (state.cargo !== "Todos" && c.cargo !== state.cargo) return false;
    if (state.uf && c.uf !== state.uf) return false;
    if (state.busca) {
      const q = state.busca.toLowerCase();
      const alvo = `${c.nome} ${c.partido} ${c.uf} ${c.coligacao} ${c.temas.join(" ")}`.toLowerCase();
      if (!alvo.includes(q)) return false;
    }
    return true;
  });
  const ord = {
    viab: (a, b) => b.viabilidade - a.viabilidade,
    nome: (a, b) => a.nome.localeCompare(b.nome),
    tend: (a, b) => ({ alta: 0, estavel: 1, baixa: 2 }[a.tendencia] - { alta: 0, estavel: 1, baixa: 2 }[b.tendencia]),
  };
  return arr.sort(ord[state.ordem]);
}

/* ---- Render principal ---- */
function render() {
  const lista = filtrados();
  renderKpis(state.todos);
  renderCards(lista);
  renderPainel(state.todos);
}

function renderKpis(todos) {
  const total = todos.length;
  const deferidos = todos.filter((c) => c.situacao === "Deferido").length;
  const emAlta = todos.filter((c) => c.tendencia === "alta").length;
  const mediaViab = Math.round(todos.reduce((s, c) => s + c.viabilidade, 0) / (total || 1));
  const kpis = [
    { ico: "◍", cor: "#6c5ce7", val: total, lbl: "Candidaturas monitoradas" },
    { ico: "✓", cor: "#14b8a6", val: deferidos, lbl: "Registros deferidos" },
    { ico: "↗", cor: "#0984e3", val: emAlta, lbl: "Em tendência de alta" },
    { ico: "★", cor: "#f59e0b", val: mediaViab + "%", lbl: "Viabilidade média" },
  ];
  $("#kpis").innerHTML = kpis
    .map(
      (k) => `<div class="kpi">
        <div class="kpi-ico" style="background:${k.cor}1f;color:${k.cor}">${k.ico}</div>
        <div><div class="kpi-val">${k.val}</div><div class="kpi-lbl">${k.lbl}</div></div>
      </div>`
    )
    .join("");
}

function renderCards(lista) {
  if (!lista.length) { $("#cards").innerHTML = `<div class="empty">Nenhuma candidatura encontrada com esses filtros.</div>`; return; }
  $("#cards").innerHTML = lista.map(cardHtml).join("");
  $$("#cards .card").forEach((el) => {
    const abrir = () => abrirDrawer(el.dataset.id);
    el.querySelector(".btn-det").addEventListener("click", (e) => { e.stopPropagation(); abrir(); });
    el.addEventListener("click", abrir);
  });
}

function cardHtml(c) {
  const trendIco = { alta: "▲", baixa: "▼", estavel: "▬" }[c.tendencia];
  return `<article class="card" data-id="${c.id}">
    <div class="card-top">
      <div class="avatar" style="background:${c.cor}">${c.iniciais}</div>
      <div class="card-id">
        <div class="card-name">${c.nome} <span class="badge-sit ${c.situacao}">${c.situacao}</span></div>
        <div class="card-sub">${c.cargo} · ${c.partido} · ${c.uf}</div>
        <div class="tags" style="margin-top:8px">${c.temas.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
      </div>
      <div>
        ${ringHtml(c.viabilidade, c.cor)}
        <div class="ring-lbl">Viabilidade</div>
      </div>
    </div>
    <div class="card-foot">
      <div class="spark">${sparkHtml(c.serie, c.cor)}</div>
      <span class="trend ${c.tendencia}">${trendIco} ${c.tendencia}</span>
      <div class="card-actions">
        <button class="icon-btn btn-det" title="Detalhes">☰</button>
      </div>
    </div>
  </article>`;
}

function ringHtml(pct, cor) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
  return `<div class="ring">
    <svg width="62" height="62" viewBox="0 0 62 62">
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="7"/>
      <circle cx="31" cy="31" r="${r}" fill="none" stroke="${cor}" stroke-width="7" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}"/>
    </svg>
    <div class="ring-val">${pct}%</div>
  </div>`;
}

function sparkHtml(serie, cor) {
  const w = 120, h = 34, max = Math.max(...serie), min = Math.min(...serie), rng = max - min || 1;
  const pts = serie.map((v, i) => [(i / (serie.length - 1)) * w, h - 4 - ((v - min) / rng) * (h - 8)]);
  const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = d + ` L ${w} ${h} L 0 ${h} Z`;
  const id = "g" + Math.random().toString(36).slice(2, 7);
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" width="100%" height="34">
    <defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${cor}" stop-opacity=".28"/><stop offset="1" stop-color="${cor}" stop-opacity="0"/>
    </linearGradient></defs>
    <path d="${area}" fill="url(#${id})"/>
    <path d="${d}" fill="none" stroke="${cor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

/* ---- Painéis inferiores ---- */
function renderPainel(todos) {
  const top = [...todos].sort((a, b) => b.viabilidade - a.viabilidade).slice(0, 6);
  $("#barsViab").innerHTML = top
    .map(
      (c) => `<div class="bar-row">
        <span class="bar-name">${c.nome}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${c.viabilidade}%;background:${c.cor}"></div></div>
        <span class="bar-val">${c.viabilidade}%</span>
      </div>`
    )
    .join("");

  const feed = todos
    .flatMap((c) => c.noticias.map((n) => ({ ...n, cand: c.nome, cor: c.cor })))
    .sort((a, b) => b.data.localeCompare(a.data))
    .slice(0, 6);
  const dot = { positivo: "#14b8a6", negativo: "#ef4444", neutro: "#94a3b8" };
  $("#activity").innerHTML = feed
    .map(
      (n) => `<li>
        <span class="act-dot" style="background:${dot[n.sentimento]}"></span>
        <div><div class="act-txt">${n.titulo}</div>
        <div class="act-meta">${n.cand} · ${n.fonte} · ${fmtData(n.data)}</div></div>
      </li>`
    )
    .join("");
}

/* ---- Drawer de detalhe ---- */
function abrirDrawer(id) {
  const c = state.todos.find((x) => x.id === id);
  if (!c) return;
  $("#drawer").innerHTML = `
    <div class="drawer-head">
      <div class="avatar" style="background:${c.cor};width:64px;height:64px;border-radius:18px;font-size:22px">${c.iniciais}</div>
      <div>
        <div class="card-name" style="font-size:20px">${c.nome}</div>
        <div class="card-sub">${c.cargo} · ${c.partido} · ${c.uf} · ${c.coligacao}</div>
      </div>
      <button class="drawer-close" id="drawerClose">×</button>
    </div>
    <div class="d-section">
      <h4>Indicadores</h4>
      <div class="d-metrics">
        <div class="d-metric"><b style="color:${c.cor}">${c.viabilidade}%</b><span>Viabilidade</span></div>
        <div class="d-metric"><b>${c.tendencia}</b><span>Tendência</span></div>
        <div class="d-metric"><b>${c.situacao}</b><span>Registro TSE</span></div>
      </div>
    </div>
    <div class="d-section">
      <h4>Temas em destaque</h4>
      <div class="tags">${c.temas.map((t) => `<span class="tag">${t}</span>`).join("")}</div>
    </div>
    <div class="d-section">
      <h4>Alcance nas redes</h4>
      <div class="d-metrics">
        <div class="d-metric"><b>${fmtNum(c.redes.instagram)}</b><span>Instagram</span></div>
        <div class="d-metric"><b>${fmtNum(c.redes.x)}</b><span>X</span></div>
        <div class="d-metric"><b>${fmtNum(c.redes.tiktok)}</b><span>TikTok</span></div>
      </div>
    </div>
    <div class="d-section">
      <h4>Principais assuntos na imprensa</h4>
      <div class="news">
        ${c.noticias
          .map(
            (n) => `<div class="news-item">
              <div class="nt">${n.titulo}</div>
              <div class="nm"><span class="sent ${n.sentimento}">${n.sentimento}</span> ${n.fonte} · ${fmtData(n.data)}</div>
            </div>`
          )
          .join("")}
      </div>
    </div>`;
  $("#drawer").classList.add("open");
  $("#drawer").setAttribute("aria-hidden", "false");
  $("#drawerOverlay").classList.add("open");
  $("#drawerClose").addEventListener("click", fecharDrawer);
}
function fecharDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#drawerOverlay").classList.remove("open");
}

/* ---- Interações gerais ---- */
function setupBusca() {
  $("#searchInput").addEventListener("input", (e) => { state.busca = e.target.value.trim(); render(); });
}
function setupTema() {
  const saved = localStorage.getItem("tema");
  if (saved === "dark") document.documentElement.setAttribute("data-theme", "dark");
  $("#themeToggle").addEventListener("click", () => {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
    localStorage.setItem("tema", dark ? "light" : "dark");
  });
}
function setupMenuMobile() {
  $("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));
  $("#drawerOverlay").addEventListener("click", fecharDrawer);
  $("#bannerClose").addEventListener("click", () => ($("#bannerAviso").style.display = "none"));
}
const VIEWS = {
  painel: ["Painel geral", "Acompanhamento das candidaturas em tempo quase real"],
  candidatos: ["Candidatos", "Lista completa de candidaturas monitoradas"],
  noticias: ["Notícias", "Principais assuntos por candidatura na imprensa"],
  sobre: ["Sobre o sistema", "Fontes de dados, metodologia e limitações"],
};
function setupNav() {
  $$(".nav-item").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $$(".nav-item").forEach((x) => x.classList.toggle("active", x === a));
      state.view = a.dataset.view;
      const [t, s] = VIEWS[state.view];
      $("#viewTitle").textContent = t;
      $("#viewSubtitle").textContent = s;
      $("#sidebar").classList.remove("open");
      // As views compartilham o mesmo grid; ajustes finos por view podem entrar aqui.
      $("#panels").style.display = state.view === "noticias" ? "grid" : state.view === "sobre" ? "none" : "grid";
      window.scrollTo({ top: 0, behavior: "smooth" });
    })
  );
}
