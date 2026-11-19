// ===== NÚCLEO DO AGENTE IA: regras de recomendação (puro, sem DOM e sem I/O) =====
// Documentação e prompt equivalente: docs/ia/README.md e docs/ia/prompt-do-agente.md
//  Regra 1 — só recomenda serviços com vagas > 0
//  Regra 2 — score = 70% aderência ao objetivo + 20% turno + 10% impacto social (mínimo 60)
//  Regra 3 — selo "Últimas vagas" (<= 5) e reforço de visibilidade p/ turmas ociosas que começam logo
//  Regra 4 — baixa imediata no saldo ao reservar (aplicada no store do servidor)
// Versão 2 (atual), a partir do que o dashboard de Big Data mostrou:
//  Vocabulário ampliado — palavras do dia a dia ligadas às tags dos serviços
//  Regra 5 — sem opção no turno pedido, sugere a mais próxima em outro turno (avisando)
//  Regra 6 — descarta opções 20+ pontos abaixo da melhor
// A versão 1 continua disponível (avaliar(..., { versao: 1 })) para comparação e para o histórico.

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
export const OBJETIVO_MINIMO_OUTRO_TURNO = 42; // Regra 5 (v2): 3+ palavras-chave em comum
export const CORTE_RELATIVO = PESO_TURNO;       // Regra 6 (v2): descarta opção 20+ pontos abaixo da melhor

export function normalizar(txt) {
  return String(txt ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function palavrasDe(entrada, versao = VERSAO_ATUAL) {
  const base = [entrada.descricao_livre, entrada.situacao_atual, entrada.interesse_principal].join(" ");
  const palavras = normalizar(base).split(/\W+/).filter(p => p.length > 2);
  return versao >= 2 ? expandirVocabulario(palavras) : palavras;
}

// ===== v2 — VOCABULÁRIO AMPLIADO =====
// Criado a partir do dashboard de Big Data, que mostrou buscas sem resultado mesmo com vagas
// sobrando ("vender", "doces", "artesanato"...). Liga palavras do dia a dia às tags dos serviços.
// Chaves no singular, sem acento.
export const VOCABULARIO = {
  // trabalho e emprego
  emprego: ["trabalho"], desempregado: ["trabalho", "emprego"], desempregada: ["trabalho", "emprego"],
  trampo: ["trabalho", "emprego"], demitido: ["trabalho", "emprego"], demitida: ["trabalho", "emprego"],
  qualificar: ["qualificacao"],
  // informática
  excel: ["informatica", "digital"], word: ["informatica", "digital"], digitacao: ["informatica"],
  internet: ["digital"], computador: ["digital", "informatica"], celular: ["digital"],
  // vendas e atendimento
  cliente: ["vendas", "qualificacao"], vendedor: ["vendas"], vendedora: ["vendas"], comercio: ["vendas"],
  // renda e empreendedorismo
  vender: ["vendas"], vendo: ["vendas"], venda: ["vendas"], divulgar: ["vendas"],
  doce: ["negocio"], bolo: ["negocio"], marmita: ["negocio"], salgado: ["negocio"], comida: ["negocio"],
  artesanato: ["negocio", "autonomo"], costura: ["negocio", "autonomo"], costuro: ["negocio", "autonomo"],
  roupa: ["negocio"], manicure: ["negocio", "autonomo"], feira: ["negocio"],
  dinheiro: ["renda"], ganhar: ["renda"], preco: ["financeiro"], calcular: ["financeiro"], financa: ["financeiro"],
  // social e jurídico
  juridica: ["juridico"], advogada: ["advogado"], divorcio: ["juridico", "direitos"], rescisao: ["direitos", "juridico"],
  violencia: ["direitos", "apoio"], bolsa: ["beneficio"], cesta: ["auxilio"], necessidade: ["vulnerabilidade"],
  idosa: ["vulnerabilidade"], idoso: ["vulnerabilidade"]
};

function singular(p) {
  return p.length > 4 && p.endsWith("s") ? p.slice(0, -1) : p;
}

export function expandirVocabulario(palavras) {
  const saida = new Set(palavras);
  for (const p of palavras) {
    const s = singular(p);
    saida.add(s);
    for (const termo of VOCABULARIO[s] ?? VOCABULARIO[p] ?? []) saida.add(termo);
  }
  return [...saida];
}

export function contarAcertos(tags, palavras) {
  return tags.filter(tag => palavras.some(p => p.includes(tag) || (p.length >= 5 && tag.includes(p)))).length;
}

export const VERSAO_ATUAL = 2;

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

export function avaliar(entrada, servicos, nomesTurno = {}, { versao = VERSAO_ATUAL } = {}) {
  const palavras = palavrasDe(entrada, versao);

  const pontuados = servicos
    .filter(s => s.vagas > 0)                               // Regra 1
    .map(s => ({ ...s, ...pontuar(s, entrada, palavras) })); // Regras 2 e 3
  let avaliados = pontuados
    .filter(s => s.score >= SCORE_MINIMO)
    .sort((a, b) => b.scoreRanking - a.scoreRanking)
    .slice(0, MAX_RECOMENDACOES);

  // Regra 6 (v2): com o vocabulário maior, mais serviços passam do mínimo. Mostra só os que
  // estão a menos de "um turno" (20 pontos) da melhor opção, para não diluir a lista.
  if (versao >= 2 && avaliados.length) {
    const melhor = Math.max(...avaliados.map(s => s.score));
    avaliados = avaliados.filter(s => melhor - s.score < CORTE_RELATIVO + 1);
  }

  // Regra 5 (v2): ninguém sai sem resposta se existe um serviço certo em OUTRO turno.
  // Se nada passou, sugere o melhor serviço que passaria caso o turno batesse.
  let outroTurno = null;
  if (versao >= 2 && !avaliados.length) {
    outroTurno = pontuados
      .filter(s => s.turno_pts === 0 && s.objetivo >= OBJETIVO_MINIMO_OUTRO_TURNO && s.score + PESO_TURNO >= SCORE_MINIMO)
      .sort((a, b) => b.scoreRanking - a.scoreRanking)[0] ?? null;
    if (outroTurno) avaliados = [{ ...outroTurno, prioridade: "Outro turno" }];
  }

  const turnoLabel = nomesTurno[entrada.turno_disponivel] || entrada.turno_disponivel;
  const urgente = avaliados.find(r => r.vagas <= LIMITE_ULTIMAS_VAGAS);
  let proximo;
  if (outroTurno) {
    proximo = `Não há opção no turno pedido. A mais próxima é "${outroTurno.titulo}" no turno da ${String(nomesTurno[outroTurno.turno] || outroTurno.turno).toLowerCase()}; confirme se a pessoa consegue esse horário ou acione o acolhimento social.`;
  } else if (!avaliados.length) {
    proximo = `Nenhum serviço atingiu o score mínimo (${SCORE_MINIMO}). Acionar o canal de acolhimento social geral da comunidade.`;
  } else if (urgente) {
    proximo = `Reservar primeiro "${urgente.titulo}" devido ao número reduzido de vagas (${urgente.vagas}).`;
  } else {
    proximo = `Reservar "${avaliados[0].titulo}", a opção de maior compatibilidade.`;
  }

  return {
    agente: `Conecta-IA-v${versao}`,
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
