# IA e automação — Conecta Comunidade

**Parte real do problema que a IA resolve:** quem procura um curso ou atendimento gratuito não sabe qual das vagas da comunidade serve para o seu caso e cabe no seu horário. Com isso, as vagas acabam ociosas ou vão para quem chegou primeiro. O agente **Conecta-IA** lê o pedido escrito do jeito da pessoa e indica, em segundos, as opções que ela realmente consegue usar.

| Item da Área 1 | Onde está |
|---|---|
| **01 · IA aplicada** | Agente de recomendação em `src/core/recomendacao.js`, usado pela API (`POST /api/recomendacoes`) e pela tela **Recomendações IA** → seção 1 |
| **02 · Prompts, agentes ou automação** | System prompt, regras 1 a 6 e automações A1 a A9 → [`prompt-do-agente.md`](prompt-do-agente.md) |
| **03 · Demonstração** | Tela com 3 cenários + JSON de entrada e saída → seção 3, prints `01`–`04` e `11`, [`evidencias/exemplos-entrada-saida.json`](evidencias/exemplos-entrada-saida.json) |
| **04 · Lógica e ganho** | Avaliação antes × depois com gabarito → seção 4 e [`evidencias/avaliacao-antes-depois.md`](evidencias/avaliacao-antes-depois.md) |

Uma versão em PDF deste documento e do prompt, pronta para anexar ao relatório, está em [`area1-ia-e-automacao.pdf`](area1-ia-e-automacao.pdf).

---

## 1. IA aplicada: o agente Conecta-IA

**Como o agente decide, passo a passo:**

1. **Recebe o perfil**: texto livre, situação, interesse e turno disponível.
2. **Entende o vocabulário**: "vendo" → vendas, "trampo" → trabalho, "advogada" → advogado (v2).
3. **Filtra e pontua (Regras 1 a 3)**: só serviços com vaga; score 70/20/10 com mínimo de 60; selos de prioridade.
4. **Garante resposta e foco (Regras 5 e 6)**: oferece outro turno quando nada cabe no pedido e descarta opções fracas (v2).
5. **Responde**: até 3 serviços com justificativa, cálculo e próximo passo.
6. **Ao agendar (Regra 4)**: a vaga sai do saldo na hora e as próximas recomendações já consideram isso.

**Características:**

- **Agente:** recebe o perfil, consulta o catálogo com o saldo de vagas atual e decide sozinho o que indicar, em que ordem e qual o próximo passo (reservar, confirmar horário ou encaminhar ao acolhimento).
- **Automação cognitiva:** interpreta texto livre ("to sem trampo", "quero vender bolo de pote") e transforma em critérios objetivos.
- **Explicável:** cada recomendação mostra o cálculo ("objetivo 70/70 · turno 20/20 · impacto 7/10"), e o JSON traz os pontos de cada regra. Um atendente pode conferir por que a IA indicou cada serviço.
- **Integrado ao resto da solução:** o saldo de vagas vem da operação, cada busca alimenta o data lake, e o dashboard de Big Data mede a conversão das recomendações em reservas.

## 2. Prompt e regras

O prompt completo (papel do agente, entrada, as 6 regras, vocabulário, próximo passo, privacidade e formato JSON de saída) e as 9 automações da plataforma estão em **[prompt-do-agente.md](prompt-do-agente.md)**.

Resumo das regras:

| Regra | O que faz | Versão |
|---|---|---|
| 1 | Nunca recomenda serviço sem vaga | v1 |
| 2 | Score = 70% objetivo + 20% turno + 10% impacto social, mínimo de 60 | v1 |
| 3 | Selos "Últimas vagas" (≤ 5) e "Turma começando em breve" (+5 no ranking) | v1 |
| 4 | Baixa imediata no saldo ao agendar | v1 |
| Vocabulário | Entende palavras do dia a dia (47 equivalências) | **v2** |
| 5 | Sem opção no turno pedido → sugere a mais próxima em outro turno, avisando | **v2** |
| 6 | Mostra só opções a menos de 20 pontos da melhor | **v2** |

## 3. Demonstração (entrada → saída)

Na tela **Recomendações IA**, os botões de cenário preenchem o perfil e executam o agente. A saída completa fica em *Evidência técnica — entrada e saída do agente (JSON)*.

