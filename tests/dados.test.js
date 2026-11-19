// Testes da camada de Big Data: ingestão, ETL (bronze → prata → ouro), medidas e API de análises
import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { criarIngestor, pseudonimizar } from "../src/dados/ingestao.js";
import { executarETL } from "../src/dados/etl.js";
import { gerarHistorico } from "../src/dados/gerar-historico.js";
import { criarAnalises } from "../src/dados/analises.js";
import { validarEvento } from "../src/dados/esquema.js";
import * as M from "../src/dados/medidas.js";
import { criarApp } from "../src/server/app.js";
import { gerarHashSenha } from "../src/server/seguranca.js";
import { gerarCpf } from "./apoio.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lake-"));
const lerJsonl = arq => fs.readFileSync(arq, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
const H = "a1b2c3d4e5f60718";

function linha(id, tipo, ocorrido_em, dados) { return JSON.stringify({ evento_id: id, tipo, origem: "teste", ocorrido_em, ingerido_em: ocorrido_em, dados }); }

describe("Funções analíticas (equivalentes DAX)", () => {
  test("CT16 — DIVIDE, PERCENTILE, média móvel, variação, DATEADD e RANKX", () => {
    assert.equal(M.dividir(1, 0), null, "divisão por zero devolve o alternativo");
    assert.equal(M.dividir(1, 0, 0), 0);
    assert.equal(M.dividir(3, 4), 0.75);
    assert.equal(M.percentil([1, 2, 3, 4, 5], 0.9), 4.6);
    assert.deepEqual(M.mediaMovel([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
    assert.equal(M.variacao(110, 100), 0.1);
    assert.equal(M.variacao(5, 0), null, "sem base não há variação");
    assert.deepEqual(M.periodoAnterior("2026-11-01", "2026-11-30"), { inicio: "2026-10-02", fim: "2026-10-31", dias: 30 });
    assert.deepEqual(M.rankear([{ v: 0.5 }, { v: 0.9 }, { v: 0.5 }], "v").map(x => x.rank_v), [2, 1, 2], "ranking denso");
    assert.equal(M.mediaX([{ x: 2 }, { x: null }, { x: 4 }], r => r.x), 3, "ignora vazios como o AVERAGEX");
    assert.equal(M.diasSobrepostos("2026-01-01", "2026-01-30", "2026-01-25", "2026-02-10"), 6);
  });
});

describe("Ingestão (camada bronze)", () => {
  test("CT17 — Grava eventos particionados por tipo/data e nunca grava dado pessoal", async () => {
    const dir = tmp();
    const ing = criarIngestor({ dir, segredo: "s" });
    const quando = new Date("2026-11-19T13:00:00Z"); // 10h em São Paulo
    ing.registrar("busca", { perfil_hash: ing.pseudonimo("Maria Silva"), interesse: "Geração de renda", turno: "noite", recomendados: [] }, quando);
    await ing.esvaziar();
    const arq = path.join(dir, "bronze", "busca", "dt=2026-11-19", "eventos.jsonl");
    const [ev] = lerJsonl(arq);
    assert.equal(ev.ocorrido_em, "2026-11-19T10:00:00-03:00");
    assert.ok(validarEvento(ev).ok);
    assert.ok(!fs.readFileSync(arq, "utf8").includes("Maria"), "nome não chega ao data lake");
    assert.equal(pseudonimizar("Maria Silva", "s"), pseudonimizar("  MARIA   silva ", "s"), "pseudônimo estável para o mesmo cidadão");
    assert.notEqual(pseudonimizar("Maria Silva", "s"), pseudonimizar("Maria Silva", "outro"), "depende do segredo");
  });
});

describe("ETL bronze → prata → ouro", () => {
  let dir, cat;
  before(async () => {
    dir = tmp();
    const p = path.join(dir, "bronze", "teste", "dt=2026-11-10");
    fs.mkdirSync(p, { recursive: true });
    const linhas = [
      linha("busca-0001", "busca", "2026-11-10T09:00:00-03:00", { perfil_hash: H, situacao: "Procurando emprego", interesse: "Capacitação profissional", turno: "manha", recomendados: [{ servico_id: "SRV-01", score: 90, posicao: 1 }] }),
      linha("busca-0001", "busca", "2026-11-10T09:00:00-03:00", { perfil_hash: H, situacao: "Procurando emprego", interesse: "Capacitação profissional", turno: "manha", recomendados: [{ servico_id: "SRV-01", score: 90, posicao: 1 }] }), // duplicado
      linha("reserva-01", "reserva", "2026-11-10 09:20:00", { perfil_hash: H, servico_id: "SRV-01", resultado: "confirmada", reserva_id: "CC-AAAAAA" }), // data legada
      linha("reserva-02", "reserva", "2026-11-10T15:00:00-03:00", { perfil_hash: "ffffffffffffffff", servico_id: "SRV-06", resultado: "sem_vaga", reserva_id: null }),
      linha("presenca-1", "presenca", "2026-11-12T08:00:00-03:00", { reserva_id: "CC-AAAAAA" }),
      linha("iot-000001", "leitura_iot", "2026-11-10T10:00:00-03:00", { sala: "SALA-C", sensor: "fluxo", evento: "entrada" }),
      linha("iot-000002", "leitura_iot", "2026-11-10T10:30:00-03:00", { sala: "SALA-C", sensor: "fluxo", evento: "entrada" }),
      linha("iot-000003", "leitura_iot", "2026-11-10T11:00:00-03:00", { sala: "SALA-C", sensor: "fluxo", evento: "saida" }),
      linha("iot-000004", "leitura_iot", "2026-11-10T10:15:00-03:00", { sala: "SALA-C", sensor: "temperatura", valor: 31.2 }),
      linha("iot-000005", "leitura_iot", "2026-11-10T10:16:00-03:00", { sala: "SALA-C", sensor: "temperatura", valor: 999 }), // sensor com defeito
      linha("iot-000006", "leitura_iot", "2026-11-10T10:17:00-03:00", { sala: "SALA-Z", sensor: "fluxo", evento: "entrada" }), // sala inexistente
      '{"evento_id":"truncado","tipo":"bus'                                                                                           // JSON quebrado
    ];
    fs.writeFileSync(path.join(p, "eventos.jsonl"), linhas.join("\n") + "\n");
    cat = await executarETL(dir);
  });
  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  test("CT18 — Qualidade: remove duplicados, normaliza datas e manda inválidos para a quarentena", () => {
    const q = cat.qualidade;
    assert.equal(q.lidos, 12);
    assert.equal(q.duplicados, 1);
    assert.equal(q.datasNormalizadas, 1);
    assert.equal(q.rejeitados, 3);
    assert.deepEqual(q.motivos, { temperatura_fora_da_faixa: 1, sala_invalida: 1, json_invalido: 1 });
    assert.equal(lerJsonl(path.join(dir, "quarentena", "rejeitados.jsonl")).length, 3);
    assert.equal(lerJsonl(path.join(dir, "prata", "busca.jsonl")).length, 1);
  });

  test("CT19 — Ouro: status final, atribuição à recomendação e ocupação reconstruída pelo tempo", () => {
    const ouro = n => JSON.parse(fs.readFileSync(path.join(dir, "ouro", `${n}.json`), "utf8"));
    const reservas = ouro("fato_reserva");
    const r1 = reservas.find(r => r.reserva_id === "CC-AAAAAA");
    assert.equal(r1.status_final, "compareceu");
    assert.equal(r1.via_recomendacao, 1, "reservou 20 min depois de receber a recomendação");
    assert.equal(r1.minutos_desde_busca, 20);
    assert.equal(r1.turma_id, "SRV-01-T3");
    assert.equal(reservas.find(r => r.servico_id === "SRV-06").status_final, "recusada_sem_vaga");

    const h10 = ouro("fato_ocupacao_hora").find(o => o.sala === "SALA-C" && o.hora === 10);
    assert.equal(h10.ocupacao_media, 1.5, "1 pessoa por 30 min + 2 pessoas por 30 min = 1,5 em média");
    assert.equal(h10.ocupacao_max, 2);
    assert.equal(h10.temperatura_max, 31.2, "leitura de 999 °C não contamina a média");
    assert.ok(cat.tabelas.fato_busca.linhas === 1 && cat.tabelas.dim_servico.linhas === 6);
    assert.ok(fs.existsSync(path.join(dir, "ouro", "fato_reserva.csv")), "CSV para Power BI");
  });
});

describe("Análises e API (camada ouro)", () => {
  let dir, server, base;
  before(async () => {
    dir = tmp();
    gerarHistorico({ dir, dias: 60, fim: "2026-11-18", semente: 7 });
    await executarETL(dir);
    const cfg = { adminUser: "admin", adminPasswordHash: gerarHashSenha("senha-teste"), tokenSecret: "s", iotDeviceKey: "k", log: false, datalakeDir: dir, pseudonimoSecret: "p" };
    server = http.createServer(criarApp(cfg).handler);
    await new Promise(r => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(async () => { await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); });

  test("CT20 — Indicadores respondem aos filtros e comparam com o período anterior", () => {
    const a = criarAnalises(dir);
    const geral = a.consultar({});
    assert.equal(geral.filtros.inicio, "2026-10-20", "padrão: últimos 30 dias");
    assert.ok(geral.kpis.length >= 6);
    for (const k of geral.kpis) assert.ok("variacao" in k && "anterior" in k);
    const util = geral.kpis.find(k => k.id === "taxaUtilizacao").valor;
    assert.ok(util > 0 && util <= 1.05);
    const noite = a.consultar({ turno: "noite" });
    assert.ok(noite.porServico.every(s => s.turno === "noite"));
    assert.ok(noite.kpis.find(k => k.id === "demandaReprimida").valor < geral.kpis.find(k => k.id === "demandaReprimida").valor);
    assert.equal(a.consultar({ turno: "madrugada" }).status, 400, "filtro inválido é recusado");
    assert.ok(geral.insights.length > 0 && geral.insights.every(i => i.titulo && i.decisao), "toda recomendação traz uma decisão");
  });

  test("CT21 — API de análises exige login e a aplicação alimenta o data lake", async () => {
    assert.equal((await fetch(`${base}/api/admin/analises`)).status, 401);
    const { token } = await (await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuario: "admin", senha: "senha-teste" }) })).json();
    const r = await fetch(`${base}/api/admin/analises?inicio=2026-11-01&fim=2026-11-18&eixo=${encodeURIComponent("Apoio social e jurídico")}`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(r.status, 200);
    const d = await r.json();
    assert.equal(d.filtros.eixo, "Apoio social e jurídico");
    assert.ok(d.serieDiaria.length === 18 && d.mapaCalor.length > 0);

    // Uma reserva real gera um evento bronze, sem o nome do cidadão
    await fetch(`${base}/api/reservas`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id_servico: "SRV-01", nome: "Joana Teste", documento: gerarCpf(9) }) });
    await new Promise(res => setTimeout(res, 100));
    const arquivos = fs.readdirSync(path.join(dir, "bronze", "reserva"), { recursive: true }).filter(f => String(f).endsWith("eventos.jsonl"));
    assert.equal(arquivos.length, 1);
    const conteudo = fs.readFileSync(path.join(dir, "bronze", "reserva", String(arquivos[0])), "utf8");
    assert.match(conteudo, /"resultado":"confirmada"/);
    assert.ok(!conteudo.includes("Joana"));
    assert.ok(!conteudo.includes(gerarCpf(9)), "CPF não chega ao data lake");
  });
});
