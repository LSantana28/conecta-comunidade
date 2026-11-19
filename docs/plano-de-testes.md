# Plano de testes — Conecta Comunidade

**Ferramenta:** `node:test` (nativo do Node.js, sem dependências) · **Execução:** `npm test`
**Automação:** roda a cada push/PR no GitHub Actions (Node 20 e 22) e dentro do `docker build`.
**Evidências:** [`evidencias/execucao-testes.txt`](evidencias/execucao-testes.txt), [`evidencias/relatorio-testes-junit.xml`](evidencias/relatorio-testes-junit.xml), [`evidencias/smoke-test.txt`](evidencias/smoke-test.txt) e screenshots `01` a `08`.

**Resultado da última execução:** 27 testes · 27 aprovados · 0 falhas.

| ID | Tipo | Cenário | Passos / entrada | Resultado esperado | Status |
|----|------|---------|------------------|--------------------|--------|
| CT01 | Unitário (IA) | Cenário 1 — busca de emprego | Perfil "Procurando emprego", capacitação, qualquer turno | Recomenda SRV-02, SRV-01, SRV-03 em ordem decrescente, todos com score ≥ 60; próximo passo prioriza o serviço com 5 vagas | ✅ |
| CT01b | Unitário (IA) | Cenário 2 — apoio social/jurídico | Perfil social/jurídico, turno tarde | Plantão jurídico (SRV-06) em 1º; só serviços sociais/jurídicos | ✅ |
| CT02 | Unitário (IA) | Regra 1 — sem vagas | SRV-02 com `vagas = 0` | SRV-02 não aparece nas recomendações | ✅ |
| CT03 | Unitário (IA) | Regra 2 — pesos 70/20/10 | Mesmo serviço, turno compatível × incompatível | Diferença de exatamente 20 pontos; soma das partes = score | ✅ |
| CT04 | Unitário (IA) | Regra 3 — selos | SRV-03 (5 vagas) e SRV-01 (40% ocupação, início em 5 dias) | "Últimas vagas" e reforço de +5 no ranking | ✅ |
| CT05 | Unitário (IA) | Perfil sem aderência | Descrição "gosto de música" | Lista vazia e encaminhamento ao acolhimento social | ✅ |
| CT05b | Unitário (IA) | Normalização de texto | Mesma descrição em maiúsculas e sem acentos | Mesmos scores | ✅ |
| CT06 | Integração (API) | **Fluxo completo** | Recomendar → reservar → consultar → cancelar | 201 com protocolo `CC-XXXXXX`; saldo −1 (Regra 4); cancelamento devolve a vaga; 2º cancelamento = 409 | ✅ |
| CT07 | Integração (API) | Serviço esgotado | 5 reservas no SRV-06 (4 vagas) | 5ª reserva = 409; serviço sai das recomendações | ✅ |
| CT08 | Unitário (segurança) | Validação de entrada | Nome `<script>…`, turno inválido, texto > 500, id com SQL | Todos rejeitados; campos extras descartados | ✅ |
| CT08b | Unitário (segurança/LGPD) | Escape de HTML e minimização | Payload `<img onerror>`; nome completo | HTML escapado; só primeiro nome armazenado; nome mascarado | ✅ |
| CT08c | Integração (segurança) | Erros de entrada na API | Campos inválidos, JSON malformado, corpo de 20 KB | 400 com lista de campos; 400; 413 | ✅ |
| CT09 | Integração (segurança) | Autenticação do dashboard | Sem token, token falso, senha errada, senha certa | 401, 401, 401, 200; nomes mascarados para o gestor | ✅ |
| CT10 | Unitário (segurança) | Senha e token | Hash scrypt; token adulterado, com outro segredo ou expirado | Senha nunca em texto puro; tokens inválidos rejeitados | ✅ |
| CT11 | Integração (IoT) | Leituras dos sensores | Leitura sem chave; 10 entradas na SALA-C; 11ª entrada; 31,5 °C; saídas | 401; ocupação 10 = "Lotação máxima"; 11 = "Lotação excedida"; alerta de temperatura; ocupação refletida no catálogo | ✅ |
| CT12 | Unitário (IoT) | Simulador | 2.000 leituras geradas | Todas válidas; ocupação sempre entre 0 e a capacidade; 2 tipos de sensor | ✅ |
| CT12b | Unitário (IoT) | Validador de leituras | Sala, sensor e temperatura inválidos | Rejeitados; comparação da chave em tempo constante | ✅ |
| CT13 | Unitário (segurança) | Rate limiter | 4 chamadas com limite 3 | 4ª bloqueada; libera na janela seguinte | ✅ |
| CT13b | Integração (segurança) | Força bruta no login | 11 tentativas em 1 minuto | 11ª = 429 | ✅ |
| CT14 | Integração (segurança) | Cabeçalhos e path traversal | `GET /` e `GET /%2e%2e/package.json` | CSP, nosniff, X-Frame-Options presentes; arquivo fora de `public/` não é servido | ✅ |
| CT16 | Unitário (Big Data) | Funções analíticas | DIVIDE por zero, PERCENTILE 0,9, média móvel, variação sem base, DATEADD, RANKX denso, AVERAGEX com vazios | Valores exatos esperados | ✅ |
| CT17 | Unitário (Big Data/LGPD) | Ingestão na camada bronze | Evento de busca com o nome "Maria Silva" | Gravado em `bronze/busca/dt=…`, fuso −03:00, sem o nome; pseudônimo estável e dependente do segredo | ✅ |
| CT18 | Integração (ETL) | Qualidade bronze → prata | 12 linhas: 1 duplicada, 1 data legada, 999 °C, sala inexistente, JSON cortado | 1 duplicado removido, 1 data normalizada, 3 na quarentena com motivo | ✅ |
| CT19 | Integração (ETL) | Modelagem da camada ouro | Busca → reserva 20 min depois → presença; passagens de sensor | Status "compareceu", atribuída à recomendação, turma correta; ocupação média 1,5 ponderada no tempo; CSV gerado | ✅ |
| CT20 | Integração (Big Data) | Indicadores e filtros | Consulta padrão, turno noite e turno inválido | 6 KPIs com período anterior; filtro restringe serviços; 400 para filtro inválido; insights com decisão | ✅ |
| CT21 | Integração (API) | API de análises + ingestão real | Sem token; com token e filtros; reserva feita pela API | 401; 200 com 18 dias de série; reserva gravada no bronze sem o nome | ✅ |
| CT15 | Integração (DevOps) | Monitoramento | `GET /health` e `GET /metrics` | `status: ok`; métricas Prometheus de reservas, vagas e ocupação | ✅ |

