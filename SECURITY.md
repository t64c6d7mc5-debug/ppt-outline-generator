# Security Policy

## Supported release

Security fixes are evaluated for the current `v2.3.15-rc2` release candidate.

## Reporting

Do not file public issues containing API keys, OpenWebUI tokens, customer material, request logs, local paths, or model responses. Use the repository maintainer's private reporting channel once one is configured. Until then, remove sensitive data and provide a minimal reproduction only.

## Local deployment notes

- Keep `.env` local and use `.env.example` only as a placeholder.
- Bind local model services to trusted interfaces unless you intentionally configure access control.
- Review OpenWebUI, browser, and operating-system logs independently; this repository cannot protect data stored by external local services.
