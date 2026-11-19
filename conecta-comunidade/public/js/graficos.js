// Gráficos em SVG puro (sem bibliotecas — a CSP só permite scripts do próprio site).
// Paleta validada para daltonismo (skill de dataviz): azul = série 1, laranja = série 2,
// mapa de calor em rampa sequencial de um só tom (azul claro → escuro).
import { esc } from "./util.js";

export const CORES = { serie1: "#2a78d6", serie2: "#eb6834", grade: "#e2e8f0", eixo: "#94a3b8", texto: "#475569" };
const RAMPA = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"];
const NS = "http://www.w3.org/2000/svg";

export function corSequencial(v) {
  if (v === null || v === undefined) return "#f1f5f9";
  return RAMPA[Math.max(0, Math.min(RAMPA.length - 1, Math.round(v * (RAMPA.length - 1))))];
}
// Texto legível sobre a célula (claro em fundo escuro)
const corTextoSobre = v => (v !== null && v > 0.55 ? "#ffffff" : "#0f172a");

// ---------- Tooltip compartilhado ----------
let tip;
function tooltip() {
  if (!tip) { tip = document.createElement("div"); tip.className = "tooltip-grafico"; tip.hidden = true; document.body.appendChild(tip); }
  return tip;
}
export function mostrarTooltip(ev, html) {
  const t = tooltip();
  t.innerHTML = html;
  t.hidden = false;
  const x = Math.min(window.innerWidth - t.offsetWidth - 12, ev.clientX + 14);
  const y = Math.max(8, ev.clientY - t.offsetHeight - 12);
  t.style.left = x + "px";
  t.style.top = y + "px";
}
export function esconderTooltip() { if (tip) tip.hidden = true; }

function el(nome, attrs = {}, pai) {
  const n = document.createElementNS(NS, nome);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (pai) pai.appendChild(n);
  return n;
}
function texto(pai, x, y, conteudo, attrs = {}) {
  const t = el("text", { x, y, fill: CORES.texto, "font-size": 11, ...attrs }, pai);
  t.textContent = conteudo;
  return t;
}
function escalaBonita(max) {
  if (max <= 0) return { max: 1, passo: 0.25 };
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 2.5, 5, 10].map(m => m * mag).find(p => p >= bruto);
  return { max: Math.ceil(max / passo) * passo, passo };
}
const rotuloData = d => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

// ---------- Linhas (série temporal) com crosshair ----------
// series: [{ nome, valores, cor, tracejado }]
export function graficoLinhas(container, { datas, series, altura = 240 }) {
  container.innerHTML = "";
  const L = Math.max(320, container.clientWidth || 640), A = altura;
  const m = { t: 12, r: 16, b: 28, l: 36 };
  const svg = el("svg", { viewBox: `0 0 ${L} ${A}`, width: "100%", height: A, role: "img", "aria-label": series.map(s => s.nome).join(", ") }, container);
  const maxV = Math.max(1, ...series.flatMap(s => s.valores.filter(v => v !== null)));
  const { max, passo } = escalaBonita(maxV);
  const x = i => m.l + (datas.length <= 1 ? 0 : (i / (datas.length - 1)) * (L - m.l - m.r));
  const y = v => A - m.b - (v / max) * (A - m.t - m.b);

  for (let v = 0; v <= max + 1e-9; v += passo) {
    el("line", { x1: m.l, x2: L - m.r, y1: y(v), y2: y(v), stroke: CORES.grade, "stroke-width": 1 }, svg);
    texto(svg, m.l - 6, y(v) + 4, Number.isInteger(v) ? v : v.toFixed(1), { "text-anchor": "end" });
  }
  const nRot = Math.min(datas.length, Math.floor((L - m.l - m.r) / 60));
  for (let k = 0; k < nRot; k++) {
    const i = Math.round((k / Math.max(1, nRot - 1)) * (datas.length - 1));
    texto(svg, x(i), A - 8, rotuloData(datas[i]), { "text-anchor": "middle" });
  }
  for (const s of series) {
    let d = "";
    s.valores.forEach((v, i) => { if (v === null) return; d += (d ? "L" : "M") + x(i).toFixed(1) + "," + y(v).toFixed(1); });
    el("path", { d, fill: "none", stroke: s.cor, "stroke-width": s.tracejado ? 2 : 1.6, "stroke-dasharray": s.tracejado ? "5 4" : "none", "stroke-linejoin": "round", "stroke-linecap": "round", opacity: s.tracejado ? 1 : 0.55 }, svg);
  }
  // crosshair + tooltip
  const guia = el("line", { y1: m.t, y2: A - m.b, stroke: CORES.eixo, "stroke-width": 1, visibility: "hidden" }, svg);
  const pontos = series.map(s => el("circle", { r: 4, fill: s.cor, stroke: "#fff", "stroke-width": 2, visibility: "hidden" }, svg));
  const area = el("rect", { x: m.l, y: m.t, width: L - m.l - m.r, height: A - m.t - m.b, fill: "transparent" }, svg);
  area.addEventListener("mousemove", ev => {
    const r = svg.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (L / r.width);
    const i = Math.max(0, Math.min(datas.length - 1, Math.round(((px - m.l) / (L - m.l - m.r)) * (datas.length - 1))));
    guia.setAttribute("x1", x(i)); guia.setAttribute("x2", x(i)); guia.setAttribute("visibility", "visible");
    series.forEach((s, k) => {
      const v = s.valores[i];
      if (v === null) { pontos[k].setAttribute("visibility", "hidden"); return; }
      pontos[k].setAttribute("cx", x(i)); pontos[k].setAttribute("cy", y(v)); pontos[k].setAttribute("visibility", "visible");
    });
    mostrarTooltip(ev, `<strong>${rotuloData(datas[i])}</strong>` + series.map(s =>
      `<div><span class="marca" data-cor="${s.cor}"></span>${esc(s.nome)}: <b>${s.valores[i] === null ? "—" : Number.isInteger(s.valores[i]) ? s.valores[i] : s.valores[i].toFixed(1)}</b></div>`).join(""));
    pintarMarcas();
  });
  area.addEventListener("mouseleave", () => { guia.setAttribute("visibility", "hidden"); pontos.forEach(p => p.setAttribute("visibility", "hidden")); esconderTooltip(); });
}

