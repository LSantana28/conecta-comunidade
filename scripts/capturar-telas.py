# Percorre o fluxo funcional completo no navegador e salva screenshots em docs/evidencias/
# Uso: (com o servidor rodando)  python scripts/capturar-telas.py
# Requer: pip install playwright && playwright install chromium
import os, sys
from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://localhost:3000")
SAIDA = os.path.join(os.path.dirname(__file__), "..", "docs", "evidencias")
SENHA = os.environ.get("ADMIN_PASSWORD", "conecta2026")
erros_console = []

with sync_playwright() as p:
    nav = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    pg = nav.new_page(viewport={"width": 1280, "height": 900})
    # 400/401 são esperados (testes de validação e de login negado)
    pg.on("console", lambda m: m.type == "error" and not any(c in m.text for c in ("400", "401")) and erros_console.append(m.text))
    pg.on("pageerror", lambda e: erros_console.append(str(e)))
    shot = lambda nome: pg.screenshot(path=os.path.join(SAIDA, nome), full_page=True)

    # 1. Recomendações — Cenário 1
    pg.goto(BASE + "/#/recomendacoes")
    pg.click("text=Cenário 1: Emprego")
    pg.wait_for_selector(".card .score")
    shot("01-recomendacoes.png")

    # 2. Agendar a 1ª recomendação
    pg.click(".card [data-reservar] >> nth=0")
    pg.wait_for_selector("dialog[open]")
    shot("02-confirmar-agendamento.png")
    pg.click("#dialogoOk")
    pg.wait_for_selector("#toast.visivel")
    pg.wait_for_timeout(400)
    shot("03-reserva-confirmada.png")
    pg.wait_for_selector("#toast.visivel", state="detached", timeout=6000)

    # 3. Validação de entrada (segurança) — nome com HTML
    pg.fill("#cidadao", "<script>alert(1)</script>")
    pg.click("#btnGerar")
    pg.wait_for_selector("[data-erro=cidadao]:not([hidden])")
    shot("04-validacao-entrada.png")

    # 4. Meus agendamentos
    pg.goto(BASE + "/#/agendamentos")
    pg.wait_for_selector(".card")
    shot("05-agendamentos.png")

    # 5. Catálogo com ocupação IoT
    pg.goto(BASE + "/#/catalogo")
    pg.wait_for_selector(".grade-cards .card")
    pg.wait_for_timeout(600)
    shot("06-catalogo.png")

    # 6. Login do gestor (dashboard protegido)
    pg.goto(BASE + "/#/dashboard")
    pg.wait_for_selector("#formLogin")
    pg.fill("#usuario", "admin"); pg.fill("#senha", "senha-errada")
    pg.click("#formLogin button")
    pg.wait_for_selector("#erroLogin:not([hidden])")
    shot("07-login-negado.png")
    pg.fill("#senha", SENHA)
    pg.click("#formLogin button")

    # 7. Dashboard
    pg.wait_for_selector(".kpi")
    pg.wait_for_timeout(800)
    shot("08-dashboard.png")
    nav.close()

print("Erros no console do navegador:", erros_console or "nenhum")
sys.exit(1 if erros_console else 0)
