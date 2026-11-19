// Simulador de dispositivos IoT (mock) — um "nó" por sala com 2 sensores:
//  1. Sensor ultrassônico HC-SR04 na porta: detecta passagens e envia evento "entrada"/"saida"
//  2. Sensor de temperatura TMP36: envia a temperatura ambiente da sala
// O formato do JSON é o MESMO que o sketch Arduino (iot/arduino/no_sala.ino) imprime na serial,
// então trocar o mock pelo hardware real (via gateway serial->HTTP) não muda a API.
import { pathToFileURL } from "node:url";

export const SALAS = [
  { sala: "SALA-A", capacidade: 30 },
  { sala: "SALA-B", capacidade: 25 },
  { sala: "SALA-C", capacidade: 10 }
];

export function estadoInicial() {
  return Object.fromEntries(SALAS.map(s => [s.sala, { ...s, ocupacao: 0, temperatura: 24 + Math.random() * 2 }]));
}

// Gera a próxima leitura (função pura, com rand injetável para testes)
export function proximaLeitura(estado, rand = Math.random) {
  const salas = Object.values(estado);
  const s = salas[Math.floor(rand() * salas.length)];

  if (rand() < 0.75) {
    // Sensor de fluxo: chance de entrada diminui conforme a sala enche
    const lotacao = s.ocupacao / s.capacidade;
    const probEntrada = s.ocupacao === 0 ? 1 : Math.max(0.15, 0.8 - lotacao * 0.6);
    const evento = rand() < probEntrada ? "entrada" : "saida";
    s.ocupacao = Math.max(0, s.ocupacao + (evento === "entrada" ? 1 : -1));
    return { sala: s.sala, sensor: "fluxo", evento };
  }
  // Sensor de temperatura: tende a 23 °C + 0,25 °C por pessoa, com ruído
  const alvo = 23 + s.ocupacao * 0.25;
  s.temperatura += (alvo - s.temperatura) * 0.3 + (rand() - 0.5) * 0.4;
  return { sala: s.sala, sensor: "temperatura", valor: Math.round(s.temperatura * 10) / 10 };
}

export async function enviar(leitura, { apiUrl, chave }) {
  const resp = await fetch(`${apiUrl}/api/iot/leituras`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Device-Key": chave },
    body: JSON.stringify(leitura)
  });
  return { status: resp.status, corpo: await resp.json().catch(() => ({})) };
}

async function main() {
  const apiUrl = process.env.API_URL || "http://localhost:3000";
  const chave = process.env.IOT_DEVICE_KEY || "dev-iot-key";
  const intervalo = Number(process.env.INTERVALO_MS) || 1500;
  const ciclos = Number(process.env.CICLOS) || Infinity;
  const estado = estadoInicial();
  console.log(`Simulador IoT -> ${apiUrl} (a cada ${intervalo} ms)`);

  for (let i = 0; i < ciclos; i++) {
    const leitura = proximaLeitura(estado);
    try {
      const { status, corpo } = await enviar(leitura, { apiUrl, chave });
      const extra = corpo.sala ? ` | ocupação ${corpo.sala.ocupacao}/${corpo.sala.capacidade}${corpo.sala.alertas.length ? " | ALERTA: " + corpo.sala.alertas.join(", ") : ""}` : "";
      console.log(`[${new Date().toLocaleTimeString("pt-BR")}] ${JSON.stringify(leitura)} -> HTTP ${status}${extra}`);
    } catch (e) {
      console.log(`Falha ao enviar (${e.message}). Tentando de novo no próximo ciclo...`);
    }
    await new Promise(r => setTimeout(r, intervalo));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
