// Testes de integração da API (sobe o servidor real em porta aleatória)
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { criarApp } from "../src/server/app.js";
import { gerarHashSenha } from "../src/server/seguranca.js";

const CONFIG = {
  adminUser: "admin", adminPasswordHash: gerarHashSenha("senha-teste"),
  tokenSecret: "segredo-teste", iotDeviceKey: "chave-teste", log: false
};
let server, base;

async function req(metodo, caminho, corpo, headers = {}) {
  const r = await fetch(base + caminho, {
    method: metodo, headers: { "Content-Type": "application/json", ...headers },
    body: corpo === undefined ? undefined : (typeof corpo === "string" ? corpo : JSON.stringify(corpo))
  });
  const texto = await r.text();
  let dados; try { dados = JSON.parse(texto); } catch { dados = texto; }
  return { status: r.status, dados, headers: r.headers };
}

const PERFIL = {
  cidadao: "Maria Silva", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional",
  turno_disponivel: "qualquer", descricao_livre: "Quero melhorar meu currículo e fazer cursos gratuitos."
};

before(async () => {
  server = http.createServer(criarApp(CONFIG).handler);
  await new Promise(r => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(r => server.close(r)));

describe("API — fluxo do cidadão", () => {
  test("CT06 — Fluxo completo: recomendar → reservar (saldo -1) → consultar → cancelar (saldo +1)", async () => {
    const rec = await req("POST", "/api/recomendacoes", PERFIL);
    assert.equal(rec.status, 200);
    assert.equal(rec.dados.entrada.cidadao, "M******", "nome mascarado na resposta/log");
    const escolhido = rec.dados.saida.recomendacoes[0];

    const antes = (await req("GET", "/api/servicos")).dados.servicos.find(s => s.id === escolhido.id_servico).vagas;
    const reserva = await req("POST", "/api/reservas", { id_servico: escolhido.id_servico, nome: "Maria Silva" });
    assert.equal(reserva.status, 201);
    assert.match(reserva.dados.reserva.protocolo, /^CC-[0-9A-F]{6}$/);
    assert.equal(reserva.dados.reserva.primeiroNome, "Maria", "só o primeiro nome é guardado (LGPD)");
    assert.equal(reserva.dados.vagasRestantes, antes - 1, "Regra 4: baixa imediata no saldo");

    const p = reserva.dados.reserva.protocolo;
    assert.equal((await req("GET", `/api/reservas/${p}`)).dados.reserva.status, "confirmada");
    const canc = await req("POST", `/api/reservas/${p}/cancelar`);
    assert.equal(canc.status, 200);
    const depois = (await req("GET", "/api/servicos")).dados.servicos.find(s => s.id === escolhido.id_servico).vagas;
    assert.equal(depois, antes, "cancelamento devolve a vaga");
    assert.equal((await req("POST", `/api/reservas/${p}/cancelar`)).status, 409, "não cancela duas vezes");
  });

  test("CT07 — Serviço esgotado retorna 409 e some das recomendações", async () => {
    let ultima;
    for (let i = 0; i < 4; i++) ultima = await req("POST", "/api/reservas", { id_servico: "SRV-06", nome: "Pessoa Teste" });
    assert.equal(ultima.dados.vagasRestantes, 0);
    const extra = await req("POST", "/api/reservas", { id_servico: "SRV-06", nome: "Pessoa Teste" });
    assert.equal(extra.status, 409);
    const rec = await req("POST", "/api/recomendacoes", { ...PERFIL, situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico", descricao_livre: "apoio jurídico advogado" });
    assert.ok(!rec.dados.saida.recomendacoes.some(r => r.id_servico === "SRV-06"));
  });

  test("CT08c — API devolve 400 com os campos inválidos, 400 para JSON malformado e 413 para corpo grande", async () => {
    const r = await req("POST", "/api/recomendacoes", { ...PERFIL, cidadao: "<b>x</b>", turno_disponivel: "x" });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.dados.campos).sort(), ["cidadao", "turno_disponivel"]);
    assert.equal((await req("POST", "/api/recomendacoes", "{malformado")).status, 400);
    assert.equal((await req("POST", "/api/recomendacoes", { ...PERFIL, descricao_livre: "a".repeat(20_000) })).status, 413);
  });
});

describe("API — segurança e gestão", () => {
  test("CT09 — Dashboard exige login: sem token 401, senha errada 401, login correto 200", async () => {
    assert.equal((await req("GET", "/api/admin/dashboard")).status, 401);
    assert.equal((await req("GET", "/api/admin/dashboard", undefined, { Authorization: "Bearer falso.token" })).status, 401);
    assert.equal((await req("POST", "/api/auth/login", { usuario: "admin", senha: "errada" })).status, 401);
    const login = await req("POST", "/api/auth/login", { usuario: "admin", senha: "senha-teste" });
    assert.equal(login.status, 200);
    const dash = await req("GET", "/api/admin/dashboard", undefined, { Authorization: `Bearer ${login.dados.token}` });
    assert.equal(dash.status, 200);
    assert.ok(dash.dados.totais.vagasOfertadas > 0);
    assert.ok(dash.dados.demandaPorInteresse["Capacitação profissional"] >= 1, "demanda registrada pelas buscas");
    const reservas = await req("GET", "/api/admin/reservas", undefined, { Authorization: `Bearer ${login.dados.token}` });
    assert.ok(reservas.dados.reservas.every(r => r.primeiroNome.includes("*")), "nomes mascarados para o gestor");
  });

  test("CT11 — IoT: sem chave 401; com chave atualiza ocupação e gera alertas de lotação, excesso e temperatura", async () => {
    const semChave = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "fluxo", evento: "entrada" });
    assert.equal(semChave.status, 401);
    const H = { "X-Device-Key": "chave-teste" };
    let r;
    for (let i = 0; i < 10; i++) r = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "fluxo", evento: "entrada" }, H);
    assert.equal(r.status, 201);
    assert.equal(r.dados.sala.ocupacao, 10);
    assert.ok(r.dados.sala.alertas.includes("Lotação máxima atingida"));
    r = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "fluxo", evento: "entrada" }, H);
    assert.equal(r.dados.sala.ocupacao, 11, "sensor registra a contagem real");
    assert.ok(r.dados.sala.alertas.some(a => a.startsWith("Lotação excedida: 1 pessoa")));
    r = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "fluxo", evento: "saida" }, H);
    r = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "temperatura", valor: 31.5 }, H);
    assert.ok(r.dados.sala.alertas.some(a => a.startsWith("Temperatura acima")));
    r = await req("POST", "/api/iot/leituras", { sala: "SALA-C", sensor: "fluxo", evento: "saida" }, H);
    assert.equal(r.dados.sala.ocupacao, 9);
    const catalogo = await req("GET", "/api/servicos");
    assert.equal(catalogo.dados.servicos.find(s => s.id === "SRV-03").ocupacaoSala.ocupacao, 9, "catálogo mostra ocupação IoT");
  });

  test("CT13b — Login bloqueado (429) após 10 tentativas por minuto", async () => {
    let ultimo;
    for (let i = 0; i < 11; i++) ultimo = await req("POST", "/api/auth/login", { usuario: "x", senha: "y" });
    assert.equal(ultimo.status, 429);
  });

  test("CT14 — Cabeçalhos de segurança (CSP etc.) e bloqueio de path traversal", async () => {
    const r = await req("GET", "/");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff");
    assert.equal(r.headers.get("x-frame-options"), "DENY");
    const trav = await req("GET", "/%2e%2e/package.json");
    assert.ok([403, 404].includes(trav.status));
    assert.ok(typeof trav.dados !== "string" || !trav.dados.includes("conecta-comunidade"));
  });

  test("CT15 — Monitoramento: /health responde ok e /metrics expõe métricas no formato Prometheus", async () => {
    const h = await req("GET", "/health");
    assert.equal(h.dados.status, "ok");
    const m = await req("GET", "/metrics");
    assert.match(m.dados, /conecta_reservas_total \d+/);
    assert.match(m.dados, /conecta_vagas_disponiveis\{servico="SRV-01"\} \d+/);
    assert.match(m.dados, /conecta_ocupacao_sala\{sala="SALA-C"\} 9/);
  });
});
