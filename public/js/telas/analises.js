// TELA 6 — Análises (Big Data): indicadores da camada OURO do data lake, com filtros,
// comparação com o período anterior e recomendações de decisão.
import { api } from "../api.js";
import { esc, NOMES_TURNO, toast } from "../util.js";
import { graficoLinhas, graficoBarras, mapaCalor, legendaSequencial, CORES, esconderTooltip } from "../graficos.js";

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmtPct = v => (v === null || v === undefined ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
const fmtInt = v => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("pt-BR"));
const fmtData = d => d.split("-").reverse().join("/");
const somarDias = (d, n) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

let estado = { preset: "30", eixo: "", turno: "", sala: "", inicio: "", fim: "" };
let ultimo = null;
let aoRedimensionar = null;

export async function render(el) {
  el.innerHTML = `
    <div class="cabecalho-tela">
      <div><h2>Análises · Big Data</h2><p class="sub sem-margem" id="qualidade">Carregando data lake...</p></div>
      <button class="btn-sec" id="btnSair">Sair</button>
    </div>

    <section class="panel filtros-analise" aria-label="Filtros">
      <div><label for="fPeriodo">Período</label>
        <select id="fPeriodo"><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option><option value="custom">Personalizado</option></select></div>
      <div class="datas" id="datasCustom" hidden>
        <div><label for="fInicio">De</label><input type="date" id="fInicio" /></div>
        <div><label for="fFim">Até</label><input type="date" id="fFim" /></div>
      </div>
      <div><label for="fEixo">Eixo</label><select id="fEixo"><option value="">Todos</option></select></div>
      <div><label for="fTurno">Turno</label><select id="fTurno"><option value="">Todos</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select></div>
      <div><label for="fSala">Sala</label><select id="fSala"><option value="">Todas</option></select></div>
      <button class="btn-sec" id="btnLimpar" type="button">Limpar filtros</button>
    </section>
    <p class="sub" id="resumoFiltro"></p>

    <section class="panel bloco">
      <h2>O que decidir agora</h2>
      <p class="sub">Recomendações geradas a partir dos indicadores do período, considerando toda a rede de serviços.</p>
      <div id="insights" class="insights"></div>
    </section>

    <div class="grade-kpi" id="kpis"></div>

    <section class="panel bloco">
      <div class="cabecalho-grafico"><h2>Buscas e reservas por dia</h2><div class="legenda" id="legendaSerie"></div></div>
      <div id="gSerie" class="grafico"></div>
    </section>

    <div class="grade-dash">
      <section class="panel">
        <h2>Utilização das vagas por serviço</h2>
        <p class="sub">Reservas válidas ÷ vagas das turmas abertas no período · linha tracejada = 100%</p>
        <div id="gServicos" class="grafico"></div>
        <details><summary>Ver tabela com todos os indicadores por serviço</summary><div id="tabServicos" class="rolagem"></div></details>
      </section>
      <section class="panel">
        <h2>Aderência ao turno pedido</h2>
        <p class="sub">% das buscas que receberam alguma opção no turno escolhido. Células claras = demanda sem turma adequada.</p>
        <div id="gTurno"></div>
        <div class="legenda-seq" id="legTurno"></div>
      </section>
    </div>

    <section class="panel bloco">
      <h2>Ocupação física das salas (sensores IoT)</h2>
      <p class="sub">Média da ocupação por dia da semana e hora, reconstruída das passagens registradas pelo sensor ultrassônico</p>
      <div id="gCalor" class="rolagem"></div>
      <div class="legenda-seq" id="legCalor"></div>
      <div class="sensores" id="extrasIoT"></div>
    </section>

    <details class="panel bloco"><summary>Como os indicadores são calculados</summary><div id="metodologia"></div></details>`;

  el.querySelector("#btnSair").addEventListener("click", () => { api.logout(); location.hash = "#/login"; });
  const ids = ["fPeriodo", "fInicio", "fFim", "fEixo", "fTurno", "fSala"];
  ids.forEach(id => el.querySelector("#" + id).addEventListener("change", () => { lerFiltros(el); consultar(el); }));
  el.querySelector("#btnLimpar").addEventListener("click", () => {
    estado = { preset: "30", eixo: "", turno: "", sala: "", inicio: "", fim: "" };
    escreverFiltros(el); consultar(el);
  });
  aoRedimensionar = () => { if (ultimo) desenharGraficos(el, ultimo); };
  window.addEventListener("resize", aoRedimensionar);

  escreverFiltros(el);
  await consultar(el);
}

