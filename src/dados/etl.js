// ETL do data lake — BRONZE (bruto) → PRATA (limpo) → OURO (modelo analítico)
//
//  BRONZE  datalake/bronze/<tipo>/dt=AAAA-MM-DD/*.jsonl   eventos como chegaram (imutáveis)
//  PRATA   datalake/prata/<tipo>.jsonl                     validados, deduplicados, datas normalizadas
//  OURO    datalake/ouro/<tabela>.csv|.json                modelo estrela (dimensões + fatos) para BI
//          datalake/ouro/_catalogo.json                    catálogo: tabelas, colunas, linhas, linhagem
//          datalake/ouro/_qualidade.json                   relatório de qualidade da execução
//  QUARENTENA datalake/quarentena/rejeitados.jsonl         registros recusados + motivo
//
// Uso: node src/dados/etl.js
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { pathToFileURL } from "node:url";
import { catalogoInicial } from "../core/catalogo.js";
import { pastaDatalake } from "../caminhos.js";
import { validarEvento, partesLocais, EIXO_POR_CATEGORIA, cicloDe, INICIO_CICLOS, DIAS_CICLO } from "./esquema.js";

const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const HORA_ABRE = 7, HORA_FECHA = 23;
const DIAS_PARA_FALTA = 10; // sem presença após 10 dias = falta

// ---------------- utilidades ----------------
function listarJsonl(raiz) {
  if (!fs.existsSync(raiz)) return [];
  return fs.readdirSync(raiz, { withFileTypes: true, recursive: true })
    .filter(e => e.isFile() && e.name.endsWith(".jsonl"))
    .map(e => path.join(e.parentPath ?? e.path, e.name))
    .sort();
}

