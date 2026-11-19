# Avaliação do agente IA — antes × depois

Gerado por `npm run ia:avaliar` em 19/11/2026, 19:35:52.

- **Antes (sem IA):** mural de vagas. A pessoa escolhe a categoria e lê os 3 primeiros serviços na ordem de publicação (inclusive esgotados).
- **Agente v1:** regras 1 a 4 (protótipo original).
- **Agente v2 (atual):** v1 + vocabulário ampliado + Regra 5 (outro turno) + Regra 6 (corte relativo).

Gabarito: para cada perfil, os serviços que um atendente social indicaria (regra de rotulagem em `src/core/avaliacao.js`).

## Conjunto de validação (16 perfis, **não usados** para ajustar a v2)

Este é o número honesto, que mostra o ganho em pedidos que a IA nunca viu.

| Métrica | Antes: mural de vagas sem IA | Agente IA v1 | Agente IA v2 (atual) |
|---|---:|---:|---:|
| 1ª sugestão é adequada | 64,3% | 85,7% | **92,9%** |
| Alguma das sugestões é adequada | **100,0%** | 85,7% | 92,9% |
| Sugestões que são adequadas (precisão) | 53,6% | 81,3% | **82,4%** |
| Tinha opção certa e ficou sem resposta | **0,0%** | 14,3% | **0,0%** |
| Pedido fora do catálogo → encaminhou ao acolhimento | 0,0% | **100,0%** | **100,0%** |
| Sugestões no turno pedido | 53,1% | **87,5%** | 82,4% |
| Viu serviço esgotado (plantão jurídico lotado) | 37,5% | **0,0%** | **0,0%** |

## Conjunto de ajuste (38 perfis, usados para criar o vocabulário da v2)

Aqui a v2 é favorecida por construção (o vocabulário foi escrito olhando esses erros). Serve para mostrar o que foi corrigido.

| Métrica | Antes: mural de vagas sem IA | Agente IA v1 | Agente IA v2 (atual) |
|---|---:|---:|---:|
| 1ª sugestão é adequada | 63,9% | 66,7% | **100,0%** |
| Alguma das sugestões é adequada | **100,0%** | 66,7% | **100,0%** |
| Sugestões que são adequadas (precisão) | 57,3% | 80,6% | **91,1%** |
| Tinha opção certa e ficou sem resposta | **0,0%** | 30,6% | **0,0%** |
| Pedido fora do catálogo → encaminhou ao acolhimento | 0,0% | **100,0%** | **100,0%** |
| Sugestões no turno pedido | 51,9% | 75,0% | **80,0%** |
| Viu serviço esgotado (plantão jurídico lotado) | 34,2% | **0,0%** | **0,0%** |

## Erros restantes da v2 (validação)

- V11: sugeriu SRV-06; o esperado era SRV-05
