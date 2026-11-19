// AVALIAÇÃO DO AGENTE (antes × depois)
// Conjunto de perfis rotulados: para cada pedido, os serviços que um atendente social
// indicaria ("adequados"). Regra de rotulagem:
//   1. serviço que resolve a necessidade descrita E cabe no turno pedido;
//   2. se nenhum serviço do catálogo cabe no turno, vale o que resolve a necessidade em outro turno;
//   3. se nenhum serviço resolve a necessidade, a lista fica vazia (o certo é encaminhar ao acolhimento).
// O texto imita a escrita real de cidadãos (gírias, erros, sem acento).
import { avaliar } from "./recomendacao.js";
import { NOMES_TURNO } from "./catalogo.js";

const EMP = "Procurando emprego", REN = "Buscando renda extra / empreender", SOC = "Precisando de atendimento social ou jurídico", APR = "Querendo aprender novas habilidades";
const CAP = "Capacitação profissional", GER = "Geração de renda", APO = "Apoio social e jurídico";

export const PERFIS_ROTULADOS = [
  // ---- Capacitação e emprego ----
  { id: "P01", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "qualquer", descricao_livre: "Estou desempregada há 3 meses, quero melhorar meu currículo e fazer cursos gratuitos", adequados: ["SRV-01", "SRV-02", "SRV-03"] },
  { id: "P02", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "manha", descricao_livre: "Quero aprender informática e computador para conseguir trabalho", adequados: ["SRV-01"] },
  { id: "P03", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "manha", descricao_livre: "preciso aprender excel e word pra arrumar emprego", adequados: ["SRV-01"] },
  { id: "P04", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "noite", descricao_livre: "trabalho de dia, quero revisar meu currículo e treinar para entrevista", adequados: ["SRV-03"] },
  { id: "P05", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "tarde", descricao_livre: "quero trabalhar no comércio como vendedora, fazer curso de atendimento", adequados: ["SRV-02"] },
  { id: "P06", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "noite", descricao_livre: "to sem trampo, queria uma ajuda pra montar curriculo", adequados: ["SRV-03"] },
  { id: "P07", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "manha", descricao_livre: "quero mexer no computador, nunca usei", adequados: ["SRV-01"] },
  { id: "P08", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "qualquer", descricao_livre: "quero fazer um curso de digitação e internet", adequados: ["SRV-01"] },
  { id: "P09", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "tarde", descricao_livre: "fui demitido e quero me qualificar rápido para voltar a trabalhar", adequados: ["SRV-02"] },
  { id: "P10", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "noite", descricao_livre: "quero um curso de informática mas só posso estudar à noite", adequados: ["SRV-03", "SRV-01"] },
  { id: "P11", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "manha", descricao_livre: "preciso de orientação profissional, não sei que área seguir", adequados: ["SRV-03"] },
  { id: "P12", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "tarde", descricao_livre: "quero aprender atendimento ao cliente", adequados: ["SRV-02"] },
  { id: "P13", situacao_atual: SOC, interesse_principal: CAP, turno_disponivel: "qualquer", descricao_livre: "recebo benefício e quero fazer curso para trabalhar", adequados: ["SRV-01", "SRV-02", "SRV-03"] },
  // ---- Geração de renda ----
  { id: "P14", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "Faço doces e quero aprender a vender e empreender", adequados: ["SRV-04"] },
  { id: "P15", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "quero abrir um pequeno negócio e saber sobre microcrédito", adequados: ["SRV-04"] },
  { id: "P16", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "qualquer", descricao_livre: "preciso de renda extra, penso em ser autônomo", adequados: ["SRV-04"] },
  { id: "P17", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "vendo artesanato e quero ganhar mais dinheiro", adequados: ["SRV-04"] },
  { id: "P18", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "tarde", descricao_livre: "quero vender bolo de pote e não sei calcular o preço", adequados: ["SRV-04"] },
  { id: "P19", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "manha", descricao_livre: "sou manicure e quero divulgar meu trabalho para ter mais clientes", adequados: ["SRV-04"] },
  { id: "P20", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "qualquer", descricao_livre: "quero empreender e organizar as finanças do meu negócio", adequados: ["SRV-04"] },
  { id: "P21", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "costuro roupas e quero transformar isso em fonte de renda", adequados: ["SRV-04"] },
  { id: "P22", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "tarde", descricao_livre: "queria aprender a vender melhor na feira", adequados: ["SRV-04", "SRV-02"] },
  { id: "P23", situacao_atual: EMP, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "estou desempregado e penso em vender marmita", adequados: ["SRV-04"] },
  // ---- Apoio social e jurídico ----
  { id: "P24", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "Preciso de apoio jurídico gratuito com pensão do meu filho", adequados: ["SRV-06"] },
  { id: "P25", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "quero orientação de advogado sobre direitos trabalhistas", adequados: ["SRV-06"] },
  { id: "P26", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "preciso regularizar documentos da família", adequados: ["SRV-05", "SRV-06"] },
  { id: "P27", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "quero me cadastrar no bolsa família", adequados: ["SRV-05"] },
  { id: "P28", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "preciso de auxílio e cadastro no CRAS", adequados: ["SRV-05"] },
  { id: "P29", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "qualquer", descricao_livre: "o pai do meu filho não paga pensão", adequados: ["SRV-06"] },
  { id: "P30", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "preciso de uma advogada para o divórcio", adequados: ["SRV-06"] },
  { id: "P31", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "família passando necessidade, precisamos de cesta básica e benefício", adequados: ["SRV-05"] },
  { id: "P32", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "qualquer", descricao_livre: "perdi meus documentos e preciso tirar segunda via", adequados: ["SRV-05", "SRV-06"] },
  { id: "P33", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "meu patrão não pagou minha rescisão", adequados: ["SRV-06"] },
  { id: "P34", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "minha mãe é idosa, não tem renda e precisa de benefício do governo", adequados: ["SRV-05"] },
  { id: "P35", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "noite", descricao_livre: "preciso de ajuda jurídica mas só posso à noite", adequados: ["SRV-06"] },
  { id: "P36", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "sofri violência em casa e preciso de orientação sobre meus direitos", adequados: ["SRV-06"] },
  // ---- Fora do catálogo: o certo é não recomendar e encaminhar ao acolhimento ----
  { id: "P37", situacao_atual: APR, interesse_principal: GER, turno_disponivel: "manha", descricao_livre: "quero aprender a tocar violão", adequados: [] },
  { id: "P38", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "tarde", descricao_livre: "gostaria de aulas de natação", adequados: [] }
];

