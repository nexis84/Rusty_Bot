import http.server
import socketserver
import os

os.chdir(r'C:\Users\nexis\Desktop\Rusty Bot')

PORT = 3006
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