export function destruir() {
  window.removeEventListener("resize", aoRedimensionar);
  esconderTooltip();
}

function lerFiltros(el) {
  estado.preset = el.querySelector("#fPeriodo").value;
  estado.inicio = el.querySelector("#fInicio").value;
  estado.fim = el.querySelector("#fFim").value;
  estado.eixo = el.querySelector("#fEixo").value;
  estado.turno = el.querySelector("#fTurno").value;
  estado.sala = el.querySelector("#fSala").value;
}

function escreverFiltros(el) {
  el.querySelector("#fPeriodo").value = estado.preset;
  el.querySelector("#datasCustom").hidden = estado.preset !== "custom";
  for (const c of ["eixo", "turno", "sala"]) el.querySelector("#f" + c[0].toUpperCase() + c.slice(1)).value = estado[c];
}

function parametros() {
  const p = new URLSearchParams();
  const fimDisp = ultimo?.disponivel.fim;
  if (estado.preset === "custom" && estado.inicio && estado.fim) { p.set("inicio", estado.inicio); p.set("fim", estado.fim); }
  else if (fimDisp && estado.preset !== "custom") { p.set("fim", fimDisp); p.set("inicio", somarDias(fimDisp, -(Number(estado.preset) - 1))); }
  for (const c of ["eixo", "turno", "sala"]) if (estado[c]) p.set(c, estado[c]);
  return p;
}

async function consultar(el) {
  el.querySelector("#datasCustom").hidden = estado.preset !== "custom";
  let dados;
  try { dados = await api.analises(parametros()); }
  catch (e) {
    if (e.status === 401) { api.logout(); location.hash = "#/login"; return; }
    el.querySelector("#qualidade").textContent = e.message;
    el.querySelector("#insights").innerHTML = `<p class="vazio">${esc(e.message)}</p>`;
    return;
  }
  const primeira = !ultimo;
  ultimo = dados;
  if (primeira) prepararOpcoes(el, dados);
  desenhar(el, dados);
}

function prepararOpcoes(el, d) {
  el.querySelector("#fEixo").insertAdjacentHTML("beforeend", d.disponivel.eixos.map(e => `<option>${esc(e)}</option>`).join(""));
  el.querySelector("#fSala").insertAdjacentHTML("beforeend", d.disponivel.salas.map(s => `<option>${esc(s)}</option>`).join(""));
  for (const id of ["fInicio", "fFim"]) { const i = el.querySelector("#" + id); i.min = d.disponivel.inicio; i.max = d.disponivel.fim; }
  el.querySelector("#fInicio").value = d.filtros.inicio;
  el.querySelector("#fFim").value = d.filtros.fim;
}

