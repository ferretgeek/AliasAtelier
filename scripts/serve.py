"""Small dependency-free static server for Alias Atelier."""

from __future__ import annotations

import argparse
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = {
    "/": ROOT / "index.html",
    "/index.html": ROOT / "index.html",
    "/favicon.svg": ROOT / "favicon.svg",
    "/favicon.ico": ROOT / "favicon.ico",
    "/favicon.png": ROOT / "favicon.png",
    "/site.webmanifest": ROOT / "site.webmanifest",
    "/assets/app.css": ROOT / "assets" / "app.css",
    "/assets/app.js": ROOT / "assets" / "app.js",
    "/assets/alias-core.js": ROOT / "assets" / "alias-core.js",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "AliasAtelier/1.0"

    def do_GET(self) -> None:  # noqa: N802
        route = unquote(urlsplit(self.path).path)
        if route == "/healthz":
            self._send_bytes(b'ok\n', "text/plain; charset=utf-8", no_store=True)
            return
        path = PUBLIC_FILES.get(route)
        if path is None or not path.is_file():
            self.send_error(HTTPStatus.NOT_FOUND)
            return
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if mime.startswith("text/") or mime in {"application/javascript", "application/manifest+json"}:
            mime += "; charset=utf-8"
        self._send_bytes(path.read_bytes(), mime, no_store=route in {"/", "/index.html"})

    def _send_bytes(self, body: bytes, content_type: str, *, no_store: bool = False) -> None:
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
            "connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; "
            "frame-ancestors 'none'",
        )
        self.send_header("Cache-Control", "no-store" if no_store else "public, max-age=3600")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description="Serve Alias Atelier locally")
    value.add_argument("--host", default="127.0.0.1", help="listen address (default: 127.0.0.1)")
    value.add_argument("--port", type=int, default=4173, help="listen port (default: 4173)")
    return value


def main() -> None:
    args = parser().parse_args()
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        print(f"Alias Atelier is listening on http://{args.host}:{args.port}")
        server.serve_forever()


if __name__ == "__main__":
    main()
