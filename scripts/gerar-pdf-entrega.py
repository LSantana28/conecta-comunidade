# Gera Conecta-Comunidade-Entregaveis.pdf (raiz) a partir de docs/entregaveis.md.
# A capa usa os dados do ENTREGA.txt (grupo, integrantes, link do pitch).
# Requer: pip install markdown playwright && playwright install chromium
# Uso: python scripts/gerar-pdf-entrega.py   (CHROME_PATH opcional)
import base64, html, os, pathlib, re, tempfile
import markdown
from playwright.sync_api import sync_playwright

RAIZ = pathlib.Path(__file__).resolve().parent.parent
DOCS = RAIZ / "docs"

# ---- capa a partir do ENTREGA.txt ----
txt = (RAIZ / "ENTREGA.txt").read_text(encoding="utf-8")
def campo(rotulo):
    m = re.search(rf"^{rotulo}\s*:\s*(.+)$", txt, re.M)
    return m.group(1).strip() if m else ""
grupo = campo("Nome do grupo")
link = campo(r"Link do vídeo pitch \(acesso público\)")
integrantes = [l.strip() for l in txt.splitlines() if l.strip().upper().startswith("RM")]
pendente = lambda v: (not v) or "PREENCHER" in v.upper()
lista = "".join(f"<li>{html.escape(i)}</li>" for i in integrantes if not pendente(i)) or "<li class='pend'>[preencher no ENTREGA.txt]</li>"
capa = f"""<section class="capa">
  <p class="tag">GLOBAL SOLUTION 2026/2 · CITIZENTECH · FIAP · 4ESOA</p>
  <h1 class="titulo">Conecta Comunidade</h1>
  <p class="sub">Tecnologia aproximando pessoas de oportunidades · ODS 10 e ODS 11</p>
  <p class="sub">Entregáveis: solução, arquitetura e evidências das 4 áreas</p>
  <table class="dados">
    <tr><th>Grupo</th><td>{html.escape(grupo) if not pendente(grupo) else "<span class='pend'>[preencher no ENTREGA.txt]</span>"}</td></tr>
    <tr><th>Integrantes</th><td><ul>{lista}</ul></td></tr>
    <tr><th>Vídeo pitch</th><td>{html.escape(link) if not pendente(link) else "<span class='pend'>[preencher no ENTREGA.txt]</span>"}</td></tr>
    <tr><th>Repositório</th><td>https://github.com/LSantana28/conecta-comunidade</td></tr>
    <tr><th>Como executar</th><td>README.md (Node.js 22+, sem dependências: <code>npm start</code>)</td></tr>
  </table>
</section><div class="quebra"></div>"""

# ---- corpo ----
corpo = markdown.markdown((DOCS / "entregaveis.md").read_text(encoding="utf-8"), extensions=["tables", "fenced_code"])
def embutir(alt, src):
    dados = base64.b64encode((DOCS / src).read_bytes()).decode()
    return f'<figure><img src="data:image/png;base64,{dados}" alt="{alt}"/><figcaption>{alt}</figcaption></figure>'
corpo = re.sub(r'<p><img alt="([^"]*)" src="([^"]+)" ?/?></p>', lambda m: embutir(m.group(1), m.group(2)), corpo)

estilo = """
@page { size: A4; margin: 15mm 14mm; }
body { font-family: "Segoe UI", system-ui, sans-serif; font-size: 10.2pt; color: #1e293b; line-height: 1.45; }
h1 { color: #115e59; font-size: 18pt; border-bottom: 3px solid #10b981; padding-bottom: 4px; }
h2 { color: #0f766e; font-size: 14pt; margin-top: 16px; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
h3 { font-size: 11.2pt; color: #0f172a; margin: 14px 0 6px; }
table { border-collapse: collapse; width: 100%; margin: 8px 0; font-size: 8.8pt; page-break-inside: avoid; }
th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; vertical-align: top; }
th { background: #f0fdfa; }
code { font-family: Consolas, monospace; font-size: 8.4pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; word-break: break-word; }
figure { margin: 10px 0; text-align: center; page-break-inside: avoid; }
img { max-width: 100%; max-height: 225mm; border: 1px solid #e2e8f0; border-radius: 6px; }
figcaption { font-size: 8.5pt; color: #64748b; margin-top: 3px; }
.quebra { page-break-before: always; }
.capa { padding-top: 55mm; }
.capa .tag { color: #0f766e; font-weight: 700; letter-spacing: 1.5px; font-size: 9pt; }
.capa .titulo { font-size: 34pt; border: none; margin: 6px 0; }
.capa .sub { color: #475569; font-size: 12pt; margin: 2px 0; }
.capa .dados { margin-top: 26mm; font-size: 10.5pt; }
.capa .dados th { width: 32mm; }
.capa ul { margin: 0; padding-left: 16px; }
.pend { color: #b91c1c; font-weight: 700; }
"""
doc = f"<!DOCTYPE html><html lang='pt-BR'><head><meta charset='utf-8'><style>{estilo}</style></head><body>{capa}{corpo}</body></html>"
tmp = pathlib.Path(tempfile.gettempdir(), "entregaveis.html")
tmp.write_text(doc, encoding="utf-8")
saida = RAIZ / "Conecta-Comunidade-Entregaveis.pdf"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=os.environ.get("CHROME_PATH") or None)
    pg = b.new_page(); pg.goto(tmp.as_uri()); pg.wait_for_timeout(400)
    pg.pdf(path=str(saida), format="A4", print_background=True,
           margin={"top": "15mm", "bottom": "15mm", "left": "14mm", "right": "14mm"},
           display_header_footer=True, header_template="<span></span>",
           footer_template='<div style="font-size:8px;color:#94a3b8;width:100%;text-align:center">Conecta Comunidade · Global Solution 2026/2 · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>')
    b.close()
print("Gerado:", saida.relative_to(RAIZ), "| pendências na capa:", "sim" if "[preencher" in capa else "não")
