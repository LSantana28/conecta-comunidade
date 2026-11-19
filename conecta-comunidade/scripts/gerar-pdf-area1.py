# Gera docs/ia/area1-ia-e-automacao.pdf a partir dos .md da Área 1 (requer: pip install markdown playwright)
# Uso: python scripts/gerar-pdf-area1.py   (CHROME_PATH opcional)
import markdown, pathlib, re, base64, tempfile
from playwright.sync_api import sync_playwright
base = pathlib.Path("docs/ia")
partes = [base/"README.md", base/"prompt-do-agente.md", base/"evidencias/avaliacao-antes-depois.md"]
html_partes = []
for p in partes:
    txt = p.read_text(encoding="utf-8")
    txt = re.sub(r"Uma versão em PDF.*?\n", "", txt)
    html_partes.append(markdown.markdown(txt, extensions=["tables", "fenced_code"]))
img = base64.b64encode(pathlib.Path("docs/evidencias/11-recomendacao-renda-v2.png").read_bytes()).decode()
figura = f'<figure><img src="data:image/png;base64,{img}"/><figcaption>Demonstração: cenário de renda na v2, com o cálculo da IA visível no card.</figcaption></figure>'
corpo = html_partes[0].replace("<h2>4. Lógica e ganho", figura + "<h2>4. Lógica e ganho", 1)
doc = f"""<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 16mm 14mm; }}
body {{ font-family: "Segoe UI", system-ui, sans-serif; font-size: 10.5pt; color: #1e293b; line-height: 1.45; }}
h1 {{ color: #115e59; font-size: 19pt; border-bottom: 3px solid #10b981; padding-bottom: 4px; }}
h2 {{ color: #0f766e; font-size: 13.5pt; margin-top: 18px; }} h3 {{ font-size: 11.5pt; }}
table {{ border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 9pt; page-break-inside: avoid; }}
th, td {{ border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }}
th {{ background: #f0fdfa; }}
pre {{ background: #0f172a; color: #e2e8f0; padding: 9px; border-radius: 6px; font-size: 7.6pt; white-space: pre-wrap; page-break-inside: auto; }}
code {{ font-family: Consolas, monospace; font-size: 8.8pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }}
pre code {{ background: none; padding: 0; font-size: inherit; }}
figure {{ margin: 10px 0; text-align: center; page-break-inside: avoid; }} img {{ max-width: 100%; border: 1px solid #e2e8f0; border-radius: 6px; }}
figcaption {{ font-size: 8.5pt; color: #64748b; }}
.quebra {{ page-break-before: always; }}
.capa {{ color: #64748b; font-size: 9pt; margin-top: -6px; }}
</style></head><body>
<p class="capa">Conecta Comunidade · CitizenTech · Global Solution 2026/2 · Área 1 — IA e automação</p>
{corpo}<div class="quebra"></div>{html_partes[1]}<div class="quebra"></div>{html_partes[2]}
</body></html>"""
pathlib.Path(tempfile.gettempdir(), "area1.html").write_text(doc, encoding="utf-8")
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=__import__("os").environ.get("CHROME_PATH") or None)
    pg = b.new_page(); pg.goto(pathlib.Path(tempfile.gettempdir(), "area1.html").as_uri()); pg.wait_for_timeout(300)
    pg.pdf(path=str(base/"area1-ia-e-automacao.pdf"), format="A4", print_background=True, margin={"top":"16mm","bottom":"16mm","left":"14mm","right":"14mm"},
           display_header_footer=True, header_template="<span></span>", footer_template='<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center">Conecta Comunidade · Área 1 — IA e automação · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>')
    b.close()