| Cenário | Entrada (resumida) | Saída do agente (v2) |
|---|---|---|
| Busca de emprego | "Estou desempregada há 3 meses, quero melhorar meu currículo e fazer cursos gratuitos", qualquer turno | Informática (98), Orientação (99, últimas vagas), Qualificação (97). Próximo passo: reservar primeiro a Orientação, que tem 5 vagas |
| Apoio social e jurídico | "Preciso de atendimento social e apoio jurídico gratuito para regularizar documentos da família", tarde | Plantão Jurídico (86, últimas vagas) e CRAS (66) |
| Renda (vocabulário) | "vendo artesanato e quero ganhar mais dinheiro", noite | Oficina de Empreendedorismo (97). **A v1 não recomendava nada** |
| Turno sem opção (Regra 5) | "preciso de ajuda jurídica mas só posso à noite", noite | Plantão Jurídico, marcado "Outro turno", com aviso para confirmar o horário. **A v1 não recomendava nada** |
| Fora do catálogo | "quero aprender a tocar violão", manhã | Nenhuma recomendação. Encaminha ao acolhimento social, sem inventar serviço |

Prints: `docs/evidencias/01-recomendacoes.png`, `02` e `03` (agendamento), `04` (proteção contra entrada maliciosa) e `11-recomendacao-renda-v2.png`. Os JSON completos dos 5 cenários, com a saída da v1 para comparação, estão em `evidencias/exemplos-entrada-saida.json`.

## 4. Lógica e ganho: antes × depois

**Como medimos.** Montamos um gabarito: perfis escritos como cidadãos escrevem, cada um marcado com os serviços que um atendente social indicaria. Comparamos três situações:

- **Antes, sem IA:** mural de vagas. A pessoa escolhe a categoria e lê os 3 primeiros serviços na ordem em que foram publicados.
- **Agente v1:** o protótipo original.
- **Agente v2:** a versão atual, melhorada a partir do que o dashboard de Big Data revelou.

Para não "decorar a prova", separamos 38 perfis de **ajuste**, usados para criar o vocabulário da v2, e 16 perfis de **validação**, escritos depois e nunca usados para ajustar nada. A tabela abaixo é a da validação. Rode `npm run ia:avaliar` para reproduzir.

| Métrica (validação, 16 perfis) | Antes: mural sem IA | Agente v1 | **Agente v2** |
|---|---:|---:|---:|
| 1ª sugestão é adequada | 64,3% | 85,7% | **92,9%** |
| Sugestões que são adequadas (precisão) | 53,6% | 81,3% | **82,4%** |
| Tinha opção certa e ficou sem resposta | 0% | 14,3% | **0%** |
| Pedido fora do catálogo → encaminhou ao acolhimento | 0% | 100% | **100%** |
| Viu serviço esgotado (plantão jurídico lotado) | 37,5% | 0% | **0%** |
| Sugestões no turno pedido | 53,1% | **87,5%** | 82,4% |

**O que melhora para o cidadão:**
- **Sem IA → com IA:** a primeira sugestão passa de 64% para 93% de acerto. Ninguém mais perde tempo com vaga esgotada (antes, 1 em cada 3 pessoas via uma), e quem pede algo que não existe é encaminhado ao acolhimento em vez de receber uma lista irrelevante.
- **v1 → v2:** ninguém com opção certa fica sem resposta (antes, 14% ficavam no conjunto de validação e 31% no de ajuste).

**O custo honesto:** a fatia de sugestões no turno pedido cai um pouco (87,5% → 82,4%). Isso acontece porque a Regra 5 passou a oferecer opções em outro turno, com aviso, para quem antes não recebia nada. Também resta 1 erro na validação: "sem renda e com filhos pequenos" foi para o jurídico em vez do CRAS. É um próximo ajuste de vocabulário (renda/filhos → benefício social).

**Ciclo de melhoria contínua:**

1. O dashboard de Big Data mostrou que, em geração de renda, 65% das buscas ficavam sem recomendação mesmo com vagas sobrando.
2. O painel "O que decidir agora" sugeriu revisar o vocabulário do agente.
3. A v2 foi implementada.
4. A avaliação acima mede o ganho.
5. Os testes CT22 a CT25 impedem que a melhoria se perca.

O histórico de agosto a novembro no data lake foi gerado pela v1, como aconteceria na vida real antes da melhoria. A v1 continua disponível para comparação (`avaliar(..., { versao: 1 })`).