// Conjunto de VALIDAÇÃO: escrito depois do ajuste do vocabulário da v2 e nunca usado para ajustá-lo.
// É o número honesto de quanto a melhoria generaliza.
export const PERFIS_VALIDACAO = [
  { id: "V01", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "tarde", descricao_livre: "perdi o emprego e quero aprender a vender em loja", adequados: ["SRV-02"] },
  { id: "V02", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "manha", descricao_livre: "quero aprender a usar o computador para trabalhar em escritório", adequados: ["SRV-01"] },
  { id: "V03", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "noite", descricao_livre: "quero melhorar meu currículo e me preparar para entrevistas de emprego", adequados: ["SRV-03"] },
  { id: "V04", situacao_atual: EMP, interesse_principal: CAP, turno_disponivel: "qualquer", descricao_livre: "procuro curso gratuito de informática básica", adequados: ["SRV-01"] },
  { id: "V05", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "faço salgados para vender e quero aumentar minhas vendas", adequados: ["SRV-04"] },
  { id: "V06", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "qualquer", descricao_livre: "quero saber como conseguir microcrédito para minha lojinha", adequados: ["SRV-04"] },
  { id: "V07", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "tarde", descricao_livre: "trabalho com artesanato e preciso aprender a precificar", adequados: ["SRV-04"] },
  { id: "V08", situacao_atual: REN, interesse_principal: GER, turno_disponivel: "noite", descricao_livre: "sou cabeleireira e quero ter meu próprio negócio", adequados: ["SRV-04"] },
  { id: "V09", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "preciso atualizar o cadastro único da minha família", adequados: ["SRV-05"] },
  { id: "V10", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "meu ex-marido não paga a pensão das crianças", adequados: ["SRV-06"] },
  { id: "V11", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "estou sem renda e com filhos pequenos, preciso de ajuda", adequados: ["SRV-05"] },
  { id: "V12", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "tarde", descricao_livre: "fui demitida sem receber meus direitos", adequados: ["SRV-06"] },
  { id: "V13", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "qualquer", descricao_livre: "preciso de um advogado de graça", adequados: ["SRV-06"] },
  { id: "V14", situacao_atual: SOC, interesse_principal: APO, turno_disponivel: "manha", descricao_livre: "quero tirar documento de identidade para meu filho", adequados: ["SRV-05", "SRV-06"] },
  { id: "V15", situacao_atual: APR, interesse_principal: GER, turno_disponivel: "tarde", descricao_livre: "quero aprender a fazer bolo", adequados: [] },
  { id: "V16", situacao_atual: APR, interesse_principal: CAP, turno_disponivel: "noite", descricao_livre: "quero aprender inglês", adequados: [] }
];

