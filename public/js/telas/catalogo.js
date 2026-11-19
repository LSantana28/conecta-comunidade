// TELA 2 — Catálogo de vagas (todas as oportunidades, com filtros e ocupação física via IoT)
import { api, agendar } from "../api.js";
import { esc, NOMES_TURNO, toast, aplicarBarras, confirmarAgendamento } from "../util.js";

let servicos = [];
let timer = null;

export async function render(el) {
  el.innerHTML = `
    <section class="panel">
      <div class="cabecalho-tela">
        <h2>Catálogo de vagas da comunidade</h2>
        <span class="ao-vivo">Ocupação das salas em tempo real (IoT)</span>
      </div>
      <div class="filtros">
        <div><label for="fBusca">Buscar</label><input id="fBusca" placeholder="Ex.: informática, jurídico..." maxlength="60" /></div>
        <div><label for="fCategoria">Categoria</label><select id="fCategoria"><option value="">Todas</option></select></div>
        <div><label for="fTurno">Turno</label>
          <select id="fTurno"><option value="">Todos</option><option value="manha">Manhã</option><option value="tarde">Tarde</option><option value="noite">Noite</option></select></div>
        <div><label for="fVagas">Disponibilidade</label>
          <select id="fVagas"><option value="">Todas</option><option value="com">Somente com vagas</option></select></div>
      </div>
      <div id="gradeCatalogo" class="grade-cards"></div>
    </section>`;

  const filtros = ["fBusca", "fCategoria", "fTurno", "fVagas"].map(id => el.querySelector("#" + id));
  filtros.forEach(f => f.addEventListener("input", () => desenhar(el)));

  el.querySelector("#gradeCatalogo").addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-reservar]");
    if (!btn) return;
    const servico = servicos.find(s => s.id === btn.dataset.reservar);
    const nome = await confirmarAgendamento(servico);
    if (!nome) return;
    try {
      const { reserva } = await agendar(servico, nome);
      toast(`Vaga reservada! Protocolo ${reserva.protocolo}`);
      await carregar(el);
    } catch (e) { toast(e.message); }
  });

  await carregar(el);
  const categorias = [...new Set(servicos.map(s => s.categoria))];
  el.querySelector("#fCategoria").insertAdjacentHTML("beforeend", categorias.map(c => `<option>${esc(c)}</option>`).join(""));
  timer = setInterval(() => carregar(el).catch(() => {}), 4000);
}

export function destruir() { clearInterval(timer); }

async function carregar(el) {
  ({ servicos } = await api.servicos());
  desenhar(el);
}

function desenhar(el) {
  const busca = el.querySelector("#fBusca").value.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const cat = el.querySelector("#fCategoria").value;
  const turno = el.querySelector("#fTurno").value;
  const soComVagas = el.querySelector("#fVagas").value === "com";

  const visiveis = servicos.filter(s =>
    (!busca || (s.titulo + " " + s.instituicao + " " + s.categoria).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").includes(busca)) &&
    (!cat || s.categoria === cat) && (!turno || s.turno === turno) && (!soComVagas || s.vagas > 0));

  const grade = el.querySelector("#gradeCatalogo");
  if (!visiveis.length) { grade.innerHTML = `<p class="vazio">Nenhuma oportunidade encontrada com esses filtros.</p>`; return; }

  grade.innerHTML = visiveis.map(s => {
    const sala = s.ocupacaoSala;
    const pct = Math.round((sala.ocupacao / sala.capacidade) * 100);
    const classeBarra = pct >= 100 ? "critica" : pct >= 80 ? "alerta" : "";
    const selo = s.vagas === 0 ? `<span class="pill cancel">Esgotado</span>`
      : s.vagas <= 5 ? `<span class="pill urgent">Últimas ${s.vagas} vagas</span>`
      : `<span class="pill ok">${s.vagas} vagas</span>`;
    return `
      <div class="card">
        <div class="card-top"><h3>${esc(s.titulo)}</h3></div>
        <div class="meta">
          <span class="pill">${esc(s.instituicao)}</span>
          <span class="pill">${esc(NOMES_TURNO[s.turno])}</span>
          ${selo}
        </div>
        <p class="why">${esc(s.descricao)}</p>
        <div class="linha-barra">
          <div class="rot"><span>Ocupação agora · ${esc(s.sala)}</span><span>${sala.ocupacao}/${sala.capacidade} pessoas</span></div>
          <div class="barra ${classeBarra}"><span data-largura="${pct}"></span></div>
          <div class="val">${pct}%</div>
        </div>
        <div class="card-actions">
          <span class="codigo">${esc(s.id)} · início em ${s.inicioEmDias} dias</span>
          <button class="btn-book" data-reservar="${esc(s.id)}" ${s.vagas === 0 ? "disabled" : ""}>${s.vagas === 0 ? "Sem vagas" : "Agendar vaga"}</button>
        </div>
      </div>`;
  }).join("");
  aplicarBarras(grade);
}