// marcadores coloridos dentro do tooltip (CSP: cor aplicada via CSSOM)
function pintarMarcas() { tooltip().querySelectorAll("[data-cor]").forEach(s => { s.style.background = s.dataset.cor; }); }

// ---------- Barras horizontais (0–100%) ----------
// itens: [{ rotulo, valor (0..1+), detalhe (html do tooltip), nota }]
export function graficoBarras(container, itens, { referencia = 1 } = {}) {
  container.innerHTML = "";
  const L = Math.max(320, container.clientWidth || 640), alturaBarra = 18, espaco = 30;
  const m = { t: 8, r: 92, b: 22, l: Math.min(250, L * 0.42) };
  const A = m.t + m.b + itens.length * espaco;
  const svg = el("svg", { viewBox: `0 0 ${L} ${A}`, width: "100%", height: A, role: "img" }, container);
  const maxV = Math.max(referencia, ...itens.map(i => i.valor ?? 0));
  const x = v => m.l + (v / maxV) * (L - m.l - m.r);
  for (const v of [0, 0.25, 0.5, 0.75, 1]) {
    el("line", { x1: x(v), x2: x(v), y1: m.t, y2: A - m.b, stroke: v === referencia ? CORES.eixo : CORES.grade, "stroke-width": 1, "stroke-dasharray": v === referencia ? "3 3" : "none" }, svg);
    texto(svg, x(v), A - 6, `${v * 100}%`, { "text-anchor": "middle" });
  }
  itens.forEach((it, k) => {
    const yc = m.t + k * espaco + espaco / 2;
    const rot = it.rotulo.length > 34 ? it.rotulo.slice(0, 33) + "…" : it.rotulo;
    texto(svg, m.l - 8, yc + 4, rot, { "text-anchor": "end", fill: "#0f172a", "font-size": 12 });
    const w = Math.max(2, x(it.valor ?? 0) - m.l);
    // barra com ponta arredondada só no fim (ancorada na base)
    el("path", { d: `M${m.l},${yc - alturaBarra / 2}h${Math.max(0, w - 4)}a4,4 0 0 1 4,4v${alturaBarra - 8}a4,4 0 0 1 -4,4h${-Math.max(0, w - 4)}z`, fill: CORES.serie1 }, svg);
    texto(svg, x(it.valor ?? 0) + 6, yc + 4, `${Math.round((it.valor ?? 0) * 100)}%${it.nota ? " · " + it.nota : ""}`, { fill: "#0f172a", "font-weight": 600 });
    const alvo = el("rect", { x: 0, y: yc - espaco / 2, width: L, height: espaco, fill: "transparent" }, svg);
    alvo.addEventListener("mousemove", ev => mostrarTooltip(ev, it.detalhe));
    alvo.addEventListener("mouseleave", esconderTooltip);
  });
}

// ---------- Mapa de calor (tabela HTML com células coloridas) ----------
// linhas/colunas: [{ id, rotulo }]; valor(l, c) -> { v (0..1), texto, detalhe } | null
export function mapaCalor(container, { linhas, colunas, valor, mostrarTexto = false }) {
  const corpo = linhas.map(l => `<tr><th scope="row">${esc(l.rotulo)}</th>${colunas.map(c => {
    const d = valor(l, c);
    return `<td class="celula" data-v="${d?.v ?? ""}" data-tip="${esc(d?.detalhe ?? "Sem dados")}">${mostrarTexto && d ? (d.html ?? esc(d.texto)) : ""}</td>`;
  }).join("")}</tr>`).join("");
  container.innerHTML = `<table class="mapa-calor"><thead><tr><th></th>${colunas.map(c => `<th scope="col">${esc(c.rotulo)}</th>`).join("")}</tr></thead><tbody>${corpo}</tbody></table>`;
  container.querySelectorAll("td.celula").forEach(td => {
    const v = td.dataset.v === "" ? null : Number(td.dataset.v);
    td.style.background = corSequencial(v);
    td.style.color = corTextoSobre(v);
    td.addEventListener("mousemove", ev => mostrarTooltip(ev, td.dataset.tip));
    td.addEventListener("mouseleave", esconderTooltip);
  });
}

// Legenda da rampa sequencial
export function legendaSequencial(container, rotuloMin, rotuloMax) {
  container.innerHTML = `<span>${esc(rotuloMin)}</span><span class="rampa">${RAMPA.map(c => `<i data-c="${c}"></i>`).join("")}</span><span>${esc(rotuloMax)}</span>`;
  container.querySelectorAll("[data-c]").forEach(i => { i.style.background = i.dataset.c; });
}
