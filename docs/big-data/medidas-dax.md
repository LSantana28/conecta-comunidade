# Funções analíticas — JavaScript ⇄ DAX

Os indicadores do dashboard são calculados por `src/dados/medidas.js` e `src/dados/analises.js`. Cada função reproduz uma função DAX, então o mesmo painel pode ser montado no **Power BI** importando os CSV de `datalake/ouro/`.

**Relacionamentos no Power BI:**
- `dim_servico[servico_id]` → `fato_reserva`, `fato_recomendacao` e `dim_turma`;
- `dim_turma[turma_id]` → `fato_reserva`;
- `dim_sala[sala]` → `fato_ocupacao_hora`;
- `dim_data[data]` → `fato_busca`, `fato_reserva` e `fato_ocupacao_hora`. Marque `dim_data` como **tabela de datas**.

## Funções base

| Função JS (`medidas.js`) | DAX equivalente | Uso no painel |
|---|---|---|
| `dividir(n, d, alt)` | `DIVIDE(n, d, alt)` | todas as taxas (evita divisão por zero) |
| `contarLinhas(t, cond)` | `COUNTROWS(FILTER(t, cond))` | buscas, reservas, faltas |
| `somarX(t, expr)` | `SUMX(t, expr)` | vagas ofertadas, horas lotadas |
| `mediaX(t, expr)` | `AVERAGEX(t, expr)` | ocupação média (ignora vazios) |
| `contarDistintos(t, col)` | `DISTINCTCOUNT(col)` | pessoas únicas (`perfil_hash`) |
| `percentil(v, 0.9)` | `PERCENTILE.INC(col, 0.9)` | P90 da ocupação |
| `periodoAnterior(ini, fim)` | `DATEADD(dim_data[data], -N, DAY)` | comparação com o período anterior |
| `variacao(atual, anterior)` | `DIVIDE([Atual] - [Anterior], [Anterior])` | setas ▲▼ dos indicadores |
| `mediaMovel(serie, 7)` | `AVERAGEX(DATESINPERIOD(dim_data[data], MAX(dim_data[data]), -7, DAY), [Medida])` | linhas tracejadas do gráfico diário |
| `rankear(itens, campo)` | `RANKX(ALL(dim_servico), [Medida], , DESC, Dense)` | ranking de utilização |
| `participacao(parte, total)` | `DIVIDE([Medida], CALCULATE([Medida], ALL(dim)))` | participação no total |
| `acumulado(serie)` | `CALCULATE([Medida], FILTER(ALL(dim_data), dim_data[data] <= MAX(dim_data[data])))` | total acumulado |

## Medidas do dashboard

