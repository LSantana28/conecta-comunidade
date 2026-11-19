# Fluxo funcional completo (do início ao fim)

Persona: **Maria Silva**, desempregada há 3 meses, quer cursos gratuitos para voltar ao mercado.

```mermaid
sequenceDiagram
  actor Maria as Cidadã (Maria)
  participant UI as Frontend (SPA)
  participant API as API Node.js
  participant IA as Agente IA
  participant IoT as Sensores da sala
  actor Gestor
  Maria->>UI: Preenche perfil (situação, interesse, turno, descrição)
  UI->>API: POST /api/recomendacoes
  API->>API: Valida entrada (whitelist, tamanho)
  API->>IA: avaliar(perfil, catálogo)
  IA-->>API: Top 3 + score + justificativa + próximo passo
  API-->>UI: Recomendações (nome mascarado no log)
  Maria->>UI: "Agendar vaga" + confirma nome e CPF
  UI->>API: POST /api/reservas
  API->>API: CPF válido? Já tem reserva ativa neste serviço? (CPF vira chave HMAC, não é guardado)
  API-->>UI: 201 · protocolo CC-XXXXXX · saldo −1 (Regra 4)
  Maria->>UI: Abre "Meus agendamentos"
  UI->>API: GET /api/reservas/CC-XXXXXX
  Maria->>IoT: Chega à sala no dia do curso
  IoT->>API: POST /api/iot/leituras (entrada) + X-Device-Key
  API-->>API: Ocupação da sala +1, alertas se lotação/temperatura
  Gestor->>UI: Login
  UI->>API: POST /api/auth/login → token
  UI->>API: GET /api/admin/dashboard (Bearer)
  API-->>UI: Utilização, demanda, ocupação e leituras em tempo real
```

## Passo a passo (para a demonstração)

1. `npm start` e, em outro terminal, `npm run iot` (ou `docker compose up --build`).
2. Abrir `http://localhost:3000` → tela **Recomendações IA** → **Cenário 1: Emprego**.
3. O agente mostra 3 serviços: Qualificação (97%), Informática (84%, "turma começando em breve") e Orientação (85%, "últimas vagas"), e sugere reservar primeiro a Orientação.
4. Clicar **Agendar vaga** → confirmar o nome e informar o CPF → aparece o protocolo. O saldo cai na hora; ao gerar de novo, o card mostra 1 vaga a menos. Tentar agendar de novo o mesmo serviço com o mesmo CPF é bloqueado (uma vaga por pessoa).
5. Tela **Meus agendamentos**: a reserva aparece como *confirmada*, com opção de cancelar (a vaga volta ao saldo).
6. Tela **Catálogo**: todas as vagas, filtros por categoria/turno e a barra **Ocupação agora** alimentada pelos sensores.
7. Tela **Dashboard (gestão)**: login `admin` / `conecta2026` (demo). KPIs, utilização por serviço (laranja = menos de 50%, precisa de divulgação), demanda por interesse, salas IoT com alertas e últimas leituras — atualiza a cada 3 s.

8. Aba **Análises (Big Data)**: indicadores do data lake com filtros de período, eixo, turno e sala, comparados ao período anterior, mais o painel **O que decidir agora**. Exemplos: ampliar o plantão jurídico, abrir capacitação noturna na SALA-A (ociosa à noite), climatizar a SALA-C.
9. Tudo o que foi feito nos passos 2 a 6 já foi gravado na camada bronze. Rode `npm run etl` e recarregue a tela de análises para ver os dados novos processados.

Screenshots de cada passo: `docs/evidencias/01` a `10`.
