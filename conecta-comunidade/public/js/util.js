// Utilidades do frontend

// Segurança: todo dado dinâmico passa por aqui antes de ir para innerHTML (evita XSS).
export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export const NOMES_TURNO = { qualquer: "Qualquer horário", manha: "Manhã", tarde: "Tarde", noite: "Noite" };

// Armazenamento local tolerante a falhas (navegadores que bloqueiam storage)
const memoria = {};
export const armazenamento = {
  ler(chave, padrao, area = "local") {
    try {
      const v = (area === "sessao" ? sessionStorage : localStorage).getItem(chave);
      return v === null ? padrao : JSON.parse(v);
    } catch { return memoria[chave] ?? padrao; }
  },
  gravar(chave, valor, area = "local") {
    memoria[chave] = valor;
    try { (area === "sessao" ? sessionStorage : localStorage).setItem(chave, JSON.stringify(valor)); } catch { /* usa memória */ }
  },
  remover(chave, area = "local") {
    delete memoria[chave];
    try { (area === "sessao" ? sessionStorage : localStorage).removeItem(chave); } catch { /* ok */ }
  }
};

// CSP bloqueia style="" no HTML; larguras de barras são aplicadas via CSSOM.
// Barras com data-chave lembram a última largura: ao redesenhar a tela, a barra nova
// começa onde a antiga estava e só anima se o valor mudou (não volta a 0%).
const largurasAnteriores = new Map();
export function aplicarBarras(raiz) {
  raiz.querySelectorAll("[data-largura]").forEach(el => {
    const nova = Math.min(100, Number(el.dataset.largura)) + "%";
    const chave = el.dataset.chave;
    const anterior = chave && largurasAnteriores.get(chave);
    if (chave) largurasAnteriores.set(chave, nova);
    if (anterior) {
      el.style.transition = "none";
      el.style.width = anterior;
      void el.offsetWidth;            // aplica a largura anterior sem animação
      el.style.transition = "";
      if (anterior !== nova) requestAnimationFrame(() => { el.style.width = nova; });
    } else {
      requestAnimationFrame(() => { el.style.width = nova; });
    }
  });
}

let timerToast;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("visivel");
  clearTimeout(timerToast);
  timerToast = setTimeout(() => t.classList.remove("visivel"), 3200);
}

// Diálogo de confirmação de agendamento (pede o nome do cidadão)
export function confirmarAgendamento(servico, nomeSugerido = "") {
  const dlg = document.getElementById("dialogo");
  const nome = document.getElementById("dialogoNome");
  const erro = document.getElementById("dialogoErro");
  document.getElementById("dialogoTexto").textContent =
    `${servico.titulo} — ${servico.instituicao} (${NOMES_TURNO[servico.turno]}).`;
  nome.value = nomeSugerido;
  erro.hidden = true;
  dlg.showModal();
  nome.focus();

  return new Promise(resolve => {
    const form = document.getElementById("formDialogo");
    const cancelar = document.getElementById("dialogoCancelar");
    function limpar() { form.removeEventListener("submit", enviar); cancelar.removeEventListener("click", fechar); dlg.removeEventListener("cancel", fechar); }
    function fechar() { limpar(); dlg.close(); resolve(null); }
    function enviar(ev) {
      ev.preventDefault();
      const v = nome.value.trim();
      if (!/^[\p{L}][\p{L} '.-]{1,59}$/u.test(v)) { erro.textContent = "Informe um nome válido (2 a 60 letras)."; erro.hidden = false; return; }
      limpar(); dlg.close(); resolve(v);
    }
    form.addEventListener("submit", enviar);
    cancelar.addEventListener("click", fechar);
    dlg.addEventListener("cancel", fechar);
  });
}
