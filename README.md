# Conecta Comunidade · CitizenTech

> Tecnologia aproximando pessoas de oportunidades — ODS 10 (Redução das desigualdades) e ODS 11 (Cidades e comunidades sustentáveis).

Plataforma que conecta cidadãos a vagas em **cursos gratuitos, capacitações, atendimentos sociais e serviços comunitários**. Um agente de IA recomenda as vagas mais compatíveis com o perfil da pessoa e sensores IoT medem a ocupação das salas. Todo evento alimenta um **data lake** (bronze → prata → ouro), e um dashboard analítico transforma esses dados em decisões: onde abrir turmas, o que divulgar e qual sala climatizar.

![Arquitetura](docs/arquitetura.png)

## Como rodar

Requisito: **Node.js 20+** (não há dependências para instalar).

```bash
npm start          # http://localhost:3000
npm run iot        # em outro terminal: simulador dos sensores IoT
npm run dados      # (re)gera o histórico de 90 dias e roda o ETL do data lake
npm test           # 27 testes automatizados
npm run smoke      # smoke test contra a aplicação no ar
```

Com Docker:

```bash
cp .env.example .env
node scripts/gerar-hash.js "sua-senha-forte"   # cole em ADMIN_PASSWORD_HASH
# preencha TOKEN_SECRET, IOT_DEVICE_KEY e PSEUDONIMO_SECRET
docker compose up --build                      # app + simulador IoT
docker compose run --rm etl                    # reprocessa o data lake no container
```

Login do dashboard em modo de desenvolvimento: `admin` / `conecta2026`.

## Mapa de entregas da Global Solution

### Área 2 — Big Data e visualização

Documentação completa em [`docs/big-data/`](docs/big-data/README.md).

| Item | Entrega | Onde |
|------|---------|------|
| **Estrutura dos dados** | Data lake em 3 camadas (bronze particionado por tipo/data, prata limpa, ouro em **modelo estrela** com 4 dimensões e 4 fatos) + quarentena, catálogo e dicionário de dados | `datalake/`, `docs/big-data/README.md` §1–2 |
| **Ingestão e processamento** | Eventos reais do app e dos sensores → bronze (com pseudonimização LGPD); gerador de 90 dias de histórico com dados sujos; ETL que valida, deduplica, normaliza, reconstrói a ocupação e modela o ouro (43.635 → 43.086 registros, 98,7%) | `src/dados/ingestao.js`, `etl.js`, `docs/big-data/pipeline.png`, `docs/big-data/evidencias/` |
| **Dashboard** | Tela **Análises (Big Data)**: 6 indicadores com variação vs período anterior, 5 filtros (período, datas, eixo, turno, sala), 4 gráficos e o painel "O que decidir agora" | `public/js/telas/analises.js`, prints `09` e `10` |
| **Funções analíticas** | Medidas equivalentes a DIVIDE, PERCENTILE.INC, DATEADD, média móvel (DATESINPERIOD), RANKX e ALL, com o código DAX pronto para Power BI | `src/dados/medidas.js`, `docs/big-data/medidas-dax.md` |

### Área 3 — MVP, IoT e experiência digital

| Item | Entrega | Onde |
|------|---------|------|
| **Protótipo** (4+ telas) | 6 telas web funcionais: Recomendações IA, Catálogo de vagas, Meus agendamentos, Login do gestor, Dashboard operacional e Análises (Big Data) | `public/`, screenshots em `docs/evidencias/01`–`08` |
| **IoT** (2+ sensores) | Nó de sala com **HC-SR04** (fluxo de pessoas na porta) e **TMP36** (temperatura), LEDs e buzzer de alerta. Sketch para TinkerCad + simulador mock com o mesmo formato JSON + gateway serial→HTTP | `iot/arduino/no_sala.ino`, `src/iot/simulador.js`, `src/iot/gateway-serial.js` |
| **Fluxo funcional** | Perfil → recomendação → agendamento → protocolo → check-in pelo sensor → dashboard do gestor | `docs/fluxo-funcional.md` |
| **Arquitetura** | Diagrama geral com as 5 áreas e suas conexões | `docs/arquitetura.svg` / `.png` |

### Área 4 — DevOps, segurança e qualidade