const EIXO = { "Capacitação Profissional": CAP, "Qualificação": CAP, "Empregabilidade": CAP, "Geração de Renda": GER, "Atendimento Social": APO, "Serviço Jurídico": APO };

// ---------- Estratégias comparadas ----------
// ANTES: mural de vagas sem IA. A pessoa escolhe a categoria (interesse) e vê os serviços
// na ordem em que foram publicados, inclusive os esgotados. Lê os 3 primeiros.
export function muralSemIA(perfil, catalogo) {
  return catalogo.filter(s => EIXO[s.categoria] === perfil.interesse_principal).slice(0, 3).map(s => s.id);
}
export const agente = versao => (perfil, catalogo) =>
  avaliar({ cidadao: "Avaliação", ...perfil }, catalogo, NOMES_TURNO, { versao }).recomendacoes.map(r => r.id_servico);

// ---------- Métricas ----------
export function medir(estrategia, catalogo, perfis = PERFIS_ROTULADOS) {
  const turnoDe = Object.fromEntries(catalogo.map(s => [s.id, s.turno]));
  const esgotado = new Set(catalogo.filter(s => s.vagas <= 0).map(s => s.id));
  let comAlvo = 0, acerto1 = 0, cobertura = 0, adequadosTop3 = 0, itensTop3 = 0, semResposta = 0;
  let semAlvo = 0, encaminhouCerto = 0, itensTurno = 0, turnoOk = 0, comEsgotado = 0;
  const detalhe = [];
  for (const p of perfis) {
    const recs = estrategia(p, catalogo);
    const alvo = new Set(p.adequados.filter(id => !esgotado.has(id)));
    if (recs.some(id => esgotado.has(id))) comEsgotado++;
    for (const id of recs) { itensTurno++; if (p.turno_disponivel === "qualquer" || turnoDe[id] === p.turno_disponivel) turnoOk++; }
    if (alvo.size) {
      comAlvo++;
      if (recs.length && alvo.has(recs[0])) acerto1++;
      if (recs.some(id => alvo.has(id))) cobertura++;
      adequadosTop3 += recs.filter(id => alvo.has(id)).length;
      itensTop3 += recs.length;
      if (!recs.length) semResposta++;
    } else {
      semAlvo++;
      if (!recs.length) encaminhouCerto++;
    }
    detalhe.push({ id: p.id, recomendados: recs, adequados: [...alvo], acertou: recs.length ? alvo.has(recs[0]) : !alvo.size });
  }
  const r = (a, b) => (b ? Math.round((a / b) * 1000) / 1000 : null);
  return {
    perfis: perfis.length,
    acerto1: r(acerto1, comAlvo),                 // 1ª sugestão é adequada
    cobertura3: r(cobertura, comAlvo),            // alguma das 3 é adequada
    precisao3: r(adequadosTop3, itensTop3),       // fração das sugestões que são adequadas
    semResposta: r(semResposta, comAlvo),         // tinha opção certa e não recebeu nada
    encaminhamentoCorreto: r(encaminhouCerto, semAlvo), // fora do catálogo → não recomendou
    turnoCompativel: r(turnoOk, itensTurno),      // sugestões no turno pedido
    perfisComEsgotado: r(comEsgotado, perfis.length), // recebeu serviço sem vaga
    detalhe
  };
}
