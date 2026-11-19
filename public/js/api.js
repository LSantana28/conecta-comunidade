// Cliente da API REST
import { armazenamento } from "./util.js";

const CHAVE_TOKEN = "conecta.token";
const CHAVE_RESERVAS = "conecta.reservas";

async function chamar(metodo, url, corpo, autenticado = false) {
  const headers = { "Content-Type": "application/json" };
  if (autenticado) {
    const token = armazenamento.ler(CHAVE_TOKEN, null, "sessao");
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const resp = await fetch(url, { method: metodo, headers, body: corpo ? JSON.stringify(corpo) : undefined });
  const dados = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const erro = new Error(dados.erro || `Erro ${resp.status}`);
    erro.status = resp.status;
    erro.campos = dados.campos;
    throw erro;
  }
  return dados;
}

export const api = {
  servicos: () => chamar("GET", "/api/servicos"),
  recomendar: perfil => chamar("POST", "/api/recomendacoes", perfil),
  reservar: (id_servico, nome) => chamar("POST", "/api/reservas", { id_servico, nome }),
  reserva: protocolo => chamar("GET", `/api/reservas/${encodeURIComponent(protocolo)}`),
  cancelar: protocolo => chamar("POST", `/api/reservas/${encodeURIComponent(protocolo)}/cancelar`),
  salas: () => chamar("GET", "/api/iot/salas"),
  dashboard: () => chamar("GET", "/api/admin/dashboard", null, true),
  async login(usuario, senha) {
    const { token } = await chamar("POST", "/api/auth/login", { usuario, senha });
    armazenamento.gravar(CHAVE_TOKEN, token, "sessao");
  },
  logout() { armazenamento.remover(CHAVE_TOKEN, "sessao"); },
  logado() { return Boolean(armazenamento.ler(CHAVE_TOKEN, null, "sessao")); }
};

// Protocolos das reservas feitas neste navegador
export const minhasReservas = {
  listar: () => armazenamento.ler(CHAVE_RESERVAS, []),
  adicionar(protocolo) {
    const atual = minhasReservas.listar().filter(p => p !== protocolo);
    armazenamento.gravar(CHAVE_RESERVAS, [protocolo, ...atual].slice(0, 20));
  },
  remover(protocolo) { armazenamento.gravar(CHAVE_RESERVAS, minhasReservas.listar().filter(p => p !== protocolo)); }
};

export async function agendar(servico, nome) {
  const { reserva, vagasRestantes } = await api.reservar(servico.id, nome);
  minhasReservas.adicionar(reserva.protocolo);
  return { reserva, vagasRestantes };
}
