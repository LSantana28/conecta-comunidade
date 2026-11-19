// TELA 2 — Catálogo de vagas (todas as oportunidades, com filtros e ocupação física via IoT)
import { api, agendar } from "../api.js";
import { esc, NOMES_TURNO, toast, confirmarAgendamento } from "../util.js";

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
    const dados = await confirmarAgendamento(servico);
    if (!dados) return;
    try {
      const { reserva } = await agendar(servico, dados);
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

function filtrar(el) {
  const norm = t => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const busca = norm(el.querySelector("#fBusca").value);
  const cat = el.querySelector("#fCategoria").value;
  const turno = el.querySelector("#fTurno").value;
  const soComVagas = el.querySelector("#fVagas").value === "com";
  return servicos.filter(s =>
    (!busca || norm(s.titulo + " " + s.instituicao + " " + s.categoria).includes(busca)) &&
    (!cat || s.categoria === cat) && (!turno || s.turno === turno) && (!soComVagas || s.vagas > 0));
}

// Recria a grade só quando muda o CONJUNTO de cards (filtros ou serviço esgotado).
// Nas atualizações periódicas, os cards existentes são mantidos e só os valores que mudaram são alterados:
// assim a barra só se move quando o sensor registra entrada/saída.
function desenhar(el) {
  const grade = el.querySelector("#gradeCatalogo");
  const visiveis = filtrar(el);
  if (!visiveis.length) {
    grade.innerHTML = `<p class="vazio">Nenhuma oportunidade encontrada com esses filtros.</p>`;
    grade.dataset.ids = "";
    return;
  }
  const ids = visiveis.map(s => s.id).join(",");
  if (grade.dataset.ids !== ids) {
    grade.innerHTML = visiveis.map(estruturaCard).join("");
    grade.dataset.ids = ids;
  }
  for (const s of visiveis) atualizarCard(grade.querySelector(`[data-card="${s.id}"]`), s);
}

function estruturaCard(s) {
  return `
    <div class="card" data-card="${esc(s.id)}">
      <div class="card-top"><h3>${esc(s.titulo)}</h3></div>
      <div class="meta">
        <span class="pill">${esc(s.instituicao)}</span>
        <span class="pill">${esc(NOMES_TURNO[s.turno])}</span>
        <span class="pill" data-campo="selo"></span>
      </div>
      <p class="why">${esc(s.descricao)}</p>
      <div class="linha-barra">
        <div class="rot"><span>Ocupação agora · ${esc(s.sala)}</span><span data-campo="pessoas"></span></div>
        <div class="barra" data-campo="trilho"><span data-campo="barra"></span></div>
        <div class="val" data-campo="pct"></div>
      </div>
      <div class="alerta-txt" data-campo="alerta" hidden></div>
      <div class="card-actions">
        <span class="codigo">${esc(s.id)} · início em ${s.inicioEmDias} dias</span>
        <button class="btn-book" data-reservar="${esc(s.id)}"></button>
      </div>
    </div>`;
}

// Só toca no DOM quando o valor realmente mudou
function definir(elemento, prop, valor) {
  if (elemento[prop] !== valor) elemento[prop] = valor;
}

function atualizarCard(card, s) {
  const q = campo => card.querySelector(`[data-campo="${campo}"]`);
  const sala = s.ocupacaoSala;
  const pct = Math.round((sala.ocupacao / sala.capacidade) * 100);

  const [classeSelo, textoSelo] = s.vagas === 0 ? ["cancel", "Esgotado"]
    : s.vagas <= 5 ? ["urgent", `Últimas ${s.vagas} vagas`] : ["ok", `${s.vagas} vagas`];
  definir(q("selo"), "className", `pill ${classeSelo}`);
  definir(q("selo"), "textContent", textoSelo);

  definir(q("pessoas"), "textContent", `${sala.ocupacao}/${sala.capacidade} pessoas`);
  definir(q("pct"), "textContent", `${pct}%`);
  definir(q("trilho"), "className", `barra ${pct >= 100 ? "critica" : pct >= 80 ? "alerta" : ""}`.trim());
  const largura = Math.min(100, pct) + "%";
  const barra = q("barra");
  if (barra.style.width !== largura) {
    if (!barra.style.width) requestAnimationFrame(() => { barra.style.width = largura; }); // 1ª exibição: anima a partir de 0
    else barra.style.width = largura;                                                      // depois: só anima a diferença
  }

  const alerta = sala.ocupacao > sala.capacidade ? "⚠ Sala acima da capacidade — gestor notificado"
    : sala.ocupacao === sala.capacidade ? "Sala lotada no momento" : "";
  definir(q("alerta"), "textContent", alerta);
  definir(q("alerta"), "hidden", !alerta);

  const btn = card.querySelector("[data-reservar]");
  definir(btn, "disabled", s.vagas === 0);
  definir(btn, "textContent", s.vagas === 0 ? "Sem vagas" : "Agendar vaga");
}
