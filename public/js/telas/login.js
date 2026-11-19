// TELA 5 — Login do gestor (protege o dashboard)
import { api } from "../api.js";

export function render(el) {
  el.innerHTML = `
    <section class="panel login">
      <h2>Acesso do gestor</h2>
      <p class="sub">O dashboard mostra dados agregados das instituições e é restrito a gestores.</p>
      <form id="formLogin" novalidate>
        <label for="usuario">Usuário</label>
        <input id="usuario" autocomplete="username" maxlength="40" />
        <label for="senha">Senha</label>
        <input id="senha" type="password" autocomplete="current-password" maxlength="100" />
        <p class="erro" id="erroLogin" hidden></p>
        <button class="btn-primary" type="submit">Entrar</button>
      </form>
    </section>`;

  el.querySelector("#formLogin").addEventListener("submit", async ev => {
    ev.preventDefault();
    const erro = el.querySelector("#erroLogin");
    erro.hidden = true;
    try {
      await api.login(el.querySelector("#usuario").value.trim(), el.querySelector("#senha").value);
      location.hash = "#/dashboard";
    } catch (e) {
      erro.textContent = e.message;
      erro.hidden = false;
    }
  });
}
