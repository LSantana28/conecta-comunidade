// Gateway Serial -> HTTP para o Arduino real.
// Lê linhas JSON da entrada padrão e encaminha para a API.
// Uso (Linux/macOS):  cat /dev/ttyACM0 | node src/iot/gateway-serial.js
// No TinkerCad: copie a saída do Monitor Serial para um arquivo e rode  node src/iot/gateway-serial.js < leituras.txt
import readline from "node:readline";
import { enviar } from "./simulador.js";

const apiUrl = process.env.API_URL || "http://localhost:3000";
const chave = process.env.IOT_DEVICE_KEY || "dev-iot-key";

const rl = readline.createInterface({ input: process.stdin });
for await (const linha of rl) {
  const texto = linha.trim();
  if (!texto.startsWith("{")) continue;
  try {
    const { status } = await enviar(JSON.parse(texto), { apiUrl, chave });
    console.log(`${texto} -> HTTP ${status}`);
  } catch (e) {
    console.log(`Linha ignorada (${e.message}): ${texto}`);
  }
}
