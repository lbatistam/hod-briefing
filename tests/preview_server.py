"""Local UI harness; never installs an extension or calls Groq."""
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/popup.html":
            text = Path("popup.html").read_text().replace('<script src="settings.js">', '<script src="tests/mock-chrome.js"></script><script src="settings.js">')
        elif self.path == "/result.html":
            text = '<!doctype html><html><head><meta charset="utf-8">' + ''.join('<link rel="stylesheet" href="'+f+'">' for f in ["ai-modal.css","window.css","briefing-readability.css","central.css"]) + '</head><body><script src="tests/mock-chrome.js"></script><script src="settings.js"></script><script src="fixture.js"></script></body></html>'
        elif self.path == "/fixture.js":
            code = Path("content.js").read_text()
            cutoff = code.index("  chrome.storage.sync.get(DEFAULT_SETTINGS)")
            text = code[:cutoff] + '''
  showBriefingModal("**Ana Paula Gama**\\n\\n`Lead do Instagram`\\n`Administração`\\n`Desempregada`\\n\\nBusca recolocação para ficar mais perto da família.\\n\\n🎯 Quer trabalhar perto da família", "CONTATO: Ana\\n\\nFELIPE:\\nO que busca?\\n\\nANA:\\nQuero ficar perto da família", {}, {label:"Demonstração local", captureMs:2800, latencyMs:1900});
})();
'''
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8" if self.path.endswith(".js") else "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode())

HTTPServer(("127.0.0.1", 8772), Preview).serve_forever()
