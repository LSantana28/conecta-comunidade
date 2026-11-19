// Roteador da SPA (hash routing) — cada tela é um módulo com render(container) e opcional destruir()
import * as recomendacoes from "./telas/recomendacoes.js";
import * as catalogo from "./telas/catalogo.js";
import * as agendamentos from "./telas/agendamentos.js";
import * as dashboard from "./telas/dashboard.js";
import * as login from "./telas/login.js";
import { api } from "./api.js";

const telas = { recomendacoes, catalogo, agendamentos, dashboard, login };
let telaAtual = null;

async function navegar() {
  let rota = location.hash.replace(/^#\/?/, "") || "recomendacoes";
  if (!telas[rota]) rota = "recomendacoes";
  if (rota === "dashboard" && !api.logado()) { location.hash = "#/login"; return; }

  telaAtual?.destruir?.();
  document.querySelectorAll(".abas a").forEach(a => a.classList.toggle("ativa", a.dataset.rota === (rota === "login" ? "dashboard" : rota)));

  const container = document.getElementById("tela");
  container.innerHTML = "";
  telaAtual = telas[rota];
  await telaAtual.render(container);
  container.focus({ preventScroll: true });
}

window.addEventListener("hashchange", navegar);
navegar();
