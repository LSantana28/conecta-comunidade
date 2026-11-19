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
// Mesma validação de CPF do servidor (dígitos verificadores) para avisar antes de enviar
export function cpfValido(valor) {
  const d = String(valor ?? "").replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = n => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function mascaraCpf(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

// Diálogo de agendamento: devolve { nome, documento } ou null se cancelado
export function confirmarAgendamento(servico, nomeSugerido = "") {
  const dlg = document.getElementById("dialogo");
  const nome = document.getElementById("dialogoNome");
  const documento = document.getElementById("dialogoDocumento");
  documento.value = "";
  documento.oninput = () => { documento.value = mascaraCpf(documento.value); };
  const erro = document.getElementById("dialogoErro");
  document.getElementById("dialogoTexto").textContent =
    `${servico.titulo} — ${servico.instituicao} (${NOMES_TURNO[servico.turno]}).`;
  nome.value = nomeSugerido;
  erro.hidden = true;
  dlg.showModal();
  (nomeSugerido ? documento : nome).focus();

  return new Promise(resolve => {
    const form = document.getElementById("formDialogo");
    const cancelar = document.getElementById("dialogoCancelar");
    function limpar() { form.removeEventListener("submit", enviar); cancelar.removeEventListener("click", fechar); dlg.removeEventListener("cancel", fechar); }
    function fechar() { limpar(); dlg.close(); resolve(null); }
    function enviar(ev) {
      ev.preventDefault();
      const v = nome.value.trim();
      if (!/^[\p{L}][\p{L} '.-]{1,59}$/u.test(v)) { erro.textContent = "Informe um nome válido (2 a 60 letras)."; erro.hidden = false; return; }
      if (!cpfValido(documento.value)) { erro.textContent = "Informe um CPF válido."; erro.hidden = false; documento.focus(); return; }
      const doc = documento.value.replace(/\D/g, "");
      documento.value = ""; // não deixa o CPF na tela depois de enviar
      limpar(); dlg.close(); resolve({ nome: v, documento: doc });
    }
    form.addEventListener("submit", enviar);
    cancelar.addEventListener("click", fechar);
    dlg.addEventListener("cancel", fechar);
  });
}
