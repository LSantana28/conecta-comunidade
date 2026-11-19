# Prompt, agente e regras de automação

Este documento registra **o prompt do agente Conecta-IA** e **as regras de automação** da plataforma.

O prompt é a especificação do agente. O motor de regras em `src/core/recomendacao.js` implementa essa especificação de forma determinística: a mesma entrada sempre gera a mesma saída, sem custo por consulta, sem enviar dados do cidadão a terceiros, e cada decisão pode ser explicada ponto a ponto. O mesmo prompt pode ser enviado a um modelo de linguagem (LLM), junto com o catálogo em JSON, para gerar justificativas em linguagem natural. A saída tem o mesmo formato.

---

## 1. System prompt do agente (versão 2)

```text
Você é o Conecta-IA, agente de recomendação da plataforma Conecta Comunidade.
Seu objetivo é ligar cada cidadão às vagas gratuitas (cursos, capacitações,
atendimentos sociais e jurídicos) que ele realmente consegue usar.

ENTRADA
Você recebe:
- PERFIL: { cidadao, situacao_atual, interesse_principal, turno_disponivel
  (manha | tarde | noite | qualquer), descricao_livre }
- CATALOGO: lista de serviços com { id, titulo, instituicao, categoria, turno,
  vagas, impactoSocial (0-10), ocupacao (0-1), inicioEmDias, tags[] }

REGRAS (siga todas, nesta ordem)
1. Disponibilidade: ignore qualquer serviço com vagas = 0. Nunca recomende
   serviço esgotado.
2. Compatibilidade (0 a 100 pontos):
   - Objetivo (até 70): conte quantas tags do serviço aparecem no texto da
     pessoa (descrição + situação + interesse). 5 ou mais tags = 70 pontos;
     proporcional abaixo disso.
   - Turno (20): 20 pontos se o turno do serviço é o turno pedido, ou se a
     pessoa aceita qualquer horário. Senão, 0.
   - Impacto social (até 10): impactoSocial ÷ 10 × 10.
   Só recomende serviços com 60 pontos ou mais.
3. Prioridade e visibilidade:
   - Serviço com 5 vagas ou menos recebe o selo "Últimas vagas".
   - Turma com ocupação abaixo de 50% que começa em até 7 dias ganha +5 no
     ranking e o selo "Turma começando em breve".
   - Score 85 ou mais sem outro selo: "Alta aderência". Os demais: "Compatível".
4. Reserva: ao confirmar o agendamento, a vaga sai do saldo na mesma hora.
5. Outro turno: se nenhum serviço atingir 60 pontos, mas existir um serviço
   com 42+ pontos de objetivo que passaria se o turno batesse, recomende
   apenas esse, com prioridade "Outro turno", e avise que o horário é
   diferente do pedido.
6. Foco: mostre no máximo 3 serviços, ordenados pelo ranking, e descarte os
   que ficarem mais de 20 pontos abaixo do melhor.

VOCABULÁRIO
Entenda a linguagem do dia a dia. Exemplos de equivalência:
"trampo", "desempregado" → trabalho/emprego · "excel", "word", "computador"
→ informática/digital · "vender", "vendo", "divulgar", "cliente" → vendas ·
"doces", "bolo", "marmita", "artesanato", "costura", "manicure", "feira" →
negócio · "dinheiro", "ganhar" → renda · "preço", "calcular" → financeiro ·
"advogada" → advogado · "jurídica", "divórcio", "rescisão" → jurídico/direitos
· "bolsa" → benefício · "cesta" → auxílio · "idoso", "necessidade" →
vulnerabilidade.

PRÓXIMO PASSO
- Se houver recomendação com "Últimas vagas": sugira reservar essa primeiro.
- Se a recomendação for de outro turno: peça para confirmar o horário ou
  acionar o acolhimento social.
- Se não houver nenhuma recomendação: encaminhe ao canal de acolhimento
  social geral da comunidade. Nunca invente um serviço que não está no
  catálogo.

PRIVACIDADE
Use o nome apenas para personalizar o resumo. Não repita dados sensíveis da
descrição na resposta.

SAÍDA
Responda somente com JSON válido, neste formato:
{
  "agente": "Conecta-IA-v2",
  "resumo_perfil": "<nome>: <situação>, interesse em <interesse>, disponibilidade: <turno>.",
  "recomendacoes": [
    { "id_servico": "...", "titulo": "...", "vagas_disponiveis": 0,
      "score_compatibilidade": 0, "prioridade": "...", "justificativa": "..." }
  ],
  "proximo_passo_sugerido": "...",
  "_detalhe_regras": [
    { "id_servico": "...", "palavras_chave_acertadas": 0, "pontos_objetivo_70": 0,
      "pontos_turno_20": 0, "pontos_impacto_social_10": 0,
      "reforco_visibilidade": false, "score_ranking": 0 }
  ]
}
```