function desenhar(el, d) {
  const q = d.qualidade;
  el.querySelector("#qualidade").textContent =
    `Data lake: ${fmtInt(q.validos)} registros válidos de ${fmtInt(q.lidos)} (${String(q.taxaAproveitamento).replace(".", ",")}% aproveitados · ${fmtInt(q.duplicados)} duplicados e ${fmtInt(q.rejeitados)} rejeitados no tratamento) · processado em ${new Date(d.atualizadoEm).toLocaleString("pt-BR")}`;
  const f = d.filtros;
  const partes = [f.eixo, f.turno && `turno ${NOMES_TURNO[f.turno].toLowerCase()}`, f.sala].filter(Boolean);
  el.querySelector("#resumoFiltro").textContent =
    `Mostrando ${fmtData(f.inicio)} a ${fmtData(f.fim)}${partes.length ? " · " + partes.join(" · ") : ""} · comparado com ${fmtData(d.comparacao.inicio)} a ${fmtData(d.comparacao.fim)}`;

  // Insights
  el.querySelector("#insights").innerHTML = d.insights.length ? d.insights.map(i => `
    <article class="insight ${i.severidade}">
      <span class="pill ${i.severidade === "alta" ? "urgent" : "boost"}">${i.severidade === "alta" ? "● Prioridade alta" : "○ Prioridade média"}</span>
      <h3>${esc(i.titulo)}</h3>
      <p>${esc(i.detalhe)}</p>
      <p class="decisao"><strong>Decisão sugerida:</strong> ${esc(i.decisao)}</p>
    </article>`).join("") : `<p class="vazio">Nenhum ponto de atenção no período.</p>`;

  // KPIs com variação vs período anterior
  el.querySelector("#kpis").innerHTML = d.kpis.map(k => {
    const valor = k.formato === "pct" ? fmtPct(k.valor) : fmtInt(k.valor);
    let delta = `<span class="delta neutro">sem base de comparação</span>`;
    if (k.variacao !== null) {
      const subiu = k.variacao > 0.0005, caiu = k.variacao < -0.0005;
      const bom = (subiu && k.melhor === "maior") || (caiu && k.melhor === "menor");
      const classe = !subiu && !caiu ? "neutro" : bom ? "bom" : "ruim";
      const seta = subiu ? "▲" : caiu ? "▼" : "■";
      delta = `<span class="delta ${classe}">${seta} ${fmtPct(Math.abs(k.variacao))} <span class="rotulo-delta">${!subiu && !caiu ? "estável" : bom ? "melhorou" : "piorou"} vs. anterior</span></span>`;
    }
    return `<div class="kpi" title="${esc(k.descricao)}"><div class="rot">${esc(k.rotulo)}</div><div class="num">${valor}</div>${delta}<div class="desc">${esc(k.descricao)}</div></div>`;
  }).join("");

  // Tabela por serviço (visão acessível dos dados do gráfico)
  el.querySelector("#tabServicos").innerHTML = `<table class="tabela"><thead><tr><th>#</th><th>Serviço</th><th>Turno</th><th>Vagas</th><th>Reservas</th><th>Utilização</th><th>Recomendado</th><th>Conversão</th><th>Sem vaga</th><th>Comparec.</th></tr></thead><tbody>${
    [...d.porServico].sort((a, b) => (a.rank_utilizacao ?? 99) - (b.rank_utilizacao ?? 99)).map(s => `<tr><td>${s.rank_utilizacao ?? "—"}</td><td>${esc(s.servico_id)}</td><td>${esc(NOMES_TURNO[s.turno])}</td><td>${fmtInt(s.vagasOfertadas)}</td><td>${fmtInt(s.reservasValidas)}</td><td>${fmtPct(s.utilizacao)}</td><td>${fmtInt(s.recomendado)}x</td><td>${fmtPct(s.conversao)}</td><td>${fmtInt(s.recusadasSemVaga)}</td><td>${fmtPct(s.comparecimento)}</td></tr>`).join("")
  }</tbody></table>`;

  const c = d.complementares;
  el.querySelector("#extrasIoT").innerHTML =
    `<span>P90 da ocupação: <strong>${fmtPct(c.ocupacaoP90)}</strong></span><span>Horas com sala lotada: <strong>${fmtInt(c.horasLotadas)}</strong></span><span>Horas acima de 30 °C: <strong>${fmtInt(c.horasAcima30)}</strong></span>`;

  el.querySelector("#metodologia").innerHTML = `<ul class="lista-metodo">${d.kpis.map(k => `<li><strong>${esc(k.rotulo)}:</strong> ${esc(k.descricao)}.</li>`).join("")}
    <li><strong>Variação:</strong> (atual − anterior) ÷ anterior, comparando com o período imediatamente anterior de mesmo tamanho.</li>
    <li><strong>Média móvel de 7 dias:</strong> média das reservas/buscas dos 7 dias até cada data.</li>
    <li><strong>P90 da ocupação:</strong> 90% das horas medidas ficaram abaixo desse valor.</li>
    <li>Fórmulas equivalentes em DAX (Power BI) em <code>docs/big-data/medidas-dax.md</code>.</li></ul>`;

  desenharGraficos(el, d);
}

