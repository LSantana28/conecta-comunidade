// INGESTÃO — porta de entrada do data lake.
// Cada evento da aplicação (busca, reserva, cancelamento, leitura de sensor) é gravado
// sem transformação na camada BRONZE, em JSON Lines, particionado por tipo e data:
//
//   datalake/bronze/<tipo>/dt=AAAA-MM-DD/eventos.jsonl
//
// LGPD: nenhum dado pessoal chega ao lake. O nome do cidadão vira um pseudônimo
// (HMAC-SHA256 truncado) antes da gravação; a descrição livre não é gravada.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { partesLocais } from "./esquema.js";

export function pseudonimizar(nome, segredo) {
  const normal = String(nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  return crypto.createHmac("sha256", segredo).update(normal).digest("hex").slice(0, 16);
}

export function caminhoBronze(raiz, tipo, quando) {
  return path.join(raiz, "bronze", tipo, `dt=${partesLocais(quando).data}`, "eventos.jsonl");
}

// Fuso fixo -03:00 no registro bruto (como os dispositivos e o app enviam)
export function isoLocal(quando) {
  const local = new Date(quando.getTime() - 3 * 3600 * 1000);
  return local.toISOString().replace(/\.\d{3}Z$/, "-03:00");
}

export function criarIngestor({ dir, segredo, origem = "app" } = {}) {
  if (!dir) return { ativo: false, registrar() {}, pseudonimo: () => null, async esvaziar() {} };

  // Fila serializada: gravações em ordem, sem bloquear a resposta HTTP
  let fila = Promise.resolve();
  let falhas = 0;

  function registrar(tipo, dados, quando = new Date()) {
    const evento = {
      evento_id: crypto.randomUUID(),
      tipo,
      origem,
      ocorrido_em: isoLocal(quando),
      ingerido_em: new Date().toISOString(),
      dados
    };
    const arquivo = caminhoBronze(dir, tipo, quando);
    fila = fila.then(async () => {
      await fs.promises.mkdir(path.dirname(arquivo), { recursive: true });
      await fs.promises.appendFile(arquivo, JSON.stringify(evento) + "\n");
    }).catch(() => { falhas += 1; }); // falha de disco não derruba o atendimento
    return evento;
  }

  return {
    ativo: true,
    registrar,
    pseudonimo: nome => pseudonimizar(nome, segredo),
    get falhas() { return falhas; },
    esvaziar: () => fila
  };
}
