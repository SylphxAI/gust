---
"@sylphx/gust-server": minor
"@sylphx/gust": patch
---

Remove turboServe / Bun.serve parallel HTTP path from published @sylphx/gust-server (main already fail-closed on serve() → gust-napi). Republish so consumers no longer receive Dec-2025 dist with turboServe export. Includes http-core differential harness already on main.
