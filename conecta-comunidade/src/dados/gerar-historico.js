// Gera um HISTÓRICO SINTÉTICO de 90 dias na camada bronze do data lake, no mesmo
// formato que a aplicação e os sensores gravam em produção.
//
// - As recomendações são produzidas pelo agente IA real (core/recomendacao.js)
// - O saldo de vagas é controlado por turma (ciclos de 30 dias), então serviços esgotam
// - Os sensores IoT geram passagens (entrada/saída) e temperatura hora a hora
// - ~1,5% dos registros vêm "sujos" de propósito (duplicados, campos faltando, sensor com
//   defeito, JSON truncado, data em formato legado) para o ETL tratar
//
// Uso: node src/dados/gerar-historico.js [--dias 90] [--fim 2026-11-18] [--semente 2026]
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { avaliar } from "../core/recomendacao.js";
import { catalogoInicial, NOMES_TURNO } from "../core/catalogo.js";
import { isoLocal } from "./ingestao.js";
import { partesLocais, cicloDe } from "./esquema.js";

const ARQUIVO = "eventos-historico.jsonl";

// PRNG determinístico (mulberry32): mesma semente = mesmos dados
function prng(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Data local (-03:00) -> Date
function emLocal(dataStr, hora, minuto = 0, segundo = 0) {
  return new Date(`${dataStr}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:${String(segundo).padStart(2, "0")}-03:00`);
}
function somarDias(dataStr, n) {
  const d = new Date(dataStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---------- Perfis de busca (textos parecidos com os que cidadãos escrevem) ----------
const PERFIS = [
  { peso: 34, situacao: "Procurando emprego", interesse: "Capacitação profissional",
    turnos: { manha: 0.22, tarde: 0.18, noite: 0.42, qualquer: 0.18 },
    textos: ["Estou desempregado e quero fazer um curso gratuito para melhorar o currículo",
      "Preciso aprender informática e computador para conseguir trabalho",
      "Quero me qualificar profissionalmente, trabalho de dia e só posso estudar à noite",
      "Busco orientação para entrevista e currículo, quero voltar ao mercado de trabalho",
      "Quero curso de vendas e atendimento para conseguir emprego no comércio"] },
  { peso: 14, situacao: "Querendo aprender novas habilidades", interesse: "Capacitação profissional",
    turnos: { manha: 0.25, tarde: 0.2, noite: 0.4, qualquer: 0.15 },
    textos: ["Quero estudar informática e aprender a usar o computador",
      "Gostaria de um curso digital para me capacitar", "Quero aprender coisas novas"] },
  { peso: 14, situacao: "Buscando renda extra / empreender", interesse: "Geração de renda",
    turnos: { manha: 0.15, tarde: 0.2, noite: 0.45, qualquer: 0.2 },
    textos: ["Faço doces e quero aprender a vender e empreender",
      "Quero abrir um pequeno negócio e saber sobre microcrédito",
      "Preciso de renda extra, penso em ser autônomo", "Quero ganhar dinheiro com artesanato"] },
  { peso: 22, situacao: "Precisando de atendimento social ou jurídico", interesse: "Apoio social e jurídico",
    turnos: { manha: 0.3, tarde: 0.35, noite: 0.1, qualquer: 0.25 },
    textos: ["Preciso de apoio jurídico gratuito com pensão do meu filho",
      "Quero orientação de advogado sobre meus direitos trabalhistas",
      "Preciso regularizar documentos da família", "Preciso de ajuda com advogado e documentos",
      "Questão de direitos e pensão, preciso de defensoria"] },
  { peso: 16, situacao: "Precisando de atendimento social ou jurídico", interesse: "Apoio social e jurídico",
    turnos: { manha: 0.45, tarde: 0.25, noite: 0.05, qualquer: 0.25 },
    textos: ["Quero me cadastrar em benefício social para minha família",
      "Preciso de auxílio e cadastro no CRAS", "Família em situação de vulnerabilidade precisa de apoio",
      "Quero saber de auxílio para família"] }
];

// Propensão de reservar depois de ver a recomendação (atratividade percebida)
const PROPENSAO = { "SRV-01": 0.26, "SRV-02": 0.22, "SRV-03": 0.24, "SRV-04": 0.09, "SRV-05": 0.20, "SRV-06": 0.45 };
// Taxa de comparecimento por serviço (noite tem mais faltas)
const COMPARECIMENTO = { "SRV-01": 0.86, "SRV-02": 0.80, "SRV-03": 0.68, "SRV-04": 0.62, "SRV-05": 0.90, "SRV-06": 0.93 };
// Ocupação física típica (fração da capacidade) por sala e turno
const PERFIL_SALA = {
  "SALA-A": { manha: 0.78, tarde: 0.12, noite: 0.08 },
  "SALA-B": { manha: 0.10, tarde: 0.62, noite: 0.30 },
  "SALA-C": { manha: 0.80, tarde: 0.97, noite: 0.72 }
};
const CAPACIDADE = { "SALA-A": 30, "SALA-B": 25, "SALA-C": 10 };

function turnoDaHora(h) { return h < 12 ? "manha" : h < 18 ? "tarde" : "noite"; }

export function gerarHistorico({ dir, dias = 90, fim = "2026-11-18", semente = 2026 } = {}) {
  const rnd = prng(semente);
  const escolher = arr => arr[Math.floor(rnd() * arr.length)];
  const ponderado = obj => { let r = rnd(), acc = 0; for (const [k, p] of Object.entries(obj)) { acc += p; if (r < acc) return k; } return Object.keys(obj).at(-1); };
  const inicio = somarDias(fim, -(dias - 1));
  const uuid = () => [8, 4, 4, 4, 12].map(n => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join("")).join("-");
  const protocolo = () => "CC-" + Array.from({ length: 6 }, () => "0123456789ABCDEF"[Math.floor(rnd() * 16)]).join("");
  const pessoas = Array.from({ length: 4200 }, () => Array.from({ length: 16 }, () => Math.floor(rnd() * 16).toString(16)).join(""));

  const saidas = new Map(); // arquivo -> linhas
  const stats = { total: 0, sujos: 0, porTipo: {} };
  function emitir(tipo, quando, dados) {
    const ev = { evento_id: uuid(), tipo, origem: "historico", ocorrido_em: isoLocal(quando), ingerido_em: new Date(quando.getTime() + Math.floor(rnd() * 4000)).toISOString(), dados };
    const arq = path.join(dir, "bronze", tipo, `dt=${partesLocais(quando).data}`, ARQUIVO);
    if (!saidas.has(arq)) saidas.set(arq, []);
    const linhas = saidas.get(arq);
    let linha = JSON.stringify(ev);
    // ----- sujeira proposital (~1,5%) -----
    const r = rnd();
    if (r < 0.004) { linhas.push(linha); stats.sujos++; }                                         // duplicado (reenvio)
    else if (r < 0.006) { linha = linha.slice(0, Math.floor(linha.length / 2)); stats.sujos++; }   // JSON truncado
    else if (r < 0.009) { linha = JSON.stringify({ ...ev, ocorrido_em: ev.ocorrido_em.slice(0, 19).replace("T", " ") }); stats.sujos++; } // data legada
    else if (r < 0.011 && tipo === "busca") { const { perfil_hash, ...resto } = dados; linha = JSON.stringify({ ...ev, dados: resto }); stats.sujos++; }
    else if (r < 0.015 && tipo === "leitura_iot" && dados.sensor === "temperatura") { linha = JSON.stringify({ ...ev, dados: { ...dados, valor: 999 } }); stats.sujos++; }
    else if (r < 0.016 && tipo === "leitura_iot") { linha = JSON.stringify({ ...ev, dados: { ...dados, sala: "SALA-Z" } }); stats.sujos++; }
    linhas.push(linha);
    stats.total++;
    stats.porTipo[tipo] = (stats.porTipo[tipo] ?? 0) + 1;
  }

  // ---------- Saldo de vagas por turma (ciclo de 30 dias a partir do início) ----------
  const catalogo = catalogoInicial();
  const saldo = {}; // "SRV-01#0" -> vagas
  const chave = (id, data) => `${id}#${cicloDe(data)}`;
  const vagasDe = (id, data) => (saldo[chave(id, data)] ??= catalogo.find(s => s.id === id).vagasTotais);
  const reservas = []; // para cancelamentos/presenças

  const limite = emLocal(fim, 23, 59, 59);
  function tentarReservar(perfil, servicoId, quando) {
    if (quando > limite) return false; // não gera eventos depois do fim do histórico
    const data = partesLocais(quando).data;
    if (vagasDe(servicoId, data) > 0) {
      saldo[chave(servicoId, data)] -= 1;
      const id = protocolo();
      emitir("reserva", quando, { perfil_hash: perfil, servico_id: servicoId, resultado: "confirmada", reserva_id: id });
      reservas.push({ id, servicoId, quando, data });
      return true;
    }
    emitir("reserva", quando, { perfil_hash: perfil, servico_id: servicoId, resultado: "sem_vaga", reserva_id: null });
    return false;
  }

  for (let d = 0; d < dias; d++) {
    const data = somarDias(inicio, d);
    const diaSemana = new Date(data + "T12:00:00Z").getUTCDay();
    const fatorDia = diaSemana === 0 ? 0.25 : diaSemana === 6 ? 0.5 : 1;
    const tendencia = 1 + d * 0.006;                         // plataforma ganhando adesão
    const campanha = d >= 40 && d < 47 ? 1.8 : 1;            // semana de divulgação nas escolas
    const nBuscas = Math.round((17 + rnd() * 6) * fatorDia * tendencia * campanha);

    // Saldo atual (para o agente IA enxergar serviços esgotados)
    const catalogoDoDia = catalogo.map(s => ({ ...s, vagas: vagasDe(s.id, data) }));

    for (let i = 0; i < nBuscas; i++) {
      const perfilTipo = (() => { let r = rnd() * 100, acc = 0; for (const p of PERFIS) { acc += p.peso; if (r < acc) return p; } return PERFIS[0]; })();
      const hora = Math.min(22, Math.max(7, Math.round(8 + rnd() * 14)));
      const quando = emLocal(data, hora, Math.floor(rnd() * 60), Math.floor(rnd() * 60));
      const pessoa = escolher(pessoas);
      const turno = ponderado(perfilTipo.turnos);
      const entrada = { cidadao: "Pessoa", situacao_atual: perfilTipo.situacao, interesse_principal: perfilTipo.interesse, turno_disponivel: turno, descricao_livre: escolher(perfilTipo.textos) };
      // O histórico (ago–nov/2026) foi produzido pela versão 1 do agente, anterior à melhoria de vocabulário
      const saida = avaliar(entrada, catalogoDoDia.map(s => ({ ...s, vagas: vagasDe(s.id, data) })), NOMES_TURNO, { versao: 1 });
      emitir("busca", quando, {
        perfil_hash: pessoa, situacao: entrada.situacao_atual, interesse: entrada.interesse_principal, turno,
        recomendados: saida.recomendacoes.map((r, k) => ({ servico_id: r.id_servico, score: r.score_compatibilidade, posicao: k + 1 }))
      });
      // Conversão: escolhe uma das recomendações (1ª é a mais provável)
      const recs = saida.recomendacoes;
      if (recs.length) {
        const pos = rnd() < 0.68 ? 0 : rnd() < 0.7 ? 1 : 2;
        const alvo = recs[Math.min(pos, recs.length - 1)];
        const turnoBate = turno === "qualquer" || turno === alvo.turno;
        if (rnd() < PROPENSAO[alvo.id_servico] * (turnoBate ? 1 : 0.35)) {
          const depois = new Date(quando.getTime() + Math.floor((rnd() < 0.8 ? rnd() * 40 : rnd() * 900) * 60000));
          tentarReservar(pessoa, alvo.id_servico, depois);
        }
      }
    }

    // Reservas diretas pelo catálogo (sem passar pelo agente)
    const nDiretas = Math.round((2 + rnd() * 3) * fatorDia);
    for (let i = 0; i < nDiretas; i++) {
      const s = escolher(catalogo);
      if (rnd() < PROPENSAO[s.id] + 0.1) tentarReservar(escolher(pessoas), s.id, emLocal(data, 8 + Math.floor(rnd() * 14), Math.floor(rnd() * 60)));
    }

    // ---------- IoT: passagens e temperatura, hora a hora ----------
    for (const sala of Object.keys(PERFIL_SALA)) {
      if (diaSemana === 0) continue; // fechado aos domingos
      let ocupacao = 0;
      let temperatura = 22 + rnd();
      const horaFim = diaSemana === 6 ? 13 : 22;
      for (let h = 7; h <= horaFim; h++) {
        const base = h === 7 || h === 12 || h === 18 ? 0.3 : 1; // trocas de turma
        const alvo = h === horaFim ? 0 : Math.round(CAPACIDADE[sala] * PERFIL_SALA[sala][turnoDaHora(h)] * base * (diaSemana === 6 ? 0.4 : 1) * (0.85 + rnd() * 0.3));
        const meta = Math.min(CAPACIDADE[sala], alvo);
        // movimentação: chega na meta + entra/sai aleatório (vai e volta)
        const passos = Math.abs(meta - ocupacao) + Math.floor(rnd() * 6) * 2;
        let entradasRestantes = Math.max(0, meta - ocupacao) + (passos - Math.abs(meta - ocupacao)) / 2;
        let saidasRestantes = Math.max(0, ocupacao - meta) + (passos - Math.abs(meta - ocupacao)) / 2;
        const minutos = Array.from({ length: passos }, () => Math.floor(rnd() * 3600)).sort((a, b) => a - b);
        for (const seg of minutos) {
          const podeEntrar = entradasRestantes > 0 && ocupacao < CAPACIDADE[sala];
          const podeSair = saidasRestantes > 0 && ocupacao > 0;
          if (!podeEntrar && !podeSair) continue;
          const entra = podeEntrar && (!podeSair || rnd() < entradasRestantes / (entradasRestantes + saidasRestantes));
          if (entra) { ocupacao++; entradasRestantes--; } else { ocupacao--; saidasRestantes--; }
          emitir("leitura_iot", emLocal(data, h, Math.floor(seg / 60), seg % 60), { sala, sensor: "fluxo", evento: entra ? "entrada" : "saida" });
        }
        while (h === horaFim && ocupacao > 0) { ocupacao--; emitir("leitura_iot", emLocal(data, h, 58, Math.floor(rnd() * 59)), { sala, sensor: "fluxo", evento: "saida" }); }
        // temperatura a cada 15 min: tende a 22 °C + 0,9 °C por pessoa/10 de capacidade; SALA-C esquenta à tarde
        for (const m of [0, 15, 30, 45]) {
          const calorTarde = sala === "SALA-C" && h >= 13 && h <= 16 ? 5.5 : 0;
          const alvoT = 22 + (ocupacao / CAPACIDADE[sala]) * 4.5 + calorTarde + (h >= 12 && h <= 15 ? 1.5 : 0);
          temperatura += (alvoT - temperatura) * 0.35 + (rnd() - 0.5) * 0.6;
          emitir("leitura_iot", emLocal(data, h, m, Math.floor(rnd() * 20)), { sala, sensor: "temperatura", valor: Math.round(temperatura * 10) / 10 });
        }
      }
    }
  }

  // ---------- Cancelamentos e presenças das reservas confirmadas ----------
  const fimDate = limite;
  for (const r of reservas) {
    if (rnd() < 0.09) {
      const q = new Date(r.quando.getTime() + Math.floor(rnd() * 5 * 86400000));
      if (q < fimDate) { emitir("cancelamento", q, { reserva_id: r.id }); continue; }
    }
    // Presença: no 1º dia de aula da turma (início do ciclo seguinte à inscrição, ou alguns dias depois)
    const diaAula = new Date(r.quando.getTime() + (2 + Math.floor(rnd() * 6)) * 86400000);
    if (diaAula < fimDate && rnd() < COMPARECIMENTO[r.servicoId]) emitir("presenca", diaAula, { reserva_id: r.id });
  }

  // ---------- Gravação (substitui apenas os arquivos de histórico; eventos reais do app ficam intactos) ----------
  removerHistoricoAnterior(path.join(dir, "bronze"));
  for (const [arq, linhas] of saidas) {
    fs.mkdirSync(path.dirname(arq), { recursive: true });
    fs.writeFileSync(arq, linhas.join("\n") + "\n");
  }
  return { ...stats, inicio, fim, arquivos: saidas.size };
}

function removerHistoricoAnterior(raiz) {
  if (!fs.existsSync(raiz)) return;
  for (const ent of fs.readdirSync(raiz, { withFileTypes: true, recursive: true })) {
    if (ent.isFile() && ent.name === ARQUIVO) fs.rmSync(path.join(ent.parentPath ?? ent.path, ent.name));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (nome, padrao) => { const i = process.argv.indexOf(`--${nome}`); return i > 0 ? process.argv[i + 1] : padrao; };
  const dir = path.resolve(process.env.DATALAKE_DIR || "datalake");
  const t0 = Date.now();
  const r = gerarHistorico({ dir, dias: Number(arg("dias", 90)), fim: arg("fim", "2026-11-18"), semente: Number(arg("semente", 2026)) });
  console.log(`Histórico gerado em ${dir}/bronze (${r.inicio} a ${r.fim})`);
  console.log(`Eventos: ${r.total.toLocaleString("pt-BR")} · arquivos: ${r.arquivos} · registros sujos propositais: ${r.sujos}`);
  for (const [t, n] of Object.entries(r.porTipo)) console.log(`  ${t.padEnd(13)} ${n.toLocaleString("pt-BR")}`);
  console.log(`Tempo: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
