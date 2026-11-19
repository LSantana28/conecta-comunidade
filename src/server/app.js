// Servidor HTTP sem dependências externas: API REST + arquivos estáticos do frontend.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { avaliar } from "../core/recomendacao.js";
import { NOMES_TURNO } from "../core/catalogo.js";
import { criarStore } from "./store.js";
import {
  validarPerfil, validarReserva, validarLeituraIoT, ErroValidacao,
  conferirSenha, gerarHashSenha, assinarToken, verificarToken,
  chaveDispositivoValida, CABECALHOS_SEGURANCA, criarRateLimiter, mascararNome
} from "./seguranca.js";

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const LIMITE_CORPO = 10 * 1024; // 10 KB
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".json": "application/json" };

export function carregarConfig(env = process.env) {
  const producao = env.NODE_ENV === "production";
  if (producao && (!env.ADMIN_PASSWORD_HASH || !env.TOKEN_SECRET || !env.IOT_DEVICE_KEY)) {
    throw new Error("Em produção defina ADMIN_PASSWORD_HASH, TOKEN_SECRET e IOT_DEVICE_KEY.");
  }
  return {
    adminUser: env.ADMIN_USER || "admin",
    // Senha padrão SOMENTE para desenvolvimento/demonstração
    adminPasswordHash: env.ADMIN_PASSWORD_HASH || gerarHashSenha("conecta2026"),
    tokenSecret: env.TOKEN_SECRET || crypto.randomBytes(32).toString("hex"),
    iotDeviceKey: env.IOT_DEVICE_KEY || "dev-iot-key",
    log: env.LOG !== "off"
  };
}

