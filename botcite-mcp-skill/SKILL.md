---
name: botcite-mcp
description: Run botcite in MCP mode and call tools over stdio for agent integrations.
---

# botcite MCP Skill

Use this skill when a client/agent needs tool-style access instead of shell command output.

## Start MCP Server
```bash
bunx github:trotsky1997/botcite#master mcp
```

## Implemented MCP Methods
- `initialize`
- `ping`
- `tools/list`
- `tools/call`

## Exposed MCP Tools
- `cite`
- `cite_pdf`
- `fetch_pdf`
- `openurl_resolve`
- `citoid`
- `crossref`
- `semantic_scholar`
- `semantic_scholar_api`

## Integration Notes
- Use `tools/list` at startup to confirm available tools.
- Use compact args and parse returned text/JSON explicitly.
- Keep requests idempotent where possible.
