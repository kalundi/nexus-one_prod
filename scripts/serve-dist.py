import mimetypes
import os
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

mimetypes.add_type('application/javascript', '.js', True)
mimetypes.add_type('text/javascript', '.js', True)
mimetypes.add_type('text/css', '.css', True)
mimetypes.add_type('application/json', '.json', True)
mimetypes.add_type('image/svg+xml', '.svg', True)

root = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else (Path(__file__).resolve().parents[1] / 'dist')
port = int(sys.argv[1]) if len(sys.argv) > 1 else 3000

class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(root), **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

if __name__ == '__main__':
    os.chdir(root)
    with ThreadingHTTPServer(('127.0.0.1', port), Handler) as httpd:
        print(f'Serving {root} at http://127.0.0.1:{port}/')
        httpd.serve_forever()
