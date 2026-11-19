# Roteiro do vídeo pitch (até 3 minutos)

As regras pedem para **mostrar o site funcionando**: nada de vídeo de slides. Grave a tela com o sistema rodando (`npm start` + `npm run iot`) e narre por cima. Para acompanhar os tempos e os critérios de nota (problema e cidadão: 1 pt; demonstração das áreas: 2 pts; impacto e diferencial: 1 pt; clareza e tempo: 1 pt), use a tabela abaixo.

**Antes de gravar:**
- reinicie o servidor, para as vagas voltarem ao saldo inicial;
- deixe o simulador IoT rodando;
- faça o login do gestor em outra aba;
- feche as abas e notificações que não fazem parte da demonstração.

| Tempo | Parte | Na tela | O que falar (sugestão) |
|---|---|---|---|
| 0:00–0:30 | **O problema** | Tela inicial | "A Maria está desempregada há 3 meses. Perto da casa dela tem curso gratuito de informática com vaga sobrando, mas ela não sabe disso. É o que acontece com muita gente: as vagas gratuitas existem, mas não chegam a quem precisa." Se tiver um dado real de fonte oficial (desemprego, vagas ociosas em cursos públicos), cite aqui. |
| 0:30–0:50 | **A solução** | Abas do sistema | "O Conecta Comunidade junta as vagas da comunidade num só lugar. Uma IA entende o que a pessoa precisa e indica o que ela consegue usar de verdade, no horário dela." |
| 0:50–1:20 | **IA em ação** | Recomendações → Cenário 1 → mostrar o "Como a IA calculou" → Agendar com CPF → protocolo | "A Maria escreve do jeito dela. A IA dá a nota para cada serviço e explica o cálculo. Ela agenda em um clique, e a vaga sai do saldo na hora. Se tentar reservar de novo, o sistema bloqueia: é uma vaga por pessoa." |
| 1:20–1:35 | **IA medida** | Cenário 3: Renda | "Medimos a IA com um gabarito: a primeira sugestão passou de 64% de acerto, sem IA, para 93%. E ninguém mais fica sem resposta." |
| 1:35–1:50 | **IoT** | Catálogo (barras de ocupação) → Dashboard (salas e alertas) | "Sensores na porta e de temperatura medem a ocupação real das salas, em tempo real. Se lotar ou passar de 30 °C, o gestor recebe um alerta." |
| 1:50–2:10 | **Big Data** | Análises → "O que decidir agora" → filtro Turno = Noite | "Tudo vai para um data lake. O dashboard mostra para o gestor onde abrir turmas: tem muita gente procurando capacitação à noite, e a SALA-A fica só 8% ocupada nesse horário." |
| 2:10–2:40 | **Impacto e diferenciais** | Aba Actions do GitHub (verde) e README | "Quem ganha é o cidadão, que encontra a oportunidade certa, e as instituições, que enchem as vagas. ODS 10 e 11. As 4 áreas estão integradas, a IA tem métricas e cada commit roda testes, pipeline de dados e build automaticamente." |
| 2:40–3:00 | **Fechamento** | Tela inicial | "Conecta Comunidade: tecnologia aproximando pessoas de oportunidades." |

**Depois de gravar:**
- suba no YouTube como **"Não listado"** (ou no Google Drive com "Qualquer pessoa com o link");
- **teste o link numa aba anônima**;
- cole o link no `ENTREGA.txt` e no topo do `README.md`.
