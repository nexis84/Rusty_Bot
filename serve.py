import http.server
import socketserver
import os
import posixpath

os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 3006

SENSITIVE_SEGMENTS = {
    ".env", ".env.local", ".env.development.local",
    "deploy_state.json", "snapshot.json", "config.json",
    "deploy.tar.gz", "deploy_oracle.ps1", "deploy_to_oracle.ps1", "update_oracle.ps1",
    "keys", "node_modules", "sde", "SDE", "__pycache__",
    "serve.js", "serve.py", "server.js",
}
SENSITIVE_EXTENSIONS = {".key", ".pem", ".crt", ".p12", ".pfx", ".log"}


class SafeHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # Reject path traversal (the base class already guards via normpath, but be explicit)
        parts = posixpath.normpath(path).split("/")
        if any(p == ".." for p in parts):
            return None
        return super().translate_path(path)

    def is_sensitive(self, fullpath):
        rel = os.path.normpath(os.path.relpath(fullpath, os.getcwd()))
        parts = [p for p in rel.split(os.sep) if p]
        for p in parts:
            if p in SENSITIVE_SEGMENTS:
                return True
            if p.startswith("."):
                return True
        ext = os.path.splitext(rel)[1].lower()
        return ext in SENSITIVE_EXTENSIONS

    def do_GET(self):
        fullpath = self.translate_path(self.path)
        if fullpath is None or not os.path.exists(fullpath):
            self.send_error(404, "Not found")
            return
        if os.path.isdir(fullpath):
            fullpath = os.path.join(fullpath, "index.html")
            if not os.path.exists(fullpath):
                self.send_error(404, "Not found")
                return
        if self.is_sensitive(fullpath):
            self.send_error(403, "Forbidden")
            return
        super().do_GET()


with socketserver.TCPServer(("127.0.0.1", PORT), SafeHandler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
