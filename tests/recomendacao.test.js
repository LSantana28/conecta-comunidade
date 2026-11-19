// Testes unitários do agente de recomendação (Regras 1, 2 e 3)
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { avaliar, pontuar, palavrasDe, SCORE_MINIMO } from "../src/core/recomendacao.js";
import { medir, muralSemIA, agente, PERFIS_ROTULADOS, PERFIS_VALIDACAO } from "../src/core/avaliacao.js";
import { catalogoInicial, NOMES_TURNO } from "../src/core/catalogo.js";

const MARIA = {
  cidadao: "Maria Silva", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional",
  turno_disponivel: "qualquer",
  descricao_livre: "Estou desempregada há 3 meses, quero melhorar meu currículo e fazer cursos gratuitos para voltar ao mercado."
};
const CARLOS = {
  cidadao: "Carlos Eduardo", situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico",
  turno_disponivel: "tarde", descricao_livre: "Preciso de atendimento social e apoio jurídico gratuito para regularizar documentos da família."
};

describe("Agente de recomendação", () => {
  test("CT01 — Cenário emprego recomenda os 3 serviços de capacitação, ordenados e acima do score mínimo", () => {
    const saida = avaliar(MARIA, catalogoInicial(), NOMES_TURNO);
    assert.equal(saida.agente, "Conecta-IA-v2");
    assert.deepEqual(saida.recomendacoes.map(r => r.id_servico).sort(), ["SRV-01", "SRV-02", "SRV-03"]);
    assert.ok(saida.recomendacoes.every(r => r.score_compatibilidade >= SCORE_MINIMO));
    const ranking = saida._detalhe_regras.map(d => d.score_ranking);
    assert.deepEqual(ranking, [...ranking].sort((a, b) => b - a), "ranking deve estar em ordem decrescente");
    assert.match(saida.proximo_passo_sugerido, /Orientação Profissional/); // prioriza o de poucas vagas
  });

  test("CT01v1 — A versão 1 continua disponível e com o mesmo resultado (histórico do data lake)", () => {
    const saida = avaliar(MARIA, catalogoInicial(), NOMES_TURNO, { versao: 1 });
    assert.equal(saida.agente, "Conecta-IA-v1");
    assert.deepEqual(saida.recomendacoes.map(r => [r.id_servico, r.score_compatibilidade]), [["SRV-02", 97], ["SRV-01", 84], ["SRV-03", 85]]);
  });

  test("CT01b — Cenário social/jurídico no turno da tarde prioriza o plantão jurídico", () => {
    const saida = avaliar(CARLOS, catalogoInicial(), NOMES_TURNO);
    assert.equal(saida.recomendacoes[0].id_servico, "SRV-06");
    assert.ok(saida.recomendacoes.every(r => ["SRV-05", "SRV-06"].includes(r.id_servico)));
  });

  test("CT02 — Regra 1: serviço sem vagas nunca é recomendado", () => {
    const catalogo = catalogoInicial().map(s => s.id === "SRV-02" ? { ...s, vagas: 0 } : s);
    const ids = avaliar(MARIA, catalogo, NOMES_TURNO).recomendacoes.map(r => r.id_servico);
    assert.ok(!ids.includes("SRV-02"));
  });

  test("CT03 — Regra 2: turno incompatível retira exatamente 20 pontos", () => {
    const servico = catalogoInicial().find(s => s.id === "SRV-01"); // manhã
    const palavras = palavrasDe(MARIA);
    const compativel = pontuar(servico, { ...MARIA, turno_disponivel: "manha" }, palavras);
    const incompativel = pontuar(servico, { ...MARIA, turno_disponivel: "noite" }, palavras);
    assert.equal(compativel.score - incompativel.score, 20);
    assert.equal(compativel.objetivo + compativel.turno_pts + compativel.impacto, compativel.score);
    assert.ok(compativel.objetivo <= 70 && compativel.impacto <= 10);
  });

  test("CT04 — Regra 3: selo 'Últimas vagas' (<=5) e reforço de visibilidade para turma ociosa", () => {
    const [s1, , s3] = catalogoInicial();
    const palavras = palavrasDe(MARIA);
    const r3 = pontuar(s3, MARIA, palavras);           // 5 vagas
    const r1 = pontuar(s1, MARIA, palavras);           // ocupação 40%, começa em 5 dias
    assert.equal(r3.prioridade, "Últimas vagas");
    assert.equal(r1.reforco, true);
    assert.equal(r1.scoreRanking, r1.score + 5);
    assert.equal(r1.prioridade, "Turma começando em breve");
  });

  test("CT05 — Perfil sem aderência: nenhuma recomendação e encaminha ao acolhimento", () => {
    const saida = avaliar({
      cidadao: "Ana", situacao_atual: "Querendo aprender novas habilidades", interesse_principal: "Geração de renda",
      turno_disponivel: "manha", descricao_livre: "gosto de música"
    }, catalogoInicial(), NOMES_TURNO);
    assert.equal(saida.recomendacoes.length, 0);
    assert.match(saida.proximo_passo_sugerido, /acolhimento social/);
  });

  test("CT05b — Acentos e maiúsculas não alteram o resultado", () => {
    const a = avaliar(MARIA, catalogoInicial(), NOMES_TURNO);
    const b = avaliar({ ...MARIA, descricao_livre: MARIA.descricao_livre.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "") }, catalogoInicial(), NOMES_TURNO);
    assert.deepEqual(a.recomendacoes.map(r => r.score_compatibilidade), b.recomendacoes.map(r => r.score_compatibilidade));
  });

  test("CT22 — v2 entende o vocabulário do dia a dia (melhoria vinda do dashboard de Big Data)", () => {
    const bolo = { cidadao: "Ana", situacao_atual: "Buscando renda extra / empreender", interesse_principal: "Geração de renda", turno_disponivel: "noite", descricao_livre: "vendo artesanato e quero ganhar mais dinheiro" };
    assert.equal(avaliar(bolo, catalogoInicial(), NOMES_TURNO, { versao: 1 }).recomendacoes.length, 0, "v1 não reconhecia");
    assert.equal(avaliar(bolo, catalogoInicial(), NOMES_TURNO).recomendacoes[0].id_servico, "SRV-04");
    const violao = { ...bolo, situacao_atual: "Querendo aprender novas habilidades", turno_disponivel: "manha", descricao_livre: "quero aprender a tocar violão" };
    assert.equal(avaliar(violao, catalogoInicial(), NOMES_TURNO).recomendacoes.length, 0, "não inventa recomendação fora do catálogo");
  });

  test("CT23 — Regra 5: sem opção no turno pedido, sugere a mais próxima em outro turno e avisa", () => {
    const noite = { cidadao: "João", situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico", turno_disponivel: "noite", descricao_livre: "preciso de ajuda jurídica mas só posso à noite" };
    assert.equal(avaliar(noite, catalogoInicial(), NOMES_TURNO, { versao: 1 }).recomendacoes.length, 0);
    const v2 = avaliar(noite, catalogoInicial(), NOMES_TURNO);
    assert.equal(v2.recomendacoes.length, 1);
    assert.equal(v2.recomendacoes[0].id_servico, "SRV-06");
    assert.equal(v2.recomendacoes[0].prioridade, "Outro turno");
    assert.match(v2.proximo_passo_sugerido, /Não há opção no turno pedido/);
  });

  test("CT24 — Regra 6: nenhuma recomendação fica 20+ pontos abaixo da melhor", () => {
    for (const p of PERFIS_ROTULADOS) {
      const r = avaliar({ cidadao: "x", ...p }, catalogoInicial(), NOMES_TURNO).recomendacoes;
      const scores = r.map(x => x.score_compatibilidade);
      if (scores.length > 1) assert.ok(Math.max(...scores) - Math.min(...scores) <= 20, p.id);
    }
  });

  test("CT25 — Ganho medido (validação, perfis não usados no ajuste): v2 > v1 > mural sem IA", () => {
    const cat = catalogoInicial();
    const mural = medir(muralSemIA, cat, PERFIS_VALIDACAO), v1 = medir(agente(1), cat, PERFIS_VALIDACAO), v2 = medir(agente(2), cat, PERFIS_VALIDACAO);
    assert.ok(v2.acerto1 > v1.acerto1 && v1.acerto1 > mural.acerto1, "acerto da 1ª sugestão");
    assert.ok(v2.precisao3 >= v1.precisao3 && v1.precisao3 > mural.precisao3, "precisão das sugestões");
    assert.equal(v2.semResposta, 0, "ninguém com opção certa fica sem resposta");
    assert.equal(v2.encaminhamentoCorreto, 1, "pedidos fora do catálogo vão para o acolhimento");
    const lotado = cat.map(s => s.id === "SRV-06" ? { ...s, vagas: 0 } : s);
    assert.ok(medir(muralSemIA, lotado).perfisComEsgotado > 0.3, "sem IA, 1 em cada 3 pessoas vê vaga esgotada");
    assert.equal(medir(agente(2), lotado).perfisComEsgotado, 0);
  });
});