export function criarApp(config = carregarConfig()) {
  const store = criarStore();
  const limiteGeral = criarRateLimiter({ janelaMs: 60_000, max: 300 });
  const limiteLogin = criarRateLimiter({ janelaMs: 60_000, max: 10 });
  const limiteIoT = criarRateLimiter({ janelaMs: 60_000, max: 6000 }); // gateways enviam muitas leituras

  function enviar(res, status, dados, extras = {}) {
    const corpo = typeof dados === "string" ? dados : JSON.stringify(dados);
    res.writeHead(status, {
      "Content-Type": typeof dados === "string" ? "text/plain; version=0.0.4; charset=utf-8" : "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CABECALHOS_SEGURANCA,
      ...extras
    });
    res.end(corpo);
  }

  function lerCorpo(req) {
    return new Promise((resolve, reject) => {
      let tamanho = 0, excedeu = false; const partes = [];
      req.on("data", c => {
        if (excedeu) return; // descarta o restante sem acumular em memória
        tamanho += c.length;
        if (tamanho > LIMITE_CORPO) { excedeu = true; partes.length = 0; reject(Object.assign(new Error("Corpo muito grande"), { status: 413 })); return; }
        partes.push(c);
      });
      req.on("end", () => {
        if (excedeu) return;
        if (!partes.length) return resolve({});
        try { resolve(JSON.parse(Buffer.concat(partes).toString("utf8"))); }
        catch { reject(Object.assign(new Error("JSON inválido"), { status: 400 })); }
      });
      req.on("error", reject);
    });
  }

  function exigirAdmin(req) {
    const auth = req.headers.authorization ?? "";
    const payload = verificarToken(auth.startsWith("Bearer ") ? auth.slice(7) : "", config.tokenSecret);
    if (!payload || payload.papel !== "admin") throw Object.assign(new Error("Não autorizado"), { status: 401 });
    return payload;
  }

  async function servirEstatico(req, res, pathname) {
    const relativo = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
    const alvo = path.resolve(PUBLIC_DIR, relativo);
    if (!alvo.startsWith(PUBLIC_DIR + path.sep)) return enviar(res, 403, { erro: "Acesso negado" }); // path traversal
    try {
      const conteudo = await readFile(alvo);
      res.writeHead(200, { "Content-Type": TIPOS[path.extname(alvo)] ?? "application/octet-stream", ...CABECALHOS_SEGURANCA });
      res.end(conteudo);
    } catch {
      enviar(res, 404, { erro: "Não encontrado" });
    }
  }

  const rotas = {
    "GET /health": () => [200, { status: "ok", uptimeSegundos: Math.round((Date.now() - store.metricas.inicio) / 1000), versao: "1.0.0" }],

    "GET /metrics": () => {
      const m = store.metricas;
      const linhas = [
        ["conecta_requisicoes_total", m.requisicoes], ["conecta_erros_total", m.erros],
        ["conecta_recomendacoes_total", m.recomendacoes], ["conecta_reservas_total", m.reservas],
        ["conecta_cancelamentos_total", m.cancelamentos], ["conecta_leituras_iot_total", m.leiturasIoT],
        ...store.listarServicos().map(s => [`conecta_vagas_disponiveis{servico="${s.id}"}`, s.vagas]),
        ...store.estadoSalas().map(s => [`conecta_ocupacao_sala{sala="${s.sala}"}`, s.ocupacao])
      ];
      return [200, linhas.map(([k, v]) => `${k} ${v}`).join("\n") + "\n"];
    },

    "GET /api/servicos": () => [200, { servicos: store.listarServicos().map(({ tags, justificativaBase, ...s }) => ({ ...s, descricao: justificativaBase })) }],

    "POST /api/recomendacoes": async req => {
      const entrada = validarPerfil(await lerCorpo(req));
      const saida = avaliar(entrada, store.listarServicos(), NOMES_TURNO);
      store.registrarBusca(entrada.interesse_principal, saida.recomendacoes);
      return [200, { entrada: { ...entrada, cidadao: mascararNome(entrada.cidadao) }, saida }];
    },

    "POST /api/reservas": async req => {
      const dados = validarReserva(await lerCorpo(req));
      const r = store.reservar(dados);
      return r.erro ? [r.status, { erro: r.erro }] : [201, r];
    },

    "POST /api/auth/login": async (req, _res, ip) => {
      if (!limiteLogin(ip)) return [429, { erro: "Muitas tentativas. Aguarde 1 minuto." }];
      const { usuario, senha } = await lerCorpo(req);
      const ok = usuario === config.adminUser && typeof senha === "string" && conferirSenha(senha, config.adminPasswordHash);
      if (!ok) return [401, { erro: "Usuário ou senha incorretos." }];
      return [200, { token: assinarToken({ sub: usuario, papel: "admin" }, config.tokenSecret, 3600), expiraEmSegundos: 3600 }];
    },

    "GET /api/admin/dashboard": req => { exigirAdmin(req); return [200, store.dashboard()]; },

    "GET /api/admin/reservas": req => {
      exigirAdmin(req);
      return [200, { reservas: store.listarReservas().map(r => ({ ...r, primeiroNome: mascararNome(r.primeiroNome) })) }];
    },

    "POST /api/iot/leituras": async req => {
      if (!chaveDispositivoValida(req.headers["x-device-key"], config.iotDeviceKey)) return [401, { erro: "Dispositivo não autorizado." }];
      const r = store.registrarLeitura(validarLeituraIoT(await lerCorpo(req)));
      return r.erro ? [r.status, { erro: r.erro }] : [201, r];
    },

    "GET /api/iot/salas": () => [200, { salas: store.estadoSalas() }]
  };

  async function handler(req, res) {
    const inicio = Date.now();
    const ip = req.socket.remoteAddress ?? "desconhecido";
    const { pathname } = new URL(req.url, "http://localhost");
    store.metricas.requisicoes += 1;

    res.on("finish", () => {
      if (res.statusCode >= 500) store.metricas.erros += 1;
      if (config.log) console.log(JSON.stringify({ t: new Date().toISOString(), m: req.method, p: pathname, s: res.statusCode, ms: Date.now() - inicio }));
    });

    try {
      const permitido = pathname === "/api/iot/leituras" ? limiteIoT(ip) : limiteGeral(ip);
      if (!permitido) return enviar(res, 429, { erro: "Limite de requisições excedido." });

      const chave = `${req.method} ${pathname}`;
      if (rotas[chave]) {
        const [status, dados] = await rotas[chave](req, res, ip);
        return enviar(res, status, dados);
      }

      const mReserva = pathname.match(/^\/api\/reservas\/(CC-[0-9A-F]{6})(\/cancelar)?$/);
      if (mReserva) {
        if (req.method === "GET" && !mReserva[2]) {
          const r = store.buscarReserva(mReserva[1]);
          return r ? enviar(res, 200, { reserva: r }) : enviar(res, 404, { erro: "Reserva não encontrada." });
        }
        if (req.method === "POST" && mReserva[2]) {
          const r = store.cancelar(mReserva[1]);
          return r.erro ? enviar(res, r.status, { erro: r.erro }) : enviar(res, 200, r);
        }
      }

      if (pathname.startsWith("/api/")) return enviar(res, 404, { erro: "Rota não encontrada." });
      if (req.method === "GET") return servirEstatico(req, res, pathname);
      return enviar(res, 405, { erro: "Método não permitido." });
    } catch (e) {
      if (e instanceof ErroValidacao) return enviar(res, 400, { erro: e.message, campos: e.campos });
      if (e.status) return enviar(res, e.status, { erro: e.message });
      console.error(e);
      return enviar(res, 500, { erro: "Erro interno." });
    }
  }

  return { handler, store, config };
}
