# Security Policy

## Supported versions

Security fixes are provided for the latest release on the `main` branch.

## Report privately

Please use GitHub **Private vulnerability reporting** in this repository. Do not open a public issue for a vulnerability or include real credentials, account files, private addresses, or identifying screenshots in a report.

Include a concise impact description, affected version, minimal reproduction using synthetic data, and any suggested mitigation. Reports are reviewed without requiring the reporter to disclose unrelated personal information.

## Data boundary

Alias Atelier is designed to process mailbox records in browser memory. It has no application API and its CSP disables network connections. This boundary does not protect a compromised browser extension, operating system, clipboard, reverse proxy, or exported TXT file.

Pasted/file input is bounded before line allocation, retained diagnostics and generated UTF-8 bytes have separate caps, and explicit paired mode treats its second line as opaque metadata. The optional local server applies socket deadlines, caps worker threads, and escapes request-derived terminal controls in logs.

If a deployment adds analytics, remote scripts, remote fonts, or a broader `connect-src`, it is no longer equivalent to the privacy model documented by this repository.

## 中文说明

安全问题请通过本仓库的 GitHub 私密漏洞报告提交，不要公开包含真实账号、密码、令牌、私人地址或身份截图的问题。请只使用合成数据给出最小复现。
