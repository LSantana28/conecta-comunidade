// Apoio aos testes: gera CPFs VÁLIDOS fictícios (dígitos verificadores corretos) a partir de um número
export function gerarCpf(n) {
  const base = String(100000000 + n * 7919).slice(0, 9).split("").map(Number);
  const dv = digs => { const s = digs.reduce((a, d, i) => a + d * (digs.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  const d1 = dv(base), d2 = dv([...base, d1]);
  return [...base, d1, d2].join("");
}
