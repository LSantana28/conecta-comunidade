// ===== NÚCLEO DO AGENTE IA: regras de recomendação (puro, sem DOM e sem I/O) =====
// Mesmas regras do protótipo original, agora isoladas para serem testadas.
//  Regra 1 — só recomenda serviços com vagas > 0
//  Regra 2 — score = 70% aderência ao objetivo + 20% turno + 10% impacto social
//  Regra 3 — selo "Últimas vagas" (<= 5) e reforço de visibilidade p/ turmas ociosas que começam logo
//  Regra 4 — baixa imediata no saldo ao reservar (aplicada no store do servidor)

export const SCORE_MINIMO = 60;
export const PESO_OBJETIVO = 70;
export const PESO_TURNO = 20;
export const PESO_IMPACTO = 10;
export const ACERTOS_PARA_NOTA_MAX = 5;
export const LIMITE_ULTIMAS_VAGAS = 5;
export const BONUS_VISIBILIDADE = 5;
export const OCUPACAO_BAIXA = 0.5;
export const DIAS_PROXIMO_INICIO = 7;
export const MAX_RECOMENDACOES = 3;

export function normalizar(txt) {
  return String(txt ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function palavrasDe(entrada) {
  const base = [entrada.descricao_livre, entrada.situacao_atual, entrada.interesse_principal].join(" ");
  return normalizar(base).split(/\W+/).filter(p => p.length > 2);
}

export function contarAcertos(tags, palavras) {
  return tags.filter(tag => palavras.some(p => p.includes(tag) || (p.length >= 5 && tag.includes(p)))).length;
}

export function pontuar(servico, entrada, palavras) {
  const acertos = contarAcertos(servico.tags, palavras);
  const objetivo = Math.round(Math.min(1, acertos / ACERTOS_PARA_NOTA_MAX) * PESO_OBJETIVO);
  const turno = (entrada.turno_disponivel === "qualquer" || entrada.turno_disponivel === servico.turno) ? PESO_TURNO : 0;
  const impacto = Math.round(servico.impactoSocial / 10 * PESO_IMPACTO);
  const score = objetivo + turno + impacto;

  const ultimasVagas = servico.vagas <= LIMITE_ULTIMAS_VAGAS;
  const reforco = servico.ocupacao < OCUPACAO_BAIXA && servico.inicioEmDias <= DIAS_PROXIMO_INICIO;
  const scoreRanking = score + (reforco ? BONUS_VISIBILIDADE : 0);

  let prioridade = "Compatível";
  if (ultimasVagas) prioridade = "Últimas vagas";
  else if (reforco) prioridade = "Turma começando em breve";
  else if (score >= 85) prioridade = "Alta aderência";

  return { acertos, objetivo, turno_pts: turno, impacto, score, reforco, scoreRanking, prioridade };
}

export function avaliar(entrada, servicos, nomesTurno = {}) {
  const palavras = palavrasDe(entrada);

  const avaliados = servicos
    .filter(s => s.vagas > 0)                               // Regra 1
    .map(s => ({ ...s, ...pontuar(s, entrada, palavras) }))  // Regras 2 e 3
    .filter(s => s.score >= SCORE_MINIMO)
    .sort((a, b) => b.scoreRanking - a.scoreRanking)
    .slice(0, MAX_RECOMENDACOES);

  const turnoLabel = nomesTurno[entrada.turno_disponivel] || entrada.turno_disponivel;
  const urgente = avaliados.find(r => r.vagas <= LIMITE_ULTIMAS_VAGAS);
  let proximo;
  if (!avaliados.length) {
    proximo = `Nenhum serviço atingiu o score mínimo (${SCORE_MINIMO}). Acionar o canal de acolhimento social geral da comunidade.`;
  } else if (urgente) {
    proximo = `Reservar primeiro "${urgente.titulo}" devido ao número reduzido de vagas (${urgente.vagas}).`;
  } else {
    proximo = `Reservar "${avaliados[0].titulo}", a opção de maior compatibilidade.`;
  }

  return {
    agente: "Conecta-IA-v1",
    resumo_perfil: `${entrada.cidadao}: ${entrada.situacao_atual.toLowerCase()}, interesse em ${entrada.interesse_principal.toLowerCase()}, disponibilidade: ${String(turnoLabel).toLowerCase()}.`,
    recomendacoes: avaliados.map(r => ({
      id_servico: r.id,
      titulo: r.titulo,
      instituicao: r.instituicao,
      categoria: r.categoria,
      turno: r.turno,
      vagas_disponiveis: r.vagas,
      score_compatibilidade: r.score,
      prioridade: r.prioridade,
      reforco_visibilidade: r.reforco,
      justificativa: r.justificativaBase
    })),
    proximo_passo_sugerido: proximo,
    _detalhe_regras: avaliados.map(r => ({
      id_servico: r.id,
      palavras_chave_acertadas: r.acertos,
      pontos_objetivo_70: r.objetivo,
      pontos_turno_20: r.turno_pts,
      pontos_impacto_social_10: r.impacto,
      reforco_visibilidade: r.reforco,
      score_ranking: r.scoreRanking
    }))
  };
}
