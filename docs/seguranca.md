# Práticas de segurança implementadas

| # | Prática | Onde | Teste |
|---|---------|------|-------|
| 1 | **Validação de entrada** no servidor: listas fechadas para situação/interesse/turno, regex para nome, protocolo, sala e id de serviço, limite de 500 caracteres na descrição e de 10 KB no corpo; campos fora da lista são descartados | `src/server/seguranca.js` (`validarPerfil`, `validarReserva`, `validarLeituraIoT`) | CT08, CT08c, CT12b |
| 2 | **Proteção contra XSS**: todo dado dinâmico passa por `esc()` antes de ir ao HTML + Content-Security-Policy sem scripts inline. *O protótipo original inseria o nome digitado direto em `innerHTML`; isso foi corrigido.* | `public/js/util.js`, `CABECALHOS_SEGURANCA` | CT08b, CT14, E2E-03 |
| 3 | **Autenticação do gestor**: senha guardada como hash **scrypt** com salt; sessão por **token assinado HMAC-SHA256** com expiração de 1 h; comparação em tempo constante | `gerarHashSenha`, `assinarToken`, `verificarToken` | CT09, CT10 |
| 4 | **Autenticação de dispositivos IoT** por chave no cabeçalho `X-Device-Key` | `chaveDispositivoValida`, rota `/api/iot/leituras` | CT11 |
| 5 | **Rate limiting**: 300 req/min por IP, 10 tentativas de login/min (anti força bruta) e limite separado de 6.000 leituras/min para os sensores IoT | `criarRateLimiter` | CT13, CT13b |
| 6 | **Cabeçalhos de segurança**: CSP, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`; bloqueio de *path traversal* nos arquivos estáticos | `app.js` | CT14 |
| 7 | **Proteção de dados (LGPD)**: só o primeiro nome é armazenado na reserva; nome mascarado em respostas de log e na visão do gestor; logs sem dados pessoais | `validarReserva`, `mascararNome` | CT06, CT08b, CT09 |
| 8 | **Segredos fora do código**: `.env` no `.gitignore`; em `NODE_ENV=production` a aplicação **não sobe** sem `ADMIN_PASSWORD_HASH`, `TOKEN_SECRET`, `IOT_DEVICE_KEY` e `PSEUDONIMO_SECRET` | `carregarConfig` | `evidencias/config-producao-sem-segredos.txt` |
| 9 | **Container sem root** e imagem mínima (alpine, sem ferramentas de teste) | `Dockerfile` | build no CI |
| 11 | **Uma vaga por pessoa em cada serviço**: o agendamento exige CPF, validado pelos dígitos verificadores. O CPF não é armazenado nem devolvido: vira uma chave HMAC-SHA256 usada só para bloquear uma segunda reserva ativa da mesma pessoa no mesmo serviço. Impede que alguém esgote as vagas sozinho, e a tentativa duplicada não consome vaga | `cpfValido`, `chaveDocumento` em `seguranca.js`; `store.reservaAtivaDe()` | CT08, CT26, E2E-11 |
| 10 | **Pseudonimização no data lake (LGPD)**: o nome vira um código HMAC-SHA256 antes de ser gravado, e a descrição livre não é armazenada. Assim é possível contar pessoas e medir conversão sem saber quem são. Análises só para gestores autenticados, com validação dos filtros | `src/dados/ingestao.js`, rota `/api/admin/analises` | CT17, CT20, CT21 |

> As credenciais `admin / conecta2026` e `dev-iot-key` existem **apenas** no modo de desenvolvimento, para a demonstração.
