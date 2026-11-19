// MOTOR DE ANÁLISES — lê a camada OURO do data lake e calcula os indicadores do
// dashboard de Big Data, respeitando os filtros (período, eixo, turno, sala) e
// comparando com o período anterior. Também gera recomendações de decisão (insights).
import fs from "node:fs";
import path from "node:path";
import {
  dividir, contarLinhas, somarX, mediaX, percentil, variacao, periodoAnterior,
  mediaMovel, rankear, diasSobrepostos
} from "./medidas.js";
import { INTERESSES, SALAS } from "./esquema.js";

const TABELAS = ["dim_servico", "dim_turma", "dim_sala", "fato_busca", "fato_recomendacao", "fato_reserva", "fato_ocupacao_hora"];
const TURNOS = ["manha", "tarde", "noite"];
const NOME_TURNO = { manha: "manhã", tarde: "tarde", noite: "noite", qualquer: "qualquer horário" };
const HORAS_TURNO = { manha: [7, 11], tarde: [12, 17], noite: [18, 22] };
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const LIMITE_TEMPERATURA = 30;

const turnoDaHora = h => (h < 12 ? "manha" : h < 18 ? "tarde" : "noite");
const noPeriodo = (d, ini, fim) => d >= ini && d <= fim;
const somarDias = (data, n) => { const d = new Date(data + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pct = v => (v === null ? "—" : `${Math.round(v * 100)}%`);

export function criarAnalises(dir) {
  let cache = null;

  function carregar() {
    if (!dir) return null;
    const arqCatalogo = path.join(dir, "ouro", "_catalogo.json");
    let mtime;
    try { mtime = fs.statSync(arqCatalogo).mtimeMs; } catch { return null; }
    if (cache?.mtime === mtime) return cache;
    const t = {};
    for (const nome of TABELAS) t[nome] = JSON.parse(fs.readFileSync(path.join(dir, "ouro", `${nome}.json`), "utf8"));
    const catalogo = JSON.parse(fs.readFileSync(arqCatalogo, "utf8"));
    cache = { mtime, t, catalogo };
    return cache;
  }

  function consultar(params = {}) {
    const dados = carregar();
    if (!dados) return { erro: "Camada ouro do data lake não encontrada. Rode: npm run dados", status: 503 };
    const { t, catalogo } = dados;

    // ---------- Validação dos filtros ----------
    for (const c of ["inicio", "fim"]) if (params[c] && !DATA_RE.test(params[c])) return { erro: `Filtro ${c} inválido (use AAAA-MM-DD).`, status: 400 };
    if (params.eixo && !INTERESSES.includes(params.eixo)) return { erro: "Filtro eixo inválido.", status: 400 };
    if (params.turno && !TURNOS.includes(params.turno)) return { erro: "Filtro turno inválido.", status: 400 };
    if (params.sala && !SALAS.includes(params.sala)) return { erro: "Filtro sala inválido.", status: 400 };
    const fim = params.fim || catalogo.periodo.fim;
    const inicio = params.inicio || somarDias(fim, -29);
    if (inicio > fim) return { erro: "Data inicial maior que a final.", status: 400 };
    const { eixo, turno, sala } = params;
    const anterior = periodoAnterior(inicio, fim);

    // Serviços que obedecem aos filtros (eixo/turno/sala)
    const servicos = t.dim_servico.filter(s => (!eixo || s.eixo === eixo) && (!turno || s.turno === turno) && (!sala || s.sala === sala));
    const ids = new Set(servicos.map(s => s.servico_id));
    const salasFiltro = new Set(sala ? [sala] : (eixo || turno) ? servicos.map(s => s.sala) : t.dim_sala.map(s => s.sala));
    const horaNoFiltro = h => !turno || (h >= HORAS_TURNO[turno][0] && h <= HORAS_TURNO[turno][1]);

    // ---------- Recortes por período ----------
    const recorte = (ini, f) => ({
      buscas: t.fato_busca.filter(b => noPeriodo(b.data, ini, f) && (!eixo || b.interesse === eixo) && (!turno || b.turno === turno)),
      reservas: t.fato_reserva.filter(r => noPeriodo(r.data, ini, f) && ids.has(r.servico_id)),
      recomendacoes: t.fato_recomendacao.filter(r => noPeriodo(r.data, ini, f) && ids.has(r.servico_id)),
      ocupacao: t.fato_ocupacao_hora.filter(o => noPeriodo(o.data, ini, f) && salasFiltro.has(o.sala) && horaNoFiltro(o.hora) && o.leituras > 0),
      // Turmas com inscrições abertas em algum dia do período; a utilização considera todas as
      // reservas válidas feitas para essas turmas até o fim do período
      ...turmasDoPeriodo(ini, f, ids)
    });

    function turmasDoPeriodo(ini, f, conjunto) {
      const turmas = t.dim_turma.filter(tu => conjunto.has(tu.servico_id) && diasSobrepostos(tu.inicio_inscricoes, tu.fim_inscricoes, ini, f) > 0);
      const idsTurma = new Set(turmas.map(tu => tu.turma_id));
      const reservasTurma = t.fato_reserva.filter(r => idsTurma.has(r.turma_id) && r.data <= f);
      return { turmas, reservasTurma };
    }

    // ---------- Medidas ----------
    function medidas(r) {
      const comResultado = contarLinhas(r.buscas, b => !b.sem_resultado);
      const semResultado = r.buscas.length - comResultado;
      const recusadas = contarLinhas(r.reservas, x => x.status_final === "recusada_sem_vaga");
      const validas = contarLinhas(r.reservas, x => x.valida === 1);
      const compareceu = contarLinhas(r.reservas, x => x.status_final === "compareceu");
      const faltou = contarLinhas(r.reservas, x => x.status_final === "faltou");
      const vagasOfertadas = somarX(r.turmas, x => x.vagas);
      const validasTurma = contarLinhas(r.reservasTurma, x => x.valida === 1);
      return {
        buscas: r.buscas.length,
        reservasValidas: validas,
        taxaConversao: dividir(contarLinhas(r.reservas, x => x.via_recomendacao === 1 && x.resultado === "confirmada"), comResultado),
        taxaUtilizacao: dividir(validasTurma, vagasOfertadas),
        vagasOfertadas: Math.round(vagasOfertadas),
        demandaReprimida: semResultado + recusadas,
        taxaDemandaReprimida: dividir(semResultado + recusadas, r.buscas.length + recusadas),
        buscasSemResultado: semResultado, recusadasSemVaga: recusadas,
        taxaComparecimento: dividir(compareceu, compareceu + faltou),
        aderenciaTurno: dividir(contarLinhas(r.buscas, b => b.turno_atendido === 1), r.buscas.length),
        ocupacaoMedia: mediaX(r.ocupacao, o => o.taxa_ocupacao),
        ocupacaoP90: percentil(r.ocupacao.map(o => o.taxa_ocupacao), 0.9),
        horasLotadas: Math.round(somarX(r.ocupacao, o => o.minutos_lotada) / 60),
        horasAcima30: contarLinhas(r.ocupacao, o => o.temperatura_max > LIMITE_TEMPERATURA)
      };
    }
    const atual = recorte(inicio, fim);
    const mA = medidas(atual);
    const mB = medidas(recorte(anterior.inicio, anterior.fim));

    const kpi = (id, rotulo, formato, melhor, descricao) => ({ id, rotulo, formato, melhor, descricao, valor: mA[id], anterior: mB[id], variacao: variacao(mA[id], mB[id]) });
    const kpis = [
      kpi("taxaUtilizacao", "Utilização das vagas", "pct", "maior", "Reservas válidas ÷ vagas das turmas abertas no período"),
      kpi("taxaConversao", "Conversão da recomendação", "pct", "maior", "Reservas feitas a partir de uma recomendação ÷ buscas com resultado"),
      kpi("demandaReprimida", "Pessoas sem atendimento", "int", "menor", "Buscas sem resultado + tentativas recusadas por falta de vaga"),
      kpi("taxaComparecimento", "Comparecimento", "pct", "maior", "Compareceram ÷ (compareceram + faltaram)"),
      kpi("aderenciaTurno", "Aderência ao turno", "pct", "maior", "Buscas que receberam opção no turno pedido"),
      kpi("ocupacaoMedia", "Ocupação física média", "pct", "maior", "Média ponderada no tempo, medida pelos sensores das salas")
    ];

    // ---------- Série diária com média móvel de 7 dias ----------
    const dias = [];
    for (let d = somarDias(inicio, -6); d <= fim; d = somarDias(d, 1)) dias.push(d);
    const contar = (linhas, campo) => { const m = {}; for (const l of linhas) m[l[campo]] = (m[l[campo]] ?? 0) + 1; return m; };
    const estendido = recorte(dias[0], fim);
    const bDia = contar(estendido.buscas, "data");
    const rDia = contar(estendido.reservas.filter(r => r.resultado === "confirmada"), "data");
    const serieB = dias.map(d => bDia[d] ?? 0), serieR = dias.map(d => rDia[d] ?? 0);
    const mmB = mediaMovel(serieB, 7), mmR = mediaMovel(serieR, 7);
    const serieDiaria = dias.slice(6).map((d, i) => ({ data: d, buscas: serieB[i + 6], reservas: serieR[i + 6], buscasMM7: mmB[i + 6], reservasMM7: mmR[i + 6] }));

    // ---------- Por serviço ----------
    const recPeriodo = t.fato_recomendacao.filter(r => noPeriodo(r.data, inicio, fim));
    const resPeriodo = t.fato_reserva.filter(r => noPeriodo(r.data, inicio, fim));
    const todasTurmas = turmasDoPeriodo(inicio, fim, new Set(t.dim_servico.map(s => s.servico_id)));
    const calcularServico = s => {
      const rs = resPeriodo.filter(r => r.servico_id === s.servico_id);
      const turmasS = todasTurmas.turmas.filter(tu => tu.servico_id === s.servico_id);
      const vagas = somarX(turmasS, x => x.vagas);
      const validas = contarLinhas(todasTurmas.reservasTurma, x => x.servico_id === s.servico_id && x.valida === 1);
      const recomendado = contarLinhas(recPeriodo, r => r.servico_id === s.servico_id);
      const viaRec = contarLinhas(rs, x => x.via_recomendacao === 1 && x.resultado === "confirmada");
      const comp = contarLinhas(rs, x => x.status_final === "compareceu"), falt = contarLinhas(rs, x => x.status_final === "faltou");
      return {
        servico_id: s.servico_id, titulo: s.titulo, eixo: s.eixo, turno: s.turno, sala: s.sala,
        vagasOfertadas: Math.round(vagas), reservasValidas: validas,
        utilizacao: vagas ? Math.round(dividir(validas, vagas) * 1000) / 1000 : null,
        recomendado, conversao: dividir(viaRec, recomendado),
        recusadasSemVaga: contarLinhas(rs, x => x.status_final === "recusada_sem_vaga"),
        cancelamentos: contarLinhas(rs, x => x.status_final === "cancelada"),
        comparecimento: dividir(comp, comp + falt), faltas: falt
      };
    };
    const porServico = rankear(servicos.map(calcularServico), "utilizacao");
    const porServicoTodos = t.dim_servico.map(calcularServico); // insights olham a rede inteira

    // ---------- Matriz eixo × turno (só filtro de período) ----------
    const buscasPeriodo = t.fato_busca.filter(b => noPeriodo(b.data, inicio, fim));
    const matrizTurno = INTERESSES.map(ex => ({
      eixo: ex,
      turnos: [...TURNOS, "qualquer"].map(tu => {
        const bs = buscasPeriodo.filter(b => b.interesse === ex && b.turno === tu);
        return { turno: tu, buscas: bs.length, aderencia: dividir(contarLinhas(bs, b => b.turno_atendido === 1), bs.length), semResultado: dividir(contarLinhas(bs, b => b.sem_resultado === 1), bs.length) };
      })
    }));

    // ---------- Mapa de calor: ocupação por dia da semana × hora ----------
    const ocupPeriodo = t.fato_ocupacao_hora.filter(o => noPeriodo(o.data, inicio, fim) && salasFiltro.has(o.sala) && o.leituras > 0);
    const celulas = {};
    for (const o of ocupPeriodo) { const k = `${o.dia_semana}|${o.hora}`; (celulas[k] ??= []).push(o.taxa_ocupacao); }
    const mapaCalor = Object.entries(celulas).map(([k, v]) => { const [ds, h] = k.split("|").map(Number); return { dia_semana: ds, hora: h, ocupacao: v.reduce((a, x) => a + x, 0) / v.length, amostras: v.length }; });

    // Ocupação por sala e turno + calor (base dos insights)
    const salaTurno = [];
    for (const s of t.dim_sala) for (const tu of TURNOS) {
      const os = t.fato_ocupacao_hora.filter(o => noPeriodo(o.data, inicio, fim) && o.sala === s.sala && turnoDaHora(o.hora) === tu && o.leituras > 0);
      salaTurno.push({ sala: s.sala, turno: tu, ocupacao: mediaX(os, o => o.taxa_ocupacao), horasAcima30: contarLinhas(os, o => o.temperatura_max > LIMITE_TEMPERATURA), tempMax: os.length ? Math.max(...os.map(o => o.temperatura_max ?? 0)) : null });
    }

    return {
      filtros: { inicio, fim, eixo: eixo ?? null, turno: turno ?? null, sala: sala ?? null },
      comparacao: anterior,
      disponivel: { ...catalogo.periodo, eixos: INTERESSES, turnos: TURNOS, salas: t.dim_sala.map(s => s.sala) },
      atualizadoEm: catalogo.gerado_em,
      qualidade: { lidos: catalogo.qualidade.lidos, validos: catalogo.qualidade.validos, rejeitados: catalogo.qualidade.rejeitados, duplicados: catalogo.qualidade.duplicados, taxaAproveitamento: catalogo.qualidade.taxaAproveitamento },
      kpis,
      complementares: { vagasOfertadas: mA.vagasOfertadas, reservasValidas: mA.reservasValidas, buscas: mA.buscas, buscasSemResultado: mA.buscasSemResultado, recusadasSemVaga: mA.recusadasSemVaga, ocupacaoP90: mA.ocupacaoP90, horasLotadas: mA.horasLotadas, horasAcima30: mA.horasAcima30 },
      serieDiaria, porServico, matrizTurno, mapaCalor, salaTurno,
      insights: gerarInsights({ porServico: porServicoTodos, matrizTurno, salaTurno, dias: anterior.dias })
    };
  }

  return { consultar, carregar };
}

// ---------- Regras de decisão: transformam indicadores em recomendações ----------
export function gerarInsights({ porServico, matrizTurno, salaTurno, dias }) {
  const insights = [];
  const escala = Math.max(0.25, dias / 30); // limiares proporcionais ao tamanho do período
  const naoAtendidas = c => Math.round(c.buscas * (1 - (c.aderencia ?? 1)));
  const celula = (eixo, turno) => matrizTurno.find(l => l.eixo === eixo)?.turnos.find(c => c.turno === turno);

  // 1. CAPACIDADE — serviço lotado e gente ficando de fora
  for (const s of porServico) {
    const c = celula(s.eixo, s.turno);
    const foraDoTurno = c ? naoAtendidas(c) : 0;
    if (s.utilizacao >= 0.9 && (s.recusadasSemVaga >= Math.ceil(2 * escala) || foraDoTurno >= Math.ceil(15 * escala))) {
      insights.push({ severidade: "alta", tipo: "ampliar", titulo: `Ampliar a oferta: ${s.titulo}`,
        detalhe: `${pct(s.utilizacao)} das vagas usadas, ${s.recusadasSemVaga} reservas recusadas por falta de vaga e ${foraDoTurno} buscas no turno da ${NOME_TURNO[s.turno]} sem opção disponível.`,
        decisao: "Abrir uma turma extra ou ampliar as vagas com a instituição parceira." });
    }
  }

  // 2. HORÁRIO — demanda num turno sem serviço adequado (e sem ser problema de lotação)
  const lacunas = [];
  for (const linha of matrizTurno) for (const c of linha.turnos) {
    if (c.turno === "qualquer" || c.aderencia === null || c.aderencia >= 0.7) continue;
    const doTurno = porServico.filter(s => s.eixo === linha.eixo && s.turno === c.turno);
    if (doTurno.some(s => s.utilizacao >= 0.85)) continue;          // é lotação → regra 1
    if (doTurno.some(s => s.utilizacao !== null && s.utilizacao < 0.6)) continue; // há vaga sobrando → regra 4
    if (naoAtendidas(c) >= Math.ceil(20 * escala)) lacunas.push({ eixo: linha.eixo, ...c, fora: naoAtendidas(c) });
  }
  for (const l of lacunas.sort((a, b) => b.fora - a.fora).slice(0, 2)) {
    const ociosa = salaTurno.filter(s => s.turno === l.turno && s.ocupacao !== null).sort((a, b) => a.ocupacao - b.ocupacao)[0];
    insights.push({ severidade: "alta", tipo: "turno", titulo: `Abrir turma de ${l.eixo.toLowerCase()} no turno da ${NOME_TURNO[l.turno]}`,
      detalhe: `${l.fora} das ${l.buscas} buscas nesse turno não receberam opção no horário pedido.` + (ociosa ? ` A ${ociosa.sala} fica só ${pct(ociosa.ocupacao)} ocupada nesse turno.` : ""),
      decisao: ociosa ? `Usar a ${ociosa.sala} no turno da ${NOME_TURNO[l.turno]} para a nova turma.` : "Negociar uma nova turma nesse turno." });
  }

  // 3. FALTAS
  for (const s of porServico) {
    if (s.comparecimento !== null && s.comparecimento < 0.7 && s.faltas >= Math.ceil(3 * escala)) {
      insights.push({ severidade: "media", tipo: "faltas", titulo: `Muitas faltas: ${s.titulo}`,
        detalhe: `Comparecimento de ${pct(s.comparecimento)} (${s.faltas} faltas no período).`,
        decisao: "Enviar lembrete por WhatsApp/SMS um dia antes e liberar a vaga de quem não confirmar." });
    }
  }

  // 4. VAGAS OCIOSAS — e, se a busca não encontra o serviço, revisar o agente
  for (const s of porServico) {
    if (s.utilizacao === null || s.utilizacao >= 0.4 || s.vagasOfertadas < 5) continue;
    insights.push({ severidade: "media", tipo: "divulgar", titulo: `Vagas ociosas: ${s.titulo}`,
      detalhe: `Só ${pct(s.utilizacao)} das ${s.vagasOfertadas} vagas foram usadas; quando recomendado, converte ${pct(s.conversao)}.`,
      decisao: "Reforçar a divulgação para o público-alvo ou revisar horário e formato." });
  }
  for (const linha of matrizTurno) {
    const total = linha.turnos.reduce((a, c) => a + c.buscas, 0);
    const semRes = linha.turnos.reduce((a, c) => a + (c.semResultado ?? 0) * c.buscas, 0);
    const ocioso = porServico.some(s => s.eixo === linha.eixo && s.utilizacao !== null && s.utilizacao < 0.6);
    if (total >= Math.ceil(20 * escala) && semRes / total > 0.35 && ocioso) {
      insights.push({ severidade: "media", tipo: "agente", titulo: `Revisar o vocabulário do agente IA em ${linha.eixo.toLowerCase()}`,
        detalhe: `${Math.round((semRes / total) * 100)}% das buscas desse eixo ficaram sem recomendação, mas há vagas sobrando nele.`,
        decisao: "Adicionar palavras-chave aos serviços (ex.: vender, doces, artesanato) e reavaliar o score mínimo." });
    }
  }

  // 5. CONFORTO — sensores de temperatura
  for (const s of salaTurno) {
    if (s.horasAcima30 >= Math.ceil(5 * escala)) {
      insights.push({ severidade: "alta", tipo: "conforto", titulo: `Climatização da ${s.sala} no turno da ${NOME_TURNO[s.turno]}`,
        detalhe: `${s.horasAcima30} horas com temperatura acima de ${LIMITE_TEMPERATURA} °C (máxima de ${s.tempMax} °C).`,
        decisao: "Instalar ventilação/ar-condicionado ou transferir a turma para uma sala mais fresca." });
    }
  }
  const ordem = { alta: 0, media: 1 };
  return insights.sort((a, b) => ordem[a.severidade] - ordem[b.severidade]);
}
