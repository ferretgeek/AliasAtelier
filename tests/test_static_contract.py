from __future__ import annotations

import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AssetParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.resources: list[str] = []
        self.inline_scripts = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "script":
            source = values.get("src")
            if source:
                self.resources.append(source)
            else:
                self.inline_scripts += 1
        elif tag == "link" and values.get("href"):
            self.resources.append(values["href"] or "")
        elif tag == "img" and values.get("src"):
            self.resources.append(values["src"] or "")


def png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or data[12:16] != b"IHDR":
        raise AssertionError(f"Not a PNG: {path}")
    return struct.unpack(">II", data[16:24])


class StaticContractTests(unittest.TestCase):
    def test_page_uses_only_local_executable_assets(self) -> None:
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        parser = AssetParser()
        parser.feed(source)
        self.assertEqual(parser.inline_scripts, 0)
        self.assertTrue(parser.resources)
        for resource in parser.resources:
            self.assertFalse(resource.startswith(("http://", "https://", "//")), resource)
            target = ROOT / resource.split("?", 1)[0]
            self.assertTrue(target.is_file(), resource)

    def test_privacy_csp_and_no_network_primitives(self) -> None:
        source = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("connect-src 'none'", source)
        scripts = "\n".join(
            path.read_text(encoding="utf-8") for path in (ROOT / "assets").glob("*.js")
        )
        for primitive in ("fetch(", "XMLHttpRequest", "WebSocket", "sendBeacon"):
            self.assertNotIn(primitive, scripts)

    def test_all_themes_and_responsive_breakpoints_exist(self) -> None:
        css = (ROOT / "assets" / "app.css").read_text(encoding="utf-8")
        for theme in ("jade", "sunset", "graphite"):
            self.assertIn(f'html[data-theme="{theme}"]', css)
        self.assertIn("--bg: #17191d", css)
        self.assertIn("@media (max-width: 900px)", css)
        self.assertIn("@media (max-width: 640px)", css)

    def test_preview_and_favicon_contract(self) -> None:
        self.assertEqual(png_size(ROOT / "docs" / "images" / "social-preview.png"), (1280, 640))
        self.assertEqual(png_size(ROOT / "docs" / "images" / "dashboard.png"), (1280, 720))
        self.assertLess((ROOT / "docs" / "images" / "social-preview.png").stat().st_size, 1_000_000)
        self.assertGreater((ROOT / "favicon.ico").stat().st_size, 1024)
        self.assertTrue((ROOT / "favicon.svg").read_text(encoding="utf-8").startswith("<svg"))


if __name__ == "__main__":
    unittest.main()