```dax
-- ========== Volume ==========
Buscas = COUNTROWS ( fato_busca )

Buscas com Resultado =
    CALCULATE ( [Buscas], fato_busca[sem_resultado] = 0 )

Reservas Válidas =
    CALCULATE ( COUNTROWS ( fato_reserva ), fato_reserva[valida] = 1 )

Pessoas Atendidas = DISTINCTCOUNT ( fato_reserva[perfil_hash] )

-- ========== 1. Utilização das vagas ==========
-- Reservas válidas das turmas abertas no período ÷ vagas dessas turmas
Vagas Ofertadas =
    SUMX (
        FILTER (
            dim_turma,
            dim_turma[inicio_inscricoes] <= MAX ( dim_data[data] )
                && dim_turma[fim_inscricoes] >= MIN ( dim_data[data] )
        ),
        dim_turma[vagas]
    )

Reservas das Turmas do Período =
    VAR TurmasAbertas =
        FILTER (
            dim_turma,
            dim_turma[inicio_inscricoes] <= MAX ( dim_data[data] )
                && dim_turma[fim_inscricoes] >= MIN ( dim_data[data] )
        )
    RETURN
        CALCULATE (
            COUNTROWS ( fato_reserva ),
            fato_reserva[valida] = 1,
            TREATAS ( SELECTCOLUMNS ( TurmasAbertas, "t", dim_turma[turma_id] ), fato_reserva[turma_id] ),
            REMOVEFILTERS ( dim_data ),
            fato_reserva[data] <= MAX ( dim_data[data] )
        )

Taxa de Utilização = DIVIDE ( [Reservas das Turmas do Período], [Vagas Ofertadas] )

-- ========== 2. Conversão da recomendação ==========
Reservas via Recomendação =
    CALCULATE (
        COUNTROWS ( fato_reserva ),
        fato_reserva[via_recomendacao] = 1,
        fato_reserva[resultado] = "confirmada"
    )

Taxa de Conversão = DIVIDE ( [Reservas via Recomendação], [Buscas com Resultado] )

-- ========== 3. Pessoas sem atendimento ==========
Recusadas sem Vaga =
    CALCULATE ( COUNTROWS ( fato_reserva ), fato_reserva[status_final] = "recusada_sem_vaga" )

Demanda Reprimida =
    CALCULATE ( [Buscas], fato_busca[sem_resultado] = 1 ) + [Recusadas sem Vaga]

-- ========== 4. Comparecimento ==========
Compareceram = CALCULATE ( COUNTROWS ( fato_reserva ), fato_reserva[status_final] = "compareceu" )
Faltaram     = CALCULATE ( COUNTROWS ( fato_reserva ), fato_reserva[status_final] = "faltou" )
Taxa de Comparecimento = DIVIDE ( [Compareceram], [Compareceram] + [Faltaram] )

-- ========== 5. Aderência ao turno ==========
Aderência ao Turno =
    DIVIDE ( CALCULATE ( [Buscas], fato_busca[turno_atendido] = 1 ), [Buscas] )

-- ========== 6. Ocupação física (IoT) ==========
Ocupação Média =
    AVERAGEX ( FILTER ( fato_ocupacao_hora, fato_ocupacao_hora[leituras] > 0 ), fato_ocupacao_hora[taxa_ocupacao] )

Ocupação P90 =
    PERCENTILEX.INC ( FILTER ( fato_ocupacao_hora, fato_ocupacao_hora[leituras] > 0 ), fato_ocupacao_hora[taxa_ocupacao], 0.9 )

Horas Lotadas = DIVIDE ( SUM ( fato_ocupacao_hora[minutos_lotada] ), 60 )

Horas acima de 30°C =
    CALCULATE ( COUNTROWS ( fato_ocupacao_hora ), fato_ocupacao_hora[temperatura_max] > 30 )

-- ========== Inteligência de tempo ==========
-- Período anterior de mesmo tamanho (ex.: 30 dias antes dos 30 dias filtrados)
Dias no Período = COUNTROWS ( dim_data )

Taxa de Utilização (Anterior) =
    CALCULATE ( [Taxa de Utilização], DATEADD ( dim_data[data], - [Dias no Período], DAY ) )

Variação Utilização % =
    DIVIDE ( [Taxa de Utilização] - [Taxa de Utilização (Anterior)], [Taxa de Utilização (Anterior)] )

Reservas MM7 =
    AVERAGEX (
        DATESINPERIOD ( dim_data[data], MAX ( dim_data[data] ), -7, DAY ),
        CALCULATE ( COUNTROWS ( fato_reserva ), fato_reserva[resultado] = "confirmada" )
    )

-- ========== Ranking e participação ==========
Ranking Utilização =
    RANKX ( ALL ( dim_servico ), [Taxa de Utilização], , DESC, DENSE )

% das Recomendações =
    DIVIDE ( COUNTROWS ( fato_recomendacao ), CALCULATE ( COUNTROWS ( fato_recomendacao ), ALL ( dim_servico ) ) )
```

## Variáveis calculadas no ETL (colunas derivadas)

| Coluna | Regra | Onde |
|---|---|---|
| `fato_reserva[status_final]` | sem vaga → `recusada_sem_vaga`; com cancelamento → `cancelada`; com presença → `compareceu`; sem presença após 10 dias → `faltou`; senão → `aguardando` | `etl.js` |
| `fato_reserva[via_recomendacao]` | existe busca do mesmo `perfil_hash`, até 24 h antes, que recomendou o mesmo serviço | `etl.js` |
| `fato_busca[turno_atendido]` | turno pedido = "qualquer" ou alguma recomendação é do turno pedido | `etl.js` |
| `fato_ocupacao_hora[ocupacao_media]` | ∫ ocupação(t) dt ÷ 3600 s, com a ocupação reconstruída somando entradas e subtraindo saídas | `etl.js` |
| `dim_turma[turma_id]` | `servico_id` + ciclo de 30 dias a partir de 21/08/2026 | `etl.js` / `esquema.js` |