## Testes manuais / E2E (navegador)

Roteiro automatizado em `scripts/capturar-telas.py` (Playwright), percorrendo as 6 telas. Resultado: **nenhum erro no console** e CSP ativa.

| ID | Tela | Ação | Esperado | Evidência |
|----|------|------|----------|-----------|
| E2E-01 | Recomendações | Clicar "Cenário 1: Emprego" | 3 cards com score e selo | `01-recomendacoes.png` |
| E2E-02 | Recomendações | "Agendar vaga" → confirmar nome | Diálogo e protocolo exibido | `02`, `03` |
| E2E-03 | Recomendações | Nome `<script>alert(1)</script>` | Mensagem de erro, nada executado | `04-validacao-entrada.png` |
| E2E-04 | Meus agendamentos | Abrir tela | Reserva confirmada com protocolo | `05-agendamentos.png` |
| E2E-05 | Catálogo | Abrir tela com simulador ligado | Ocupação das salas atualizando | `06-catalogo.png` |
| E2E-06 | Login | Senha errada | "Usuário ou senha incorretos." | `07-login-negado.png` |
| E2E-07 | Dashboard | Login correto | KPIs, utilização, demanda e leituras IoT | `08-dashboard.png` |
| E2E-08 | Análises (Big Data) | Abrir a tela | Recomendações, 6 KPIs com variação, 4 gráficos | `09-analises-big-data.png` |
| E2E-09 | Análises (Big Data) | Filtrar 90 dias + turno noite | Indicadores e gráficos recalculados, resumo do filtro | `10-analises-filtro-noite.png` |

## Smoke test pós-deploy

`node scripts/smoke.js` — roda no pipeline contra o container já de pé. Resultado em `evidencias/smoke-test.txt`: 7/7 checagens aprovadas.

## Pipeline de dados

O job **Pipeline de dados** do CI roda `npm run dados` e falha se menos de 95% dos registros do bronze forem aproveitados. Saída de referência em `big-data/evidencias/02-execucao-etl.txt`: 98,74%.
