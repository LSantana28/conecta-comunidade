import http from "node:http";
import { criarApp, carregarConfig } from "./app.js";

const PORT = Number(process.env.PORT) || 3000;
const config = carregarConfig();
const { handler } = criarApp(config);

const server = http.createServer(handler);
server.listen(PORT, () => {
  console.log(`Conecta Comunidade rodando em http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD_HASH) console.log("Aviso: usando credenciais de DEMONSTRAÇÃO (admin / conecta2026). Não use em produção.");
});

// Encerramento gracioso (Docker envia SIGTERM)
for (const sinal of ["SIGTERM", "SIGINT"]) {
  process.on(sinal, () => server.close(() => process.exit(0)));
}
