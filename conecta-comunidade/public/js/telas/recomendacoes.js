// TELA 1 — Recomendações com o agente IA (perfil do cidadão -> serviços compatíveis)
import { api, agendar } from "../api.js";
import { esc, NOMES_TURNO, toast, confirmarAgendamento } from "../util.js";

const CENARIOS = {
  emprego: {
    cidadao: "Maria Silva", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional",
    turno_disponivel: "qualquer",
    descricao_livre: "Estou desempregada há 3 meses, quero melhorar meu currículo e fazer cursos gratuitos para voltar ao mercado."
  },
  social: {
    cidadao: "Carlos Eduardo", situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico",
    turno_disponivel: "tarde",
    descricao_livre: "Preciso de atendimento social e apoio jurídico gratuito para regularizar documentos da família."
  },
  renda: {
    cidadao: "Joana Souza", situacao_atual: "Buscando renda extra / empreender", interesse_principal: "Geração de renda",
    turno_disponivel: "noite",
    descricao_livre: "Faço doces em casa e quero aprender a vender e empreender, talvez conseguir microcrédito."
  }
};

let ultimoResultado = null;

export function render(el) {
  el.innerHTML = `
    <div class="grade-2">
      <section class="panel">
        <h2>Perfil do cidadão</h2>
        <p class="sub">Conte o que você precisa — o agente encontra as vagas mais compatíveis.</p>
        <div class="presets">
          <button class="preset-btn" data-cenario="emprego">Cenário 1: Emprego</button>
          <button class="preset-btn" data-cenario="social">Cenário 2: Social/Jurídico</button>
          <button class="preset-btn" data-cenario="renda">Cenário 3: Renda</button>
        </div>
        <form id="formPerfil" novalidate>
          <label for="cidadao">Nome</label>
          <input id="cidadao" name="cidadao" maxlength="60" autocomplete="name" />
          <p class="erro" data-erro="cidadao" hidden></p>

          <label for="situacao_atual">Situação atual</label>
          <select id="situacao_atual" name="situacao_atual">
            <option>Procurando emprego</option>
            <option>Buscando renda extra / empreender</option>
            <option>Precisando de atendimento social ou jurídico</option>
            <option>Querendo aprender novas habilidades</option>
          </select>

          <label for="interesse_principal">Interesse principal</label>
          <select id="interesse_principal" name="interesse_principal">
            <option>Capacitação profissional</option>
            <option>Geração de renda</option>
            <option>Apoio social e jurídico</option>
          </select>

          <label for="turno_disponivel">Disponibilidade de horário</label>
          <select id="turno_disponivel" name="turno_disponivel">
            <option value="qualquer">Qualquer horário</option>
            <option value="manha">Manhã</option>
            <option value="tarde">Tarde</option>
            <option value="noite">Noite</option>
          </select>

          <label for="descricao_livre">Descreva o que você precisa</label>
          <textarea id="descricao_livre" name="descricao_livre" maxlength="500"></textarea>
          <div class="contador"><span id="contador">0</span>/500</div>
          <p class="erro" data-erro="descricao_livre" hidden></p>

          <button class="btn-primary" id="btnGerar" type="submit">Gerar recomendações com IA</button>
        </form>
      </section>

      <section class="panel">
        <h2>Recomendações inteligentes</h2>
        <div id="resumo" class="summary-box">Preencha o perfil e clique em <strong>Gerar recomendações com IA</strong>.</div>
        <div id="lista" class="cards"></div>
        <details>
          <summary>Evidência técnica — entrada e saída do agente (JSON)</summary>
          <pre id="jsonLog">{ "status": "Aguardando execução do agente..." }</pre>
        </details>
      </section>
    </div>`;

  const form = el.querySelector("#formPerfil");
  const desc = el.querySelector("#descricao_livre");
  const atualizarContador = () => { el.querySelector("#contador").textContent = desc.value.length; };
  desc.addEventListener("input", atualizarContador);

  function preencher(dados) {
    for (const [k, v] of Object.entries(dados)) form.elements[k].value = v;
    atualizarContador();
  }

  el.querySelectorAll("[data-cenario]").forEach(b => b.addEventListener("click", () => {
    preencher(CENARIOS[b.dataset.cenario]);
    executar();
  }));

  async function executar() {
    el.querySelectorAll("[data-erro]").forEach(p => { p.hidden = true; });
    el.querySelectorAll(".campo-erro").forEach(c => c.classList.remove("campo-erro"));
    const perfil = Object.fromEntries(new FormData(form));
    const btn = el.querySelector("#btnGerar");
    btn.disabled = true; btn.textContent = "Analisando perfil...";
    try {
      ultimoResultado = { perfil, ...(await api.recomendar(perfil)) };
      desenhar(el);
    } catch (e) {
      if (e.campos) {
        for (const [campo, msg] of Object.entries(e.campos)) {
          const p = el.querySelector(`[data-erro="${campo}"]`);
          if (p) { p.textContent = msg; p.hidden = false; }
          form.elements[campo]?.classList.add("campo-erro");
        }
      } else toast(e.message);
    } finally {
      btn.disabled = false; btn.textContent = "Gerar recomendações com IA";
    }
  }

  form.addEventListener("submit", ev => { ev.preventDefault(); executar(); });

  el.querySelector("#lista").addEventListener("click", async ev => {
    const btn = ev.target.closest("[data-reservar]");
    if (!btn) return;
    const rec = ultimoResultado.saida.recomendacoes.find(r => r.id_servico === btn.dataset.reservar);
    const servico = { id: rec.id_servico, titulo: rec.titulo, instituicao: rec.instituicao, turno: rec.turno };
    const nome = await confirmarAgendamento(servico, form.elements.cidadao.value.trim());
    if (!nome) return;
    try {
      const { reserva } = await agendar(servico, nome);
      toast(`Vaga reservada! Protocolo ${reserva.protocolo}`);
      executar(); // recalcula com o novo saldo (Regra 4)
    } catch (e) { toast(e.message); }
  });

  if (ultimoResultado) { preencher(ultimoResultado.perfil); desenhar(el); }
  else preencher(CENARIOS.emprego);
}

