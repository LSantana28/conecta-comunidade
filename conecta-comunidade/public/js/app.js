// Roteador da SPA (hash routing) — cada tela é um módulo com render(container) e opcional destruir()
import * as recomendacoes from "./telas/recomendacoes.js";
import * as catalogo from "./telas/catalogo.js";
import * as agendamentos from "./telas/agendamentos.js";
import * as dashboard from "./telas/dashboard.js";
import * as login from "./telas/login.js";
import * as analises from "./telas/analises.js";
import { api } from "./api.js";

const telas = { recomendacoes, catalogo, agendamentos, dashboard, analises, login };
const PROTEGIDAS = ["dashboard", "analises"];
let destinoAposLogin = "dashboard";
let telaAtual = null;

async function navegar() {
  let rota = location.hash.replace(/^#\/?/, "") || "recomendacoes";
  if (!telas[rota]) rota = "recomendacoes";
  if (PROTEGIDAS.includes(rota) && !api.logado()) { destinoAposLogin = rota; location.hash = "#/login"; return; }

  telaAtual?.destruir?.();
  document.querySelectorAll(".abas a").forEach(a => a.classList.toggle("ativa", a.dataset.rota === (rota === "login" ? destinoAposLogin : rota)));

  const container = document.getElementById("tela");
  container.innerHTML = "";
  telaAtual = telas[rota];
  await telaAtual.render(container, { destinoAposLogin });
  container.focus({ preventScroll: true });
}

window.addEventListener("hashchange", navegar);
navegar();