function somarDias(data, n) {
  const d = new Date(data + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function paraCsv(linhas, colunas) {
  const cel = v => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(Math.round(v * 1000) / 1000) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [colunas.join(","), ...linhas.map(l => colunas.map(c => cel(l[c])).join(","))].join("\n") + "\n";
}

function gravarTabela(dirOuro, nome, linhas, colunas) {
  fs.writeFileSync(path.join(dirOuro, `${nome}.csv`), paraCsv(linhas, colunas));
  fs.writeFileSync(path.join(dirOuro, `${nome}.json`), JSON.stringify(linhas));
  return { linhas: linhas.length, colunas };
}

// ---------------- 1. BRONZE → PRATA ----------------
export async function bronzeParaPrata(dir) {
  const arquivos = listarJsonl(path.join(dir, "bronze"));
  const vistos = new Set();
  const porTipo = {};
  const rejeitados = [];
  const q = { arquivos: arquivos.length, lidos: 0, validos: 0, duplicados: 0, rejeitados: 0, datasNormalizadas: 0, motivos: {} };

  for (const arquivo of arquivos) {
    const rl = readline.createInterface({ input: fs.createReadStream(arquivo), crlfDelay: Infinity });
    let n = 0;
    for await (const linha of rl) {
      n++;
      if (!linha.trim()) continue;
      q.lidos++;
      let obj;
      try { obj = JSON.parse(linha); } catch {
        q.rejeitados++; q.motivos.json_invalido = (q.motivos.json_invalido ?? 0) + 1;
        rejeitados.push({ arquivo: path.relative(dir, arquivo), linha: n, motivo: "json_invalido", trecho: linha.slice(0, 120) });
        continue;
      }
      const v = validarEvento(obj);
      if (!v.ok) {
        q.rejeitados++; q.motivos[v.motivo] = (q.motivos[v.motivo] ?? 0) + 1;
        rejeitados.push({ arquivo: path.relative(dir, arquivo), linha: n, motivo: v.motivo, evento_id: obj?.evento_id ?? null });
        continue;
      }
      if (vistos.has(obj.evento_id)) { q.duplicados++; continue; }
      vistos.add(obj.evento_id);
      if (!/T/.test(obj.ocorrido_em)) q.datasNormalizadas++;
      const { data, hora, diaSemana } = partesLocais(v.registro._quando);
      const { _quando, ...reg } = v.registro;
      (porTipo[reg.tipo] ??= []).push({ ...reg, data, hora, dia_semana: diaSemana, _t: _quando.getTime() });
      q.validos++;
    }
  }

  const dirPrata = path.join(dir, "prata");
  fs.rmSync(dirPrata, { recursive: true, force: true });
  fs.mkdirSync(dirPrata, { recursive: true });
  for (const [tipo, regs] of Object.entries(porTipo)) {
    regs.sort((a, b) => a._t - b._t);
    fs.writeFileSync(path.join(dirPrata, `${tipo}.jsonl`), regs.map(({ _t, ...r }) => JSON.stringify(r)).join("\n") + "\n");
  }
  const dirQ = path.join(dir, "quarentena");
  fs.mkdirSync(dirQ, { recursive: true });
  fs.writeFileSync(path.join(dirQ, "rejeitados.jsonl"), rejeitados.map(r => JSON.stringify(r)).join("\n") + (rejeitados.length ? "\n" : ""));

  q.porTipo = Object.fromEntries(Object.entries(porTipo).map(([t, r]) => [t, r.length]));
  return { porTipo, qualidade: q };
}

// ---------------- 2. PRATA → OURO ----------------
export function prataParaOuro(dir, porTipo) {
  const catalogo = catalogoInicial();
  const servicoPorId = Object.fromEntries(catalogo.map(s => [s.id, s]));
  const buscas = porTipo.busca ?? [];
  const reservasEv = porTipo.reserva ?? [];
  const cancel = new Map((porTipo.cancelamento ?? []).map(c => [c.dados.reserva_id, c]));
  const presenca = new Map((porTipo.presenca ?? []).map(p => [p.dados.reserva_id, p]));
  const iot = porTipo.leitura_iot ?? [];

  const todasDatas = [...buscas, ...reservasEv, ...iot].map(e => e.data).sort();
  const dataMin = todasDatas[0] ?? INICIO_CICLOS;
  const dataMax = todasDatas.at(-1) ?? INICIO_CICLOS;

  // ---- Dimensões ----
  const dimServico = catalogo.map(s => ({
    servico_id: s.id, titulo: s.titulo, instituicao: s.instituicao, categoria: s.categoria,
    eixo: EIXO_POR_CATEGORIA[s.categoria], turno: s.turno, sala: s.sala, vagas_por_turma: s.vagasTotais, impacto_social: s.impactoSocial
  }));
  const salas = [...new Map(catalogo.map(s => [s.sala, s.capacidadeSala]))].map(([sala, capacidade]) => ({ sala, capacidade }));
  const capacidade = Object.fromEntries(salas.map(s => [s.sala, s.capacidade]));

  const dimData = [];
  for (let d = dataMin; d <= dataMax; d = somarDias(d, 1)) {
    const dt = new Date(d + "T12:00:00Z");
    const dow = dt.getUTCDay();
    dimData.push({ data: d, ano: dt.getUTCFullYear(), mes: dt.getUTCMonth() + 1, dia: dt.getUTCDate(), dia_semana: dow, nome_dia: NOMES_DIA[dow], fim_de_semana: dow === 0 || dow === 6 ? 1 : 0, semana: somarDias(d, -((dow + 6) % 7)) });
  }

  const dimTurma = [];
  for (let c = Math.max(0, cicloDe(dataMin)); c <= cicloDe(dataMax); c++) {
    const inicio = somarDias(INICIO_CICLOS, c * DIAS_CICLO);
    for (const s of catalogo) dimTurma.push({ turma_id: `${s.id}-T${c + 1}`, servico_id: s.id, ciclo: c + 1, inicio_inscricoes: inicio, fim_inscricoes: somarDias(inicio, DIAS_CICLO - 1), vagas: s.vagasTotais });
  }

  // ---- fato_busca + fato_recomendacao ----
  const fatoBusca = [], fatoRecomendacao = [];
  const buscasPorPerfil = new Map();
  for (const b of buscas) {
    const recs = b.dados.recomendados;
    const top = recs[0];
    const turnoAtendido = b.dados.turno === "qualquer" || recs.some(r => servicoPorId[r.servico_id]?.turno === b.dados.turno);
    fatoBusca.push({
      busca_id: b.evento_id, data: b.data, hora: b.hora, dia_semana: b.dia_semana, origem: b.origem,
      perfil_hash: b.dados.perfil_hash, situacao: b.dados.situacao, interesse: b.dados.interesse, turno: b.dados.turno,
      qtd_recomendacoes: recs.length, sem_resultado: recs.length ? 0 : 1, turno_atendido: turnoAtendido ? 1 : 0,
      top1_servico: top?.servico_id ?? null, top1_score: top?.score ?? null
    });
    for (const r of recs) fatoRecomendacao.push({ busca_id: b.evento_id, data: b.data, servico_id: r.servico_id, posicao: r.posicao, score: r.score });
    if (!buscasPorPerfil.has(b.dados.perfil_hash)) buscasPorPerfil.set(b.dados.perfil_hash, []);
    buscasPorPerfil.get(b.dados.perfil_hash).push({ t: Date.parse(b.ocorrido_em), servicos: new Set(recs.map(r => r.servico_id)), id: b.evento_id });
  }

  // ---- fato_reserva (com status final e atribuição à recomendação) ----
  const tMax = Date.parse(dataMax + "T23:59:59-03:00");
  const fatoReserva = reservasEv.map(r => {
    const t = Date.parse(r.ocorrido_em);
    // Atribuição: houve busca do mesmo perfil, nas 24 h anteriores, que recomendou este serviço?
    const origem = (buscasPorPerfil.get(r.dados.perfil_hash) ?? [])
      .filter(b => b.t <= t && t - b.t <= 24 * 3600 * 1000 && b.servicos.has(r.dados.servico_id))
      .sort((a, b) => b.t - a.t)[0];
    let status;
    if (r.dados.resultado === "sem_vaga") status = "recusada_sem_vaga";
    else if (cancel.has(r.dados.reserva_id)) status = "cancelada";
    else if (presenca.has(r.dados.reserva_id)) status = "compareceu";
    else status = (tMax - t) / 86400000 > DIAS_PARA_FALTA ? "faltou" : "aguardando";
    return {
      reserva_id: r.dados.reserva_id ?? r.evento_id, data: r.data, hora: r.hora, dia_semana: r.dia_semana, origem: r.origem,
      perfil_hash: r.dados.perfil_hash, servico_id: r.dados.servico_id, turma_id: `${r.dados.servico_id}-T${cicloDe(r.data) + 1}`,
      resultado: r.dados.resultado, status_final: status,
      valida: status === "recusada_sem_vaga" || status === "cancelada" ? 0 : 1,
      via_recomendacao: origem ? 1 : 0, busca_id: origem?.id ?? null,
      minutos_desde_busca: origem ? Math.round((t - origem.t) / 60000) : null
    };
  });

  // ---- fato_ocupacao_hora: reconstrói a ocupação a partir das passagens (média ponderada no tempo) ----
  const porSalaDia = new Map();
  for (const e of iot) {
    const k = `${e.dados.sala}|${e.data}`;
    if (!porSalaDia.has(k)) porSalaDia.set(k, []);
    porSalaDia.get(k).push(e);
  }
  const fatoOcupacao = [];
  for (const [k, evs] of porSalaDia) {
    const [sala, data] = k.split("|");
    const cap = capacidade[sala];
    const base = Date.parse(`${data}T00:00:00-03:00`);
    const buckets = {};
    for (let h = HORA_ABRE; h < HORA_FECHA; h++) buckets[h] = { area: 0, max: 0, lotadaSeg: 0, temps: [], entradas: 0, leituras: 0 };
    let occ = 0, tAnt = HORA_ABRE * 3600, inconsistencias = 0;
    const acumular = (ate) => {
      let t = tAnt;
      while (t < ate) {
        const h = Math.floor(t / 3600);
        const fimH = Math.min(ate, (h + 1) * 3600);
        if (buckets[h]) { buckets[h].area += occ * (fimH - t); if (occ >= cap) buckets[h].lotadaSeg += fimH - t; buckets[h].max = Math.max(buckets[h].max, occ); }
        t = fimH;
      }
      tAnt = Math.max(tAnt, ate);
    };
    for (const e of evs) {
      const seg = Math.min(HORA_FECHA * 3600, Math.max(HORA_ABRE * 3600, Math.floor((Date.parse(e.ocorrido_em) - base) / 1000)));
      const h = Math.min(HORA_FECHA - 1, Math.floor(seg / 3600));
      buckets[h].leituras++;
      if (e.dados.sensor === "temperatura") { buckets[h].temps.push(Number(e.dados.valor)); continue; }
      acumular(seg);
      if (e.dados.evento === "entrada") { occ++; buckets[h].entradas++; }
      else if (occ > 0) occ--;
      else inconsistencias++; // saída com sala vazia: sensor perdeu uma entrada
      buckets[h].max = Math.max(buckets[h].max, occ);
    }
    acumular(HORA_FECHA * 3600);
    const dow = new Date(data + "T12:00:00Z").getUTCDay();
    for (const [h, b] of Object.entries(buckets)) {
      if (!b.leituras && !b.area) continue;
      const media = b.area / 3600;
      fatoOcupacao.push({
        data, hora: Number(h), dia_semana: dow, sala, capacidade: cap,
        ocupacao_media: Math.round(media * 100) / 100, ocupacao_max: b.max,
        taxa_ocupacao: Math.round((media / cap) * 1000) / 1000,
        minutos_lotada: Math.round(b.lotadaSeg / 60), entradas: b.entradas, leituras: b.leituras,
        temperatura_media: b.temps.length ? Math.round((b.temps.reduce((a, x) => a + x, 0) / b.temps.length) * 10) / 10 : null,
        temperatura_max: b.temps.length ? Math.max(...b.temps) : null,
        saidas_sem_entrada: Number(h) === HORA_ABRE ? inconsistencias : 0
      });
    }
  }
  fatoOcupacao.sort((a, b) => (a.data + a.sala + String(a.hora).padStart(2, "0")).localeCompare(b.data + b.sala + String(b.hora).padStart(2, "0")));

  // ---- Gravação ----
  const dirOuro = path.join(dir, "ouro");
  fs.rmSync(dirOuro, { recursive: true, force: true });
  fs.mkdirSync(dirOuro, { recursive: true });
  const tabelas = {
    dim_servico: { ...gravarTabela(dirOuro, "dim_servico", dimServico, Object.keys(dimServico[0])), tipo: "dimensão", descricao: "Serviços ofertados (curso, atendimento) com eixo temático, turno e sala", origem: "catálogo das instituições" },
    dim_turma: { ...gravarTabela(dirOuro, "dim_turma", dimTurma, Object.keys(dimTurma[0] ?? { turma_id: 0 })), tipo: "dimensão", descricao: "Turmas por ciclo de 30 dias e vagas ofertadas", origem: "catálogo + calendário de ciclos" },
    dim_sala: { ...gravarTabela(dirOuro, "dim_sala", salas, ["sala", "capacidade"]), tipo: "dimensão", descricao: "Salas monitoradas e capacidade", origem: "catálogo" },
    dim_data: { ...gravarTabela(dirOuro, "dim_data", dimData, Object.keys(dimData[0] ?? { data: 0 })), tipo: "dimensão", descricao: "Calendário (dia, mês, dia da semana, semana)", origem: "gerada pelo ETL" },
    fato_busca: { ...gravarTabela(dirOuro, "fato_busca", fatoBusca, ["busca_id", "data", "hora", "dia_semana", "origem", "perfil_hash", "situacao", "interesse", "turno", "qtd_recomendacoes", "sem_resultado", "turno_atendido", "top1_servico", "top1_score"]), tipo: "fato", descricao: "Uma linha por busca no agente IA", origem: "prata/busca" },
    fato_recomendacao: { ...gravarTabela(dirOuro, "fato_recomendacao", fatoRecomendacao, ["busca_id", "data", "servico_id", "posicao", "score"]), tipo: "fato", descricao: "Serviços recomendados em cada busca (posição e score)", origem: "prata/busca" },
    fato_reserva: { ...gravarTabela(dirOuro, "fato_reserva", fatoReserva, ["reserva_id", "data", "hora", "dia_semana", "origem", "perfil_hash", "servico_id", "turma_id", "resultado", "status_final", "valida", "via_recomendacao", "busca_id", "minutos_desde_busca"]), tipo: "fato", descricao: "Tentativas de reserva com status final (compareceu, faltou, cancelada, sem vaga) e atribuição à recomendação", origem: "prata/reserva + cancelamento + presenca + busca" },
    fato_ocupacao_hora: { ...gravarTabela(dirOuro, "fato_ocupacao_hora", fatoOcupacao, ["data", "hora", "dia_semana", "sala", "capacidade", "ocupacao_media", "ocupacao_max", "taxa_ocupacao", "minutos_lotada", "entradas", "leituras", "temperatura_media", "temperatura_max", "saidas_sem_entrada"]), tipo: "fato", descricao: "Ocupação física por sala e hora, reconstruída das passagens do sensor (média ponderada no tempo) + temperatura", origem: "prata/leitura_iot" }
  };
  return { tabelas, periodo: { inicio: dataMin, fim: dataMax } };
}

// ---------------- Execução completa ----------------
export async function executarETL(dir) {
  const t0 = Date.now();
  const { porTipo, qualidade } = await bronzeParaPrata(dir);
  const { tabelas, periodo } = prataParaOuro(dir, porTipo);
  qualidade.taxaAproveitamento = qualidade.lidos ? Math.round((qualidade.validos / qualidade.lidos) * 10000) / 100 : 0;
  const catalogo = { gerado_em: new Date().toISOString(), duracao_ms: Date.now() - t0, periodo, camadas: { bronze: "bronze/<tipo>/dt=AAAA-MM-DD/*.jsonl", prata: "prata/<tipo>.jsonl", ouro: "ouro/<tabela>.csv|json" }, tabelas, qualidade };
  fs.writeFileSync(path.join(dir, "ouro", "_catalogo.json"), JSON.stringify(catalogo, null, 2));
  fs.writeFileSync(path.join(dir, "ouro", "_qualidade.json"), JSON.stringify(qualidade, null, 2));
  return catalogo;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = pastaDatalake();
  const c = await executarETL(dir);
  const q = c.qualidade;
  console.log(`ETL concluído em ${c.duracao_ms} ms · período ${c.periodo.inicio} a ${c.periodo.fim}\n`);
  console.log("QUALIDADE (bronze → prata)");
  console.log(`  arquivos lidos ........ ${q.arquivos}`);
  console.log(`  registros lidos ....... ${q.lidos.toLocaleString("pt-BR")}`);
  console.log(`  válidos ............... ${q.validos.toLocaleString("pt-BR")} (${q.taxaAproveitamento}%)`);
  console.log(`  duplicados removidos .. ${q.duplicados}`);
  console.log(`  datas normalizadas .... ${q.datasNormalizadas}`);
  console.log(`  rejeitados ............ ${q.rejeitados} → quarentena/rejeitados.jsonl`);
  for (const [m, n] of Object.entries(q.motivos)) console.log(`      ${m.padEnd(26)} ${n}`);
  console.log("\nOURO (modelo estrela)");
  for (const [nome, t] of Object.entries(c.tabelas)) console.log(`  ${t.tipo === "fato" ? "FATO" : "DIM "}  ${nome.padEnd(20)} ${String(t.linhas).padStart(7)} linhas`);
}
