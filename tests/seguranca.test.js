// Testes unitários das práticas de segurança e do simulador IoT
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  validarPerfil, validarReserva, validarLeituraIoT, ErroValidacao, escaparHtml,
  gerarHashSenha, conferirSenha, assinarToken, verificarToken, criarRateLimiter, mascararNome, chaveDispositivoValida
} from "../src/server/seguranca.js";
import { estadoInicial, proximaLeitura } from "../src/iot/simulador.js";

const PERFIL_OK = { cidadao: "Maria Silva", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional", turno_disponivel: "qualquer", descricao_livre: "curso" };

describe("Segurança — validação de entrada", () => {
  test("CT08 — Rejeita nome com script (XSS), opção fora da lista e texto longo", () => {
    assert.throws(() => validarPerfil({ ...PERFIL_OK, cidadao: "<script>alert(1)</script>" }), ErroValidacao);
    assert.throws(() => validarPerfil({ ...PERFIL_OK, turno_disponivel: "madrugada" }), ErroValidacao);
    assert.throws(() => validarPerfil({ ...PERFIL_OK, descricao_livre: "x".repeat(501) }), ErroValidacao);
    assert.throws(() => validarReserva({ id_servico: "SRV-01; DROP TABLE", nome: "Ana" }), ErroValidacao);
    const ok = validarPerfil({ ...PERFIL_OK, cidadao: "  José D'Ávila  ", extra: "ignorado" });
    assert.equal(ok.cidadao, "José D'Ávila");
    assert.equal(ok.extra, undefined, "campos fora da whitelist são descartados");
  });

  test("CT08b — Escape de HTML e LGPD (minimização e máscara)", () => {
    assert.equal(escaparHtml(`<img src=x onerror="a">`), "&lt;img src=x onerror=&quot;a&quot;&gt;");
    assert.equal(validarReserva({ id_servico: "SRV-01", nome: "Maria Aparecida Silva" }).primeiroNome, "Maria");
    assert.equal(mascararNome("Maria"), "M****");
  });
});

describe("Segurança — autenticação", () => {
  test("CT10 — Senha com hash scrypt e token HMAC com expiração", () => {
    const hash = gerarHashSenha("conecta2026");
    assert.ok(!hash.includes("conecta2026"));
    assert.ok(conferirSenha("conecta2026", hash));
    assert.ok(!conferirSenha("errada", hash));

    const segredo = "segredo-teste";
    const token = assinarToken({ sub: "admin", papel: "admin" }, segredo, 60);
    assert.equal(verificarToken(token, segredo).papel, "admin");
    assert.equal(verificarToken(token, "outro-segredo"), null, "assinatura inválida");
    const [corpo, ass] = token.split(".");
    const adulterado = Buffer.from(JSON.stringify({ sub: "x", papel: "admin", exp: 9999999999 })).toString("base64url") + "." + ass;
    assert.equal(verificarToken(adulterado, segredo), null, "payload adulterado");
    assert.equal(verificarToken(token, segredo, Date.now() + 61_000), null, "token expirado");
    assert.ok(corpo.length > 0);
  });

  test("CT13 — Rate limiter bloqueia após o limite e libera na próxima janela", () => {
    const permitido = criarRateLimiter({ janelaMs: 1000, max: 3 });
    assert.deepEqual([1, 2, 3, 4].map(() => permitido("ip", 0)), [true, true, true, false]);
    assert.equal(permitido("ip", 1500), true);
    assert.equal(permitido("outro-ip", 0), true);
  });
});

describe("IoT — sensores simulados", () => {
  test("CT12 — Leituras do simulador são aceitas pelo validador e ocupação fica entre 0 e a capacidade", () => {
    const estado = estadoInicial();
    for (let i = 0; i < 2000; i++) {
      const leitura = proximaLeitura(estado);
      assert.doesNotThrow(() => validarLeituraIoT(leitura));
    }
    assert.ok(Object.values(estado).every(s => s.ocupacao >= 0));
    assert.ok(Object.values(estado).every(s => s.ocupacao <= s.capacidade), "simulador nunca passa da capacidade");
    const sensores = new Set();
    const e2 = estadoInicial();
    for (let i = 0; i < 200; i++) sensores.add(proximaLeitura(e2).sensor);
    assert.deepEqual([...sensores].sort(), ["fluxo", "temperatura"], "2 tipos de sensor");
  });

  test("CT12b — Validador IoT rejeita sala, sensor e temperatura inválidos; chave comparada com segurança", () => {
    assert.throws(() => validarLeituraIoT({ sala: "COZINHA", sensor: "fluxo", evento: "entrada" }), ErroValidacao);
    assert.throws(() => validarLeituraIoT({ sala: "SALA-A", sensor: "fumaça" }), ErroValidacao);
    assert.throws(() => validarLeituraIoT({ sala: "SALA-A", sensor: "temperatura", valor: 500 }), ErroValidacao);
    assert.ok(chaveDispositivoValida("abc", "abc"));
    assert.ok(!chaveDispositivoValida("abd", "abc"));
    assert.ok(!chaveDispositivoValida(undefined, "abc"));
  });
});
