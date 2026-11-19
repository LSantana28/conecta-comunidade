// TELA 3 — Meus agendamentos (reservas feitas neste navegador + consulta por protocolo)
import { api, minhasReservas } from "../api.js";
import { esc, NOMES_TURNO, toast } from "../util.js";

export async function render(el) {
  el.innerHTML = `
    <section class="panel">
      <div class="cabecalho-tela">
        <h2>Meus agendamentos</h2>
        <form id="formProtocolo" class="filtros" novalidate>
          <div><label for="protocolo">Consultar protocolo</label><input id="protocolo" placeholder="CC-1A2B3C" maxlength="9" /></div>
          <button class="btn-sec" type="submit">Buscar</button>
        </form>
      </div>
      <div id="listaReservas" class="cards"></div>
    </section>`;

  el.querySelector("#formProtocolo").addEventListener("submit", async ev => {
    ev.preventDefault();
    const p = el.querySelector("#protocolo").value.trim().toUpperCase();
    if (!/^CC-[0-9A-F]{6}$/.test(p)) { toast("Protocolo no formato CC-XXXXXX."); return; }
    try { await api.reserva(p); minhasReservas.adicionar(p); await desenhar(el); }
    catch (e) { toast(e.message); }
  });

  el.querySelector("#listaReservas").addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-cancelar]");
    if (!btn) return;
    if (!confirm("Cancelar esta reserva? A vaga será liberada para outra pessoa.")) return;
    try { await api.cancelar(btn.dataset.cancelar); toast("Reserva cancelada e vaga devolvida."); await desenhar(el); }
    catch (e) { toast(e.message); }
  });

  await desenhar(el);
}

async function desenhar(el) {
  const lista = el.querySelector("#listaReservas");
  const protocolos = minhasReservas.listar();
  if (!protocolos.length) {
    lista.innerHTML = `<div class="vazio">Você ainda não tem agendamentos.<br><a href="#/recomendacoes">Gerar recomendações</a> ou <a href="#/catalogo">ver o catálogo</a>.</div>`;
    return;
  }
  const resultados = await Promise.all(protocolos.map(p => api.reserva(p).then(r => r.reserva).catch(() => null)));
  protocolos.forEach((p, i) => { if (!resultados[i]) minhasReservas.remover(p); }); // servidor reiniciado
  const reservas = resultados.filter(Boolean);
  if (!reservas.length) { lista.innerHTML = `<div class="vazio">Nenhum agendamento ativo encontrado.</div>`; return; }

  lista.innerHTML = reservas.map(r => `
    <div class="card">
      <div class="card-top">
        <h3>${esc(r.titulo)}</h3>
        <span class="pill ${r.status === "confirmada" ? "ok" : "cancel"}">${esc(r.status)}</span>
      </div>
      <div class="meta">
        <span class="pill">Protocolo ${esc(r.protocolo)}</span>
        <span class="pill">${esc(r.instituicao)}</span>
        <span class="pill">${esc(NOMES_TURNO[r.turno])} · ${esc(r.sala)}</span>
      </div>
      <p class="why">Reservado para <strong>${esc(r.primeiroNome)}</strong> em ${esc(new Date(r.criadaEm).toLocaleString("pt-BR"))}.
        Apresente o protocolo na recepção; sua entrada é registrada pelo sensor da sala.</p>
      ${r.status === "confirmada" ? `<div class="card-actions"><span></span><button class="btn-perigo" data-cancelar="${esc(r.protocolo)}">Cancelar reserva</button></div>` : ""}
    </div>`).join("");
}
