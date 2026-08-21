<div align="center">
  <img src="docs/images/social-preview.png" alt="Email alias generator — entirely in your browser" width="100%">

  # Email alias generator

  [中文](README.md) · English

  [![CI](https://github.com/ferretgeek/email-alias-generator/actions/workflows/ci.yml/badge.svg)](https://github.com/ferretgeek/email-alias-generator/actions/workflows/ci.yml)
  [![CodeQL](https://github.com/ferretgeek/email-alias-generator/actions/workflows/codeql.yml/badge.svg)](https://github.com/ferretgeek/email-alias-generator/actions/workflows/codeql.yml)
  [![License: MIT](https://img.shields.io/badge/License-MIT-2f817f.svg)](LICENSE)
  [![Local only](https://img.shields.io/badge/data-never_leaves_the_browser-e89b5d.svg)](#privacy-by-design)

  [Deployment](docs/部署说明.md) · [Technical and security notes](docs/技术与安全.md) · [Security reporting](SECURITY.md)
</div>

> Split one address into an orderly set of tagged receiving addresses — entirely in your browser.

## Why this exists

Most mail providers support **plus addressing**: anything sent to `you+anytag@gmail.com` still lands in your normal inbox.

That means you can give every website its own address: `me+shopping@`, `me+github@`, `me+that-giveaway@`. The day spam starts arriving, the address tells you who leaked it — and you can filter that one address away.

Typing them by hand is slow. This generates them in bulk: paste a batch of addresses, set the tag rules, get anywhere from dozens to tens of thousands of addresses, export as TXT.

**Everything runs in your browser. The page has no channel for uploading data at all.**

## Interface

![Workbench](docs/images/dashboard.png)

![Entry point and design language](docs/images/intro.png)

## What it does

- **Recognizes the platform** — detects Gmail and Microsoft / Exchange Online addresses and generates per their rules.
- **Handles your own domain too** — iCloud and arbitrary domains get an explicit "compatibility experiment" mode, because **unverified behavior shouldn't be dressed up as a promise.**
- **Accepts several input formats** — plain addresses, `address----extra field`, and Gmail's two-line format.
- **Scales** — 1–50,000 tagged addresses per mailbox, capped at 200,000 per run, so a slip of the hand doesn't kill the browser tab.
- **Controllable output** — optionally keep the original address, keep the extra field, and choose one-line or two-line format.
- **Extra fields are stripped by default** — and even when you keep them, the on-screen preview only ever shows a mask.
- **Four global themes** — Daylight, Celadon, Dusk, and deep gray, remembered in the current browser.
- **No external dependencies** — no remote fonts, analytics scripts, API calls, or third-party runtime.

## Getting started

Requires Python 3.10 or later; the runtime uses only the standard library.

```bash
python scripts/serve.py
```

Open `http://127.0.0.1:4173`.

You can also open `index.html` directly, but the local server adds a fuller set of security response headers (plus a 10-second connection deadline, a 64-worker cap, and bounded single-line request logs).

Docker:

```bash
docker compose up -d --build
```

Then open `http://127.0.0.1:8080`. Public deployment, reverse proxying, and upgrades are covered in [deployment](docs/部署说明.md).

## Exactly how far each platform is supported

This section is deliberately verbose, because the distinction **matters**: generating an address is not the same as mail being delivered to it.

| Mode | What the tool does | Basis and limits |
| --- | --- | --- |
| Auto-detect | Handles Gmail and Microsoft only | Recommended default |
| Gmail | Generates `name+tag@gmail.example` | [Google's documentation](https://support.google.com/a/users/answer/9282734): tagged addresses arrive in the current inbox |
| Microsoft | Generates Exchange Online plus addressing | [Microsoft's documentation](https://learn.microsoft.com/exchange/recipients-in-exchange-online/plus-addressing-in-exchange-online): on by default, but an org admin can disable it |
| iCloud | Generates candidates only if you opt in | Apple documents [existing iCloud aliases](https://support.apple.com/guide/icloud/mm6b1a490a/icloud) and [Hide My Email](https://support.apple.com/guide/icloud/create-and-edit-addresses-mm1a876f7aed/icloud) — **dynamic `+tag` is never promised, so test it yourself first** |
| Any domain | Generates candidates | Whether it delivers is entirely up to your provider |

It only generates receiving addresses: it **doesn't create mailbox accounts, sign in, read mail, or bypass any site's rules.** Also worth knowing: some sites reject addresses containing `+` outright.

## Privacy by design

What you paste in may contain passwords, app-specific passwords, client identifiers, or refresh tokens. So the project is designed on the assumption that **the input is a secret**:

1. The page sets `connect-src 'none'` — **there is no upload channel at the browser level**, rather than a promise not to upload.
2. User content never enters `localStorage`, logs, or the URL. Only the theme name persists.
3. Extra fields don't reach the output by default, and the preview always masks them.
4. Downloads are created from an in-memory `Blob`; no server is involved.
5. `.gitignore` covers TXT files, private directories, data directories, and export directories, reducing the chance of an accidental commit.
6. Every example in the repository is fictional content written from scratch — none of the author's original account data.

## Worth noting technically

**Input size is bounded before splitting.** Pasted content is capped at 5 MiB of characters and 100,000 lines **before** line-splitting, diagnostics keep only the first 200 entries, and the final UTF-8 output has its own 32 MiB ceiling. The way a pure front-end tool dies is somebody pasting an 80 MB file, so the limits come first.

**`connect-src 'none'` is a hard guarantee.** That CSP directive makes it impossible for the page to issue a network request at all — even with a bug in the code or a poisoned dependency, there's no exit. That's more reliable than any privacy statement.

**The CI security gates actually run.** Ruff, Bandit, pip-audit, detect-secrets, CodeQL, and preview-asset validation all run in CI, and Gitleaks runs over the working tree and **full Git history** before any public release.

The detailed threat model, CSP, and release gates are in [technical and security notes](docs/技术与安全.md).

## Verification

```bash
node --test tests/alias-core.test.js
python -m unittest discover -s tests -p "test_*.py" -v
python -m compileall -q scripts tests
```

## Project structure

```text
assets/             Browser core, interactions, visual styles
deploy/             Nginx security configuration
docs/               Deployment, technical, security-audit docs and previews
scripts/serve.py    Zero-dependency local static server
tests/              Node core tests and Python server tests
index.html          Application entry point
```

## Contributing and license

Issues and improvements are welcome — read [CONTRIBUTING.md](CONTRIBUTING.md) first. For security issues, use GitHub Private Vulnerability Reporting as described in [SECURITY.md](SECURITY.md).

[MIT License](LICENSE). Independent project with no affiliation with or endorsement by Google, Microsoft, or Apple.
