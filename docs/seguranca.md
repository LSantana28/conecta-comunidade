# Práticas de segurança implementadas

| # | Prática | Onde | Teste |
|---|---------|------|-------|
| 1 | **Validação de entrada** no servidor: listas fechadas para situação/interesse/turno, regex para nome, protocolo, sala e id de serviço, limite de 500 caracteres na descrição e de 10 KB no corpo; campos fora da lista são descartados | `src/server/seguranca.js` (`validarPerfil`, `validarReserva`, `validarLeituraIoT`) | CT08, CT08c, CT12b |
| 2 | **Proteção contra XSS**: todo dado dinâmico passa por `esc()` antes de ir ao HTML + Content-Security-Policy sem scripts inline. *O protótipo original inseria o nome digitado direto em `innerHTML`; isso foi corrigido.* | `public/js/util.js`, `CABECALHOS_SEGURANCA` | CT08b, CT14, E2E-03 |
| 3 | **Autenticação do gestor**: senha guardada como hash **scrypt** com salt; sessão por **token assinado HMAC-SHA256** com expiração de 1 h; comparação em tempo constante | `gerarHashSenha`, `assinarToken`, `verificarToken` | CT09, CT10 |
| 4 | **Autenticação de dispositivos IoT** por chave no cabeçalho `X-Device-Key` | `chaveDispositivoValida`, rota `/api/iot/leituras` | CT11 |
| 5 | **Rate limiting**: 300 req/min por IP e 10 tentativas de login/min (anti força bruta) | `criarRateLimiter` | CT13, CT13b |
| 6 | **Cabeçalhos de segurança**: CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; bloqueio de *path traversal* nos arquivos estáticos | `app.js` | CT14 |
| 7 | **Proteção de dados (LGPD)**: só o primeiro nome é armazenado na reserva; nome mascarado em respostas de log e na visão do gestor; logs sem dados pessoais | `validarReserva`, `mascararNome` | CT06, CT08b, CT09 |
| 8 | **Segredos fora do código**: `.env` no `.gitignore`; em `NODE_ENV=production` a aplicação **não sobe** sem `ADMIN_PASSWORD_HASH`, `TOKEN_SECRET` e `IOT_DEVICE_KEY` | `carregarConfig` | `evidencias/config-producao-sem-segredos.txt` |
| 9 | **Container sem root** e imagem mínima (alpine, sem ferramentas de teste) | `Dockerfile` | build no CI |

> As credenciais `admin / conecta2026` e `dev-iot-key` existem **apenas** no modo de desenvolvimento, para a demonstração.
