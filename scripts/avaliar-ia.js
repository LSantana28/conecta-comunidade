// Avaliação antes × depois do agente IA. Gera docs/ia/evidencias/avaliacao-antes-depois.{md,json}
// e exemplos reais de entrada e saída. Uso: npm run ia:avaliar
import fs from "node:fs";
import path from "node:path";
import { medir, muralSemIA, agente, PERFIS_ROTULADOS, PERFIS_VALIDACAO } from "../src/core/avaliacao.js";
import { avaliar } from "../src/core/recomendacao.js";
import { catalogoInicial, NOMES_TURNO } from "../src/core/catalogo.js";

const saida = path.resolve("docs/ia/evidencias");
fs.mkdirSync(saida, { recursive: true });
const cat = catalogoInicial();
const lotado = cat.map(s => (s.id === "SRV-06" ? { ...s, vagas: 0 } : s));
const estrategias = [["Antes: mural de vagas sem IA", muralSemIA], ["Agente IA v1", agente(1)], ["Agente IA v2 (atual)", agente(2)]];

const resultado = {};
for (const [conjunto, perfis] of [["validacao", PERFIS_VALIDACAO], ["ajuste", PERFIS_ROTULADOS]]) {
  resultado[conjunto] = estrategias.map(([nome, fn]) => {
    const { detalhe, ...m } = medir(fn, cat, perfis);
    return { estrategia: nome, ...m, perfisComEsgotado: medir(fn, lotado, perfis).perfisComEsgotado, detalhe };
  });
}

const pct = v => (v === null ? "—" : `${(v * 100).toFixed(1).replace(".", ",")}%`);
const LINHAS = [
  ["acerto1", "1ª sugestão é adequada", "maior"],
  ["cobertura3", "Alguma das sugestões é adequada", "maior"],
  ["precisao3", "Sugestões que são adequadas (precisão)", "maior"],
  ["semResposta", "Tinha opção certa e ficou sem resposta", "menor"],
  ["encaminhamentoCorreto", "Pedido fora do catálogo → encaminhou ao acolhimento", "maior"],
  ["turnoCompativel", "Sugestões no turno pedido", "maior"],
  ["perfisComEsgotado", "Viu serviço esgotado (plantão jurídico lotado)", "menor"]
];
function tabela(lista) {
  const cab = `| Métrica | ${lista.map(r => r.estrategia).join(" | ")} |\n|---|${lista.map(() => "---:").join("|")}|`;
  return cab + "\n" + LINHAS.map(([k, rot, melhor]) => {
    const vals = lista.map(r => r[k]);
    const alvo = melhor === "maior" ? Math.max(...vals.filter(v => v !== null)) : Math.min(...vals.filter(v => v !== null));
    return `| ${rot} | ${vals.map(v => (v === alvo ? `**${pct(v)}**` : pct(v))).join(" | ")} |`;
  }).join("\n");
}

const md = `# Avaliação do agente IA — antes × depois

Gerado por \`npm run ia:avaliar\` em ${new Date().toLocaleString("pt-BR")}.

- **Antes (sem IA):** mural de vagas. A pessoa escolhe a categoria e lê os 3 primeiros serviços na ordem de publicação (inclusive esgotados).
- **Agente v1:** regras 1 a 4 (protótipo original).
- **Agente v2 (atual):** v1 + vocabulário ampliado + Regra 5 (outro turno) + Regra 6 (corte relativo).

Gabarito: para cada perfil, os serviços que um atendente social indicaria (regra de rotulagem em \`src/core/avaliacao.js\`).

## Conjunto de validação (${PERFIS_VALIDACAO.length} perfis, **não usados** para ajustar a v2)

Este é o número honesto, que mostra o ganho em pedidos que a IA nunca viu.

${tabela(resultado.validacao)}

## Conjunto de ajuste (${PERFIS_ROTULADOS.length} perfis, usados para criar o vocabulário da v2)

Aqui a v2 é favorecida por construção (o vocabulário foi escrito olhando esses erros). Serve para mostrar o que foi corrigido.

${tabela(resultado.ajuste)}

## Erros restantes da v2 (validação)

${resultado.validacao[2].detalhe.filter(d => !d.acertou).map(d => `- ${d.id}: sugeriu ${d.recomendados.join(", ") || "nada"}; o esperado era ${d.adequados.join(" ou ") || "nenhuma recomendação"}`).join("\n") || "- nenhum"}
`;
fs.writeFileSync(path.join(saida, "avaliacao-antes-depois.md"), md);
fs.writeFileSync(path.join(saida, "avaliacao-antes-depois.json"), JSON.stringify(resultado, null, 2));

// Exemplos de entrada e saída (demonstração)
const exemplos = [
  { cenario: "Busca de emprego", entrada: { cidadao: "Maria Silva", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional", turno_disponivel: "qualquer", descricao_livre: "Estou desempregada há 3 meses, quero melhorar meu currículo e fazer cursos gratuitos para voltar ao mercado." } },
  { cenario: "Apoio social e jurídico", entrada: { cidadao: "Carlos Eduardo", situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico", turno_disponivel: "tarde", descricao_livre: "Preciso de atendimento social e apoio jurídico gratuito para regularizar documentos da família." } },
  { cenario: "Renda com vocabulário do dia a dia (v1 × v2)", entrada: { cidadao: "Joana Souza", situacao_atual: "Buscando renda extra / empreender", interesse_principal: "Geração de renda", turno_disponivel: "noite", descricao_livre: "vendo artesanato e quero ganhar mais dinheiro" }, comparar: true },
  { cenario: "Sem opção no turno pedido (Regra 5)", entrada: { cidadao: "João Pereira", situacao_atual: "Precisando de atendimento social ou jurídico", interesse_principal: "Apoio social e jurídico", turno_disponivel: "noite", descricao_livre: "preciso de ajuda jurídica mas só posso à noite" }, comparar: true },
  { cenario: "Fora do catálogo → acolhimento", entrada: { cidadao: "Ana Lima", situacao_atual: "Querendo aprender novas habilidades", interesse_principal: "Geração de renda", turno_disponivel: "manha", descricao_livre: "quero aprender a tocar violão" } }
].map(e => ({
  cenario: e.cenario,
  entrada: e.entrada,
  saida: avaliar(e.entrada, cat, NOMES_TURNO),
  ...(e.comparar ? { saida_v1: avaliar(e.entrada, cat, NOMES_TURNO, { versao: 1 }) } : {})
}));
fs.writeFileSync(path.join(saida, "exemplos-entrada-saida.json"), JSON.stringify(exemplos, null, 2));

console.log(md);
console.log(`Arquivos gravados em ${path.relative(process.cwd(), saida)}/`);
