// Smoke test pós-deploy: verifica se a aplicação no ar responde o essencial.
// Uso: BASE_URL=http://localhost:3000 node scripts/smoke.js
const base = process.env.BASE_URL || "http://localhost:3000";

const checagens = [
  ["GET /health", () => fetch(`${base}/health`).then(async r => r.ok && (await r.json()).status === "ok")],
  ["GET / (frontend)", () => fetch(`${base}/`).then(async r => r.ok && (await r.text()).includes("Conecta Comunidade"))],
  ["GET /api/servicos", () => fetch(`${base}/api/servicos`).then(async r => r.ok && (await r.json()).servicos.length > 0)],
  ["POST /api/recomendacoes", () => fetch(`${base}/api/recomendacoes`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cidadao: "Teste Smoke", situacao_atual: "Procurando emprego", interesse_principal: "Capacitação profissional", turno_disponivel: "qualquer", descricao_livre: "curso de informatica" })
  }).then(async r => r.ok && (await r.json()).saida.recomendacoes.length > 0)],
  ["GET /api/admin/dashboard sem token = 401", () => fetch(`${base}/api/admin/dashboard`).then(r => r.status === 401)],
  ["GET /metrics", () => fetch(`${base}/metrics`).then(async r => r.ok && (await r.text()).includes("conecta_requisicoes_total"))]
];

let falhas = 0;
for (const [nome, fn] of checagens) {
  let ok = false;
  try { ok = await fn(); } catch { ok = false; }
  console.log(`${ok ? "OK  " : "FALHOU"}  ${nome}`);
  if (!ok) falhas++;
}
console.log(falhas ? `\n${falhas} checagem(ns) falharam.` : "\nSmoke test aprovado.");
process.exit(falhas ? 1 : 0);