function desenhar(el) {
  const { saida, entrada } = ultimoResultado;
  el.querySelector("#resumo").innerHTML =
    `<strong>Análise do agente:</strong> ${esc(saida.resumo_perfil)}<br><small>${esc(saida.proximo_passo_sugerido)}</small>`;

  const lista = el.querySelector("#lista");
  if (!saida.recomendacoes.length) {
    lista.innerHTML = `<div class="card"><p>Nenhuma vaga atingiu o score mínimo. Recomendamos procurar o canal de acolhimento social geral da comunidade.</p></div>`;
  } else {
    lista.innerHTML = saida.recomendacoes.map(rec => {
      const classe = rec.prioridade === "Últimas vagas" ? "urgent" : (rec.reforco_visibilidade ? "boost" : "");
      return `
        <div class="card">
          <div class="card-top">
            <h3>${esc(rec.titulo)}</h3>
            <span class="score">${rec.score_compatibilidade}% compatível</span>
          </div>
          <div class="meta">
            <span class="pill">${esc(rec.instituicao)}</span>
            <span class="pill">Turno: ${esc(NOMES_TURNO[rec.turno])}</span>
            <span class="pill ${classe}">${rec.vagas_disponiveis} vagas · ${esc(rec.prioridade)}</span>
          </div>
          <p class="why"><strong>Por que recomendamos:</strong> ${esc(rec.justificativa)}</p>
          <div class="card-actions">
            <span class="codigo">Código: ${esc(rec.id_servico)} · ${esc(rec.categoria)}</span>
            <button class="btn-book" data-reservar="${esc(rec.id_servico)}">Agendar vaga</button>
          </div>
        </div>`;
    }).join("");
  }
  el.querySelector("#jsonLog").textContent = JSON.stringify({ entrada, saida }, null, 2);
}
