from __future__ import annotations

import importlib.util
import io
import threading
import unittest
from contextlib import redirect_stdout
from http.client import HTTPConnection
from pathlib import Path


def load_server_module():
    path = Path(__file__).resolve().parents[1] / "scripts" / "serve.py"
    spec = importlib.util.spec_from_file_location("alias_atelier_server", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load local server")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class ServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        module = load_server_module()
        cls.server = module.ThreadingHTTPServer(("127.0.0.1", 0), module.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_address[1]

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=2)

    def request(self, path: str) -> tuple[int, dict[str, str], bytes]:
        connection = HTTPConnection("127.0.0.1", self.port, timeout=2)
        connection.request("GET", path)
        response = connection.getresponse()
        body = response.read()
        headers = {key.lower(): value for key, value in response.getheaders()}
        connection.close()
        return response.status, headers, body

    def test_home_has_strict_privacy_headers(self) -> None:
        status, headers, body = self.request("/")
        self.assertEqual(status, 200)
        self.assertIn("邮箱别名生成器".encode(), body)
        self.assertIn("connect-src 'none'", headers["content-security-policy"])
        self.assertEqual(headers["x-content-type-options"], "nosniff")
        self.assertEqual(headers["cache-control"], "no-store")

    def test_health_endpoint(self) -> None:
        status, _, body = self.request("/healthz")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"ok\n")

    def test_unknown_and_traversal_paths_are_not_served(self) -> None:
        self.assertEqual(self.request("/missing.txt")[0], 404)
        self.assertEqual(self.request("/..%2FREADME.md")[0], 404)

    def test_server_bounds_threads_and_sanitizes_log_controls(self) -> None:
        module = load_server_module()
        self.assertEqual(self.server.connection_slots._value, 64)
        output = io.StringIO()
        with redirect_stdout(output):
            module.Handler.log_message(
                type("Fake", (), {"client_address": ("127.0.0.1", 1)})(),
                "%s",
                "line-one\n\x1b[31mforged",
            )
        rendered = output.getvalue()
        self.assertNotIn("\x1b", rendered)
        self.assertEqual(rendered.count("\n"), 1)


if __name__ == "__main__":
    unittest.main()
