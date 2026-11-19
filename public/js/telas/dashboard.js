// TELA 4 — Dashboard do gestor: demanda, disponibilidade, utilização das vagas e sensores IoT
import { api } from "../api.js";
import { esc, NOMES_TURNO, aplicarBarras } from "../util.js";

let timer = null;

export async function render(el) {
  el.innerHTML = `
    <div class="cabecalho-tela">
      <h2>Dashboard de vagas e ocupação</h2>
      <div><span class="ao-vivo" id="atualizado">Carregando...</span> <button class="btn-sec" id="btnSair">Sair</button></div>
    </div>
    <div class="grade-kpi" id="kpis"></div>
    <div class="grade-dash">
      <section class="panel"><h2>Utilização das vagas por serviço</h2><div id="porServico"></div></section>
      <section class="panel"><h2>Salas monitoradas (IoT)</h2><div id="salas"></div></section>
    </div>
    <div class="grade-dash">
      <section class="panel"><h2>Demanda por interesse (buscas no agente)</h2><div id="demanda"></div>
        <h2 class="mt">Mais recomendados pela IA</h2><div id="recomendados"></div></section>
      <section class="panel"><h2>Últimas leituras dos sensores</h2><div id="leituras"></div></section>
    </div>`;

  el.querySelector("#btnSair").addEventListener("click", () => { api.logout(); location.hash = "#/login"; });
  await atualizar(el);
  timer = setInterval(() => atualizar(el), 3000);
}

export function destruir() { clearInterval(timer); }

async function atualizar(el) {
  let d;
  try { d = await api.dashboard(); }
  catch (e) {
    if (e.status === 401) { api.logout(); location.hash = "#/login"; }
    return;
  }
  const t = d.totais;
  el.querySelector("#atualizado").textContent = "Atualizado às " + new Date(d.geradoEm).toLocaleTimeString("pt-BR");

  el.querySelector("#kpis").innerHTML = [
    ["Vagas ofertadas", t.vagasOfertadas], ["Vagas disponíveis", t.vagasDisponiveis],
    ["Taxa de utilização", t.taxaUtilizacao + "%"], ["Reservas pela plataforma", t.reservasPlataforma],
    ["Buscas no agente IA", t.buscas]
  ].map(([rot, num]) => `<div class="kpi"><div class="num">${esc(num)}</div><div class="rot">${esc(rot)}</div></div>`).join("");

  el.querySelector("#porServico").innerHTML = d.porServico.map(s => `
    <div class="linha-barra">
      <div class="rot"><span>${esc(s.titulo)}</span><span>${s.ocupadas}/${s.vagasTotais}</span></div>
      <div class="barra ${s.utilizacao < 50 ? "alerta" : ""}"><span data-largura="${s.utilizacao}"></span></div>
      <div class="val">${s.utilizacao}%</div>
    </div>`).join("") +
    `<p class="sub mt">Barras em laranja: serviços com menos de 50% de utilização — candidatos a divulgação extra.</p>`;

  el.querySelector("#salas").innerHTML = d.salas.map(s => {
    const pct = Math.round((s.ocupacao / s.capacidade) * 100);
    return `
      <div class="sala">
        <div class="sala-top"><strong>${esc(s.sala)}</strong><span class="codigo">${s.atualizadoEm ? "leitura " + esc(new Date(s.atualizadoEm).toLocaleTimeString("pt-BR")) : "sem leituras"}</span></div>
        <div class="barra ${pct >= 100 ? "critica" : pct >= 80 ? "alerta" : ""}"><span data-largura="${pct}"></span></div>
        <div class="sensores">
          <span>Sensor de fluxo: <strong>${s.ocupacao}/${s.capacidade}</strong> pessoas (${pct}%)</span>
          <span>Temperatura: <strong>${s.temperatura === null ? "—" : esc(s.temperatura) + " °C"}</strong></span>
        </div>
        ${s.alertas.map(a => `<div class="alerta-txt">⚠ ${esc(a)}</div>`).join("")}
      </div>`;
  }).join("");

  const demanda = Object.entries(d.demandaPorInteresse);
  const maxDem = Math.max(1, ...demanda.map(([, v]) => v));
  el.querySelector("#demanda").innerHTML = demanda.length ? demanda.map(([k, v]) => `
    <div class="linha-barra"><div class="rot"><span>${esc(k)}</span></div>
      <div class="barra"><span data-largura="${(v / maxDem) * 100}"></span></div><div class="val">${v}</div></div>`).join("")
    : `<p class="vazio">Nenhuma busca registrada ainda.</p>`;

  const rec = d.porServico.filter(s => s.vezesRecomendado > 0).sort((a, b) => b.vezesRecomendado - a.vezesRecomendado);
  el.querySelector("#recomendados").innerHTML = rec.length
    ? `<table class="tabela"><tr><th>Serviço</th><th>Turno</th><th>Recomendado</th><th>Reservas</th></tr>${rec.map(s =>
      `<tr><td>${esc(s.id)}</td><td>${esc(NOMES_TURNO[s.turno])}</td><td>${s.vezesRecomendado}x</td><td>${s.reservasPlataforma}</td></tr>`).join("")}</table>`
    : `<p class="vazio">—</p>`;

  el.querySelector("#leituras").innerHTML = d.ultimasLeituras.length
    ? `<table class="tabela"><tr><th>Hora</th><th>Sala</th><th>Sensor</th><th>Valor</th></tr>${d.ultimasLeituras.map(l => `
      <tr><td>${esc(new Date(l.em).toLocaleTimeString("pt-BR"))}</td><td>${esc(l.sala)}</td><td>${l.sensor === "fluxo" ? "Ultrassônico (fluxo)" : "TMP36 (temperatura)"}</td>
      <td>${l.sensor === "fluxo" ? esc(l.evento) + " → " + l.ocupacaoApos + (l.ocupacaoApos === 1 ? " pessoa" : " pessoas") : esc(l.valor) + " °C"}</td></tr>`).join("")}</table>`
    : `<p class="vazio">Sem leituras. Rode <code>npm run iot</code> para iniciar o simulador de sensores.</p>`;

  aplicarBarras(el);
}
