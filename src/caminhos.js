// Caminhos do projeto resolvidos a partir da raiz do repositório (e não da pasta de onde o
// comando foi executado). Assim o app funciona igual em qualquer máquina, sistema ou terminal.
import path from "node:path";
import { fileURLToPath } from "node:url";

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// DATALAKE_DIR pode ser absoluto ou relativo à raiz do projeto
export function pastaDatalake(valor = process.env.DATALAKE_DIR) {
  return path.resolve(RAIZ, valor || "datalake");
}
