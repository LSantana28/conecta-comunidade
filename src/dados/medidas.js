// FUNÇÕES ANALÍTICAS — equivalentes em JavaScript das funções DAX usadas no Power BI.
// São puras (sem I/O) e testadas em tests/dados.test.js.
// A tradução de cada medida para DAX está em docs/big-data/medidas-dax.md.

// DIVIDE(numerador, denominador, alternativo)
export function dividir(numerador, denominador, alternativo = null) {
  return denominador ? numerador / denominador : alternativo;
}

// COUNTROWS(FILTER(tabela, condição))
export function contarLinhas(linhas, condicao = () => true) {
  let n = 0;
  for (const l of linhas) if (condicao(l)) n++;
  return n;
}

// SUMX(tabela, expressão)
export function somarX(linhas, expressao) {
  let s = 0;
  for (const l of linhas) s += Number(expressao(l)) || 0;
  return s;
}

// AVERAGEX(tabela, expressão) — ignora vazios, como o DAX
export function mediaX(linhas, expressao) {
  let s = 0, n = 0;
  for (const l of linhas) {
    const v = expressao(l);
    if (v !== null && v !== undefined && Number.isFinite(Number(v))) { s += Number(v); n++; }
  }
  return dividir(s, n);
}

// DISTINCTCOUNT(coluna)
export function contarDistintos(linhas, campo) {
  return new Set(linhas.map(l => l[campo])).size;
}

// PERCENTILE.INC(coluna, k) — interpolação linear
export function percentil(valores, k) {
  const v = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const pos = (v.length - 1) * k;
  const base = Math.floor(pos);
  return v[base] + (v[Math.min(base + 1, v.length - 1)] - v[base]) * (pos - base);
}

// Variação % entre períodos: DIVIDE([Atual] - [Anterior], [Anterior])
export function variacao(atual, anterior) {
  if (atual === null || anterior === null || anterior === undefined) return null;
  return dividir(atual - anterior, Math.abs(anterior));
}

// DATEADD(Calendario[data], -N, DAY): período de mesmo tamanho imediatamente anterior
export function periodoAnterior(inicio, fim) {
  const dia = 86400000;
  const n = Math.round((Date.parse(fim) - Date.parse(inicio)) / dia) + 1;
  const iso = t => new Date(t).toISOString().slice(0, 10);
  return { inicio: iso(Date.parse(inicio) - n * dia), fim: iso(Date.parse(inicio) - dia), dias: n };
}

// AVERAGEX(DATESINPERIOD(Calendario[data], MAX(data), -janela, DAY), [Medida]) — média móvel
export function mediaMovel(serie, janela = 7) {
  return serie.map((_, i) => {
    if (i < janela - 1) return null;
    let s = 0;
    for (let j = i - janela + 1; j <= i; j++) s += serie[j];
    return s / janela;
  });
}

// RANKX(ALL(tabela), [Medida], , DESC, Dense)
export function rankear(itens, campo, desc = true) {
  const valores = [...new Set(itens.map(i => i[campo]).filter(v => v !== null))].sort((a, b) => desc ? b - a : a - b);
  return itens.map(i => ({ ...i, [`rank_${campo}`]: i[campo] === null ? null : valores.indexOf(i[campo]) + 1 }));
}

// DIVIDE([Medida], CALCULATE([Medida], ALL(dimensão))) — participação no total
export function participacao(parte, total) {
  return dividir(parte, total, 0);
}

// Soma acumulada (TOTALYTD / running total sobre o calendário)
export function acumulado(serie) {
  let s = 0;
  return serie.map(v => (s += v));
}

// Dias de sobreposição entre dois intervalos [a1,a2] e [b1,b2] (datas ISO inclusivas)
export function diasSobrepostos(a1, a2, b1, b2) {
  const ini = Math.max(Date.parse(a1), Date.parse(b1));
  const fim = Math.min(Date.parse(a2), Date.parse(b2));
  return fim < ini ? 0 : Math.round((fim - ini) / 86400000) + 1;
}