function desenharGraficos(el, d) {
  // Série diária
  const serie = d.serieDiaria;
  const series = [
    { nome: "Buscas", valores: serie.map(s => s.buscas), cor: CORES.serie1 },
    { nome: "Buscas (média 7 dias)", valores: serie.map(s => s.buscasMM7), cor: CORES.serie1, tracejado: true },
    { nome: "Reservas", valores: serie.map(s => s.reservas), cor: CORES.serie2 },
    { nome: "Reservas (média 7 dias)", valores: serie.map(s => s.reservasMM7), cor: CORES.serie2, tracejado: true }
  ];
  const leg = el.querySelector("#legendaSerie");
  leg.innerHTML = series.map(s => `<span><i class="amostra ${s.tracejado ? "tracejada" : "solida"}" data-cor="${s.cor}"></i>${esc(s.nome)}</span>`).join("");
  leg.querySelectorAll("[data-cor]").forEach(i => { i.style.setProperty("--cor", i.dataset.cor); });
  graficoLinhas(el.querySelector("#gSerie"), { datas: serie.map(s => s.data), series });

  // Utilização por serviço (ordenado pelo ranking)
  const itens = [...d.porServico].sort((a, b) => (b.utilizacao ?? -1) - (a.utilizacao ?? -1)).map(s => ({
    rotulo: s.titulo, valor: s.utilizacao,
    nota: s.utilizacao === null ? "sem turma" : s.utilizacao >= 0.9 ? "lotado" : s.utilizacao < 0.4 ? "ocioso" : "",
    detalhe: `<strong>${esc(s.titulo)}</strong><div>${esc(NOMES_TURNO[s.turno])} · ${esc(s.sala)} · ranking ${s.rank_utilizacao ?? "—"}º</div>
      <div>${fmtInt(s.reservasValidas)} reservas válidas / ${fmtInt(s.vagasOfertadas)} vagas</div>
      <div>Recomendado ${fmtInt(s.recomendado)}x · conversão ${fmtPct(s.conversao)}</div>
      <div>${fmtInt(s.recusadasSemVaga)} recusadas sem vaga · comparecimento ${fmtPct(s.comparecimento)}</div>`
  }));
  const gS = el.querySelector("#gServicos");
  if (itens.length) graficoBarras(gS, itens); else gS.innerHTML = `<p class="vazio">Nenhum serviço com esses filtros.</p>`;

  // Matriz eixo × turno
  // "Qualquer horário" fica de fora: por definição sempre é atendido
  const colunasTurno = ["manha", "tarde", "noite"].map(t => ({ id: t, rotulo: NOMES_TURNO[t] }));
  mapaCalor(el.querySelector("#gTurno"), {
    linhas: d.matrizTurno.map(l => ({ id: l.eixo, rotulo: l.eixo })),
    colunas: colunasTurno, mostrarTexto: true,
    valor: (l, c) => {
      const cel = d.matrizTurno.find(x => x.eixo === l.id).turnos.find(x => x.turno === c.id);
      if (!cel.buscas) return null;
      return { v: cel.aderencia, html: `${Math.round(cel.aderencia * 100)}%<small>${cel.buscas} buscas</small>`,
        detalhe: `<strong>${esc(l.rotulo)} · ${esc(c.rotulo)}</strong><div>${cel.buscas} buscas</div><div>${fmtPct(cel.aderencia)} receberam opção no turno</div><div>${fmtPct(cel.semResultado)} sem nenhuma recomendação</div>` };
    }
  });
  legendaSequencial(el.querySelector("#legTurno"), "0% atendidas no turno", "100%");

  // Mapa de calor da ocupação (Seg–Sáb × 7h–22h)
  const horas = Array.from({ length: 16 }, (_, i) => i + 7);
  const idx = Object.fromEntries(d.mapaCalor.map(c => [`${c.dia_semana}|${c.hora}`, c]));
  mapaCalor(el.querySelector("#gCalor"), {
    linhas: [1, 2, 3, 4, 5, 6].map(ds => ({ id: ds, rotulo: DIAS[ds] })),
    colunas: horas.map(h => ({ id: h, rotulo: `${h}h` })),
    valor: (l, c) => {
      const cel = idx[`${l.id}|${c.id}`];
      if (!cel) return null;
      return { v: Math.min(1, cel.ocupacao), texto: fmtPct(cel.ocupacao), detalhe: `<strong>${DIAS[l.id]} · ${c.id}h</strong><div>Ocupação média: <b>${fmtPct(cel.ocupacao)}</b></div><div>${cel.amostras} medições (sala × dia)</div>` };
    }
  });
  legendaSequencial(el.querySelector("#legCalor"), "Vazia", "Lotada");
}