| Item | Entrega | Onde |
|------|---------|------|
| **Organização** | Módulos separados (núcleo IA, servidor, IoT, frontend, testes, docs) e histórico Git com commits por etapa | estrutura abaixo, `git log` |
| **DevOps** | Dockerfile multi-stage (testa no build, roda sem root, HEALTHCHECK), docker compose (app + IoT + ETL, volume do data lake), pipeline **GitHub Actions** (testes Node 20/22 → pipeline de dados com checagem de qualidade → build → container healthy → smoke test → publica no GHCR), Jenkinsfile alternativo, monitoramento `/health` e `/metrics` (Prometheus) e logs JSON | `Dockerfile`, `docker-compose.yml`, `.github/workflows/ci.yml`, `Jenkinsfile` |
| **Segurança** | 10 práticas: pseudonimização LGPD no data lake, validação de entrada, anti-XSS + CSP, senha scrypt + token HMAC, chave de dispositivo IoT, rate limit, cabeçalhos, LGPD (minimização e máscara), segredos obrigatórios em produção, container sem root | `docs/seguranca.md` |
| **Testes** | Plano com 27 casos automatizados + 9 E2E, todos aprovados, com evidências | `docs/plano-de-testes.md`, `docs/evidencias/` |

## Estrutura

```
conecta-comunidade/
├── src/
│   ├── core/            # Agente IA (regras puras, sem I/O) + catálogo
│   ├── server/          # API REST, segurança, store em memória
│   ├── dados/           # Data lake: ingestão, gerador, ETL, medidas e análises
│   └── iot/             # Simulador de sensores e gateway serial
├── datalake/ouro/       # Camada ouro versionada (bronze/prata: npm run dados)
├── public/              # Frontend SPA (HTML, CSS, JS em módulos)
│   └── js/telas/        # Uma tela por arquivo
├── iot/arduino/         # Sketch do nó de sala (TinkerCad)
├── tests/               # Testes unitários e de integração (node:test)
├── scripts/             # smoke test, gerar hash, captura de telas
├── docs/                # Arquitetura, fluxo, testes, segurança, evidências
├── .github/workflows/   # CI/CD
├── Dockerfile · docker-compose.yml · Jenkinsfile
```

## API

| Método | Rota | Acesso | Descrição |
|--------|------|--------|-----------|
| GET | `/api/servicos` | público | Catálogo com saldo de vagas e ocupação da sala |
| POST | `/api/recomendacoes` | público | Executa o agente IA para um perfil |
| POST | `/api/reservas` | público | Reserva uma vaga (baixa imediata no saldo) |
| GET | `/api/reservas/:protocolo` | público | Consulta uma reserva |
| POST | `/api/reservas/:protocolo/cancelar` | público | Cancela e devolve a vaga |
| POST | `/api/auth/login` | público | Login do gestor → token |
| GET | `/api/admin/dashboard` | gestor | Indicadores de demanda, vagas e ocupação |
| GET | `/api/admin/reservas` | gestor | Reservas (nomes mascarados) |
| GET | `/api/admin/analises` | gestor | Indicadores de Big Data (`?inicio&fim&eixo&turno&sala`) |
| POST | `/api/iot/leituras` | dispositivo | Leitura de sensor (`X-Device-Key`) |
| GET | `/api/iot/salas` | público | Ocupação atual das salas |
| GET | `/health`, `/metrics` | público | Monitoramento |

## IoT no TinkerCad

1. Crie um circuito com Arduino Uno, HC-SR04, TMP36, um botão, 2 LEDs (verde/vermelho) e um buzzer conforme o cabeçalho de `iot/arduino/no_sala.ino`.
2. Cole o código e inicie a simulação; mova o "objeto" do sensor ultrassônico para menos de 60 cm para simular uma passagem (segure o botão para "saída").
3. O Monitor Serial mostra linhas JSON. Salve-as em `leituras.txt` e envie para a API com `node src/iot/gateway-serial.js < leituras.txt`.

## Evolução prevista

Banco de dados (PostgreSQL) no lugar do store em memória, data lake em armazenamento de objetos (S3/Azure Blob) com Parquet, cadastro das instituições e notificações por WhatsApp/SMS.
