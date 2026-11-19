// Práticas de segurança do MVP (Área 4 — item Segurança)
// 1. Validação de entrada (whitelist + limites de tamanho) em toda rota que recebe dados
// 2. Autenticação do painel administrativo: senha com hash scrypt + token assinado (HMAC-SHA256) com expiração
// 3. Autenticação dos dispositivos IoT por chave (X-Device-Key), comparada em tempo constante
// 4. Cabeçalhos de segurança (CSP, nosniff, frame-deny) e rate limiting por IP
// 5. Proteção de dados (LGPD): minimização — só guardamos primeiro nome + protocolo; logs mascarados
import crypto from "node:crypto";

// ---------- 1. Validação ----------
export const OPCOES = {
  situacao_atual: [
    "Procurando emprego",
    "Buscando renda extra / empreender",
    "Precisando de atendimento social ou jurídico",
    "Querendo aprender novas habilidades"
  ],
  interesse_principal: ["Capacitação profissional", "Geração de renda", "Apoio social e jurídico"],
  turno_disponivel: ["qualquer", "manha", "tarde", "noite"]
};

const NOME_REGEX = /^[\p{L}][\p{L} '.-]{1,59}$/u;
const ID_SERVICO_REGEX = /^SRV-\d{2}$/;
const SALA_REGEX = /^SALA-[A-Z]$/;

export class ErroValidacao extends Error {
  constructor(campos) {
    super("Dados inválidos");
    this.status = 400;
    this.campos = campos;
  }
}

function texto(v) { return typeof v === "string" ? v.trim() : ""; }

export function validarPerfil(body) {
  const erros = {};
  const cidadao = texto(body?.cidadao);
  const descricao = texto(body?.descricao_livre);
  if (!NOME_REGEX.test(cidadao)) erros.cidadao = "Informe um nome com 2 a 60 letras.";
  for (const campo of ["situacao_atual", "interesse_principal", "turno_disponivel"]) {
    if (!OPCOES[campo].includes(body?.[campo])) erros[campo] = "Opção inválida.";
  }
  if (descricao.length > 500) erros.descricao_livre = "Máximo de 500 caracteres.";
  if (Object.keys(erros).length) throw new ErroValidacao(erros);
  return {
    cidadao,
    situacao_atual: body.situacao_atual,
    interesse_principal: body.interesse_principal,
    turno_disponivel: body.turno_disponivel,
    descricao_livre: descricao
  };
}

export function validarReserva(body) {
  const erros = {};
  const nome = texto(body?.nome);
  if (!ID_SERVICO_REGEX.test(texto(body?.id_servico))) erros.id_servico = "Serviço inválido.";
  if (!NOME_REGEX.test(nome)) erros.nome = "Informe um nome com 2 a 60 letras.";
  if (Object.keys(erros).length) throw new ErroValidacao(erros);
  // LGPD — minimização: só o primeiro nome é armazenado
  return { id_servico: body.id_servico.trim(), primeiroNome: nome.split(/\s+/)[0] };
}

export function validarLeituraIoT(body) {
  const erros = {};
  const sala = texto(body?.sala);
  if (!SALA_REGEX.test(sala)) erros.sala = "Sala inválida.";
  if (!["fluxo", "temperatura"].includes(body?.sensor)) erros.sensor = "Sensor deve ser 'fluxo' ou 'temperatura'.";
  if (body?.sensor === "fluxo") {
    if (!["entrada", "saida"].includes(body?.evento)) erros.evento = "Evento deve ser 'entrada' ou 'saida'.";
  }
  if (body?.sensor === "temperatura") {
    const v = Number(body?.valor);
    if (!Number.isFinite(v) || v < -20 || v > 70) erros.valor = "Temperatura fora da faixa (-20 a 70 °C).";
  }
  if (Object.keys(erros).length) throw new ErroValidacao(erros);
  return body.sensor === "fluxo"
    ? { sala, sensor: "fluxo", evento: body.evento }
    : { sala, sensor: "temperatura", valor: Math.round(Number(body.valor) * 10) / 10 };
}

// Escapa HTML — usado no frontend também (copiado em public/js/util.js)
export function escaparHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function mascararNome(nome) {
  const n = String(nome ?? "");
  return n.length <= 1 ? "*" : n[0] + "*".repeat(Math.min(n.length - 1, 6));
}

// ---------- 2. Senha + token ----------
export function gerarHashSenha(senha, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(senha, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function conferirSenha(senha, hashArmazenado) {
  const [salt, hash] = String(hashArmazenado).split(":");
  if (!salt || !hash) return false;
  const calc = crypto.scryptSync(String(senha), salt, 64);
  const esperado = Buffer.from(hash, "hex");
  return esperado.length === calc.length && crypto.timingSafeEqual(calc, esperado);
}

const b64url = buf => Buffer.from(buf).toString("base64url");

export function assinarToken(payload, segredo, ttlSegundos = 3600, agora = Date.now()) {
  const corpo = b64url(JSON.stringify({ ...payload, exp: Math.floor(agora / 1000) + ttlSegundos }));
  const assinatura = crypto.createHmac("sha256", segredo).update(corpo).digest("base64url");
  return `${corpo}.${assinatura}`;
}

export function verificarToken(token, segredo, agora = Date.now()) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [corpo, assinatura] = token.split(".");
  const esperada = crypto.createHmac("sha256", segredo).update(corpo).digest("base64url");
  const a = Buffer.from(assinatura ?? ""), b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(corpo, "base64url").toString());
    if (payload.exp * 1000 < agora) return null;
    return payload;
  } catch { return null; }
}

// ---------- 3. Chave de dispositivo IoT ----------
export function chaveDispositivoValida(recebida, esperada) {
  const a = Buffer.from(String(recebida ?? "")), b = Buffer.from(String(esperada));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- 4. Cabeçalhos + rate limit ----------
export const CABECALHOS_SEGURANCA = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin"
};

export function criarRateLimiter({ janelaMs = 60_000, max = 120 } = {}) {
  const hits = new Map();
  return function permitido(chave, agora = Date.now()) {
    const reg = hits.get(chave);
    if (!reg || agora - reg.inicio > janelaMs) {
      hits.set(chave, { inicio: agora, total: 1 });
      return true;
    }
    reg.total += 1;
    return reg.total <= max;
  };
}
