"""Local UI harness; never installs an extension or calls Groq."""
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path

class Preview(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/popup.html":
            text = Path("popup.html").read_text().replace('<script src="briefing-view.js">', '<script src="tests/mock-chrome.js"></script><script src="briefing-view.js">')
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header("Content-Type", "application/javascript; charset=utf-8" if self.path.endswith(".js") else "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(text.encode())

HTTPServer(("127.0.0.1", 8772), Preview).serve_forever()
