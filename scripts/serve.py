"""Small dependency-free static server for Alias Atelier."""

from __future__ import annotations

import argparse
import mimetypes
import re
import threading
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from http.server import ThreadingHTTPServer as _ThreadingHTTPServer
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
MAX_CONNECTION_THREADS = 64
SOCKET_TIMEOUT_SECONDS = 10
LOG_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


class ThreadingHTTPServer(_ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, handler) -> None:
        self.connection_slots = threading.BoundedSemaphore(MAX_CONNECTION_THREADS)
        super().__init__(address, handler)

    def get_request(self):
        request, client_address = super().get_request()
        request.settimeout(SOCKET_TIMEOUT_SECONDS)
        return request, client_address

    def process_request(self, request, client_address) -> None:
        if not self.connection_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self.connection_slots.release()
            raise

    def process_request_thread(self, request, client_address) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()


def safe_log_value(value: object, *, limit: int = 500) -> str:
    return LOG_CONTROL_RE.sub("?", str(value)).replace("\r", "?").replace("\n", "?")[:limit]


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
        peer = self.client_address[0] if self.client_address else "unknown"
        rendered = format % args
        print(f"{safe_log_value(peer, limit=80)} - {safe_log_value(rendered)}")


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
