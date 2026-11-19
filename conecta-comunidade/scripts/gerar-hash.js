// Gera o hash scrypt da senha do gestor para a variável ADMIN_PASSWORD_HASH
// Uso: node scripts/gerar-hash.js "minha-senha-forte"
import { gerarHashSenha } from "../src/server/seguranca.js";

const senha = process.argv[2];
if (!senha || senha.length < 10) {
  console.error("Informe uma senha com pelo menos 10 caracteres.");
  process.exit(1);
}
console.log(gerarHashSenha(senha));