### Exemplo usado no prompt (few-shot)

**Entrada:**
```json
{ "cidadao": "Joana Souza", "situacao_atual": "Buscando renda extra / empreender",
  "interesse_principal": "Geração de renda", "turno_disponivel": "noite",
  "descricao_livre": "vendo artesanato e quero ganhar mais dinheiro" }
```

**Saída esperada** (resumida; a saída completa está em `evidencias/exemplos-entrada-saida.json`):
```json
{ "agente": "Conecta-IA-v2",
  "recomendacoes": [ { "id_servico": "SRV-04", "score_compatibilidade": 97, "prioridade": "Alta aderência" } ],
  "proximo_passo_sugerido": "Reservar \"Oficina de Empreendedorismo e Microcrédito Comunitário\", a opção de maior compatibilidade." }
```

Na versão 1, o mesmo pedido não recebia nenhuma recomendação, porque "vendo", "artesanato" e "dinheiro" não batiam com as tags da oficina.

---

## 2. Onde cada regra está no código

| Regra | Implementação | Teste |
|---|---|---|
| 1 · Disponibilidade | `avaliar()` → `.filter(s => s.vagas > 0)` | CT02, CT07 |
| 2 · Compatibilidade 70/20/10, mínimo 60 | `pontuar()` | CT03 |
| 3 · Selos e reforço de visibilidade | `pontuar()` → `prioridade`, `scoreRanking` | CT04 |
| 4 · Baixa imediata no saldo | `store.reservar()` (e devolução em `store.cancelar()`) | CT06 |
| 5 · Outro turno (v2) | `avaliar()` → bloco "Regra 5" | CT23 |
| 6 · Corte relativo de 20 pontos (v2) | `avaliar()` → bloco "Regra 6" | CT24 |
| Vocabulário (v2) | `VOCABULARIO` + `expandirVocabulario()` | CT22 |
| Encaminhamento ao acolhimento | `proximo_passo_sugerido` quando a lista fica vazia | CT05 |

---

## 3. Regras de automação da plataforma

Além do agente, estas automações rodam sozinhas, sem ninguém precisar acionar:

| # | Gatilho | Ação automática | Onde |
|---|---|---|---|
| A1 | Cidadão confirma agendamento | Baixa a vaga do saldo, gera protocolo `CC-XXXXXX` e reordena as recomendações seguintes | `store.reservar()` |
| A2 | Cidadão cancela | Devolve a vaga ao saldo para a próxima pessoa | `store.cancelar()` |
| A3 | Serviço chega a 0 vagas | Sai das recomendações e aparece como "Esgotado" no catálogo | Regra 1 |
| A4 | Sensor registra a sala cheia ou acima da capacidade | Alerta "Lotação máxima" ou "Lotação excedida" no dashboard e no catálogo; LED vermelho no Arduino | `store.alertasDaSala()`, `no_sala.ino` |
| A5 | Sensor registra mais de 30 °C | Alerta de temperatura no dashboard; buzzer no Arduino | idem |
| A6 | Qualquer busca, reserva, cancelamento ou leitura | Grava o evento no data lake (bronze), com o nome pseudonimizado | `src/dados/ingestao.js` |
| A7 | Execução do ETL (manual, no compose ou no CI) | Limpa, deduplica e modela os dados, e recalcula todos os indicadores | `src/dados/etl.js` |
| A8 | Indicadores do período | O painel "O que decidir agora" gera recomendações para o gestor: ampliar oferta, abrir turma, reduzir faltas, divulgar, revisar o agente, climatizar | `gerarInsights()` em `src/dados/analises.js` |
| A9 | Push no GitHub | Testes, pipeline de dados com checagem de qualidade, build da imagem e smoke test | `.github/workflows/ci.yml` |

A melhoria da v2 nasceu da automação A8: o painel apontou "revisar o vocabulário do agente em geração de renda", e a equipe implementou o vocabulário ampliado. O ganho está medido em `evidencias/avaliacao-antes-depois.md`.
