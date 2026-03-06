# botcite (Citoid Local)

`botcite` is a Bun-friendly CLI/service for resolving citation data from URL/DOI/arXiv and related identifiers.

[Citoid Documentation on mediawiki.org](https://www.mediawiki.org/wiki/Citoid)

## Quickstart
1. Run `bun install`
2. Run `bun run start -c config.dev.yaml`
3. Open [http://localhost:1970/?doc](http://localhost:1970/?doc#!/Citations/get_api) in your browser

## One-shot CLI (`botcite`)
Run locally:

```bash
bun run local --help
bun run local cite bibtex 10.48550/arXiv.1706.03762
```

Run directly from GitHub (no npm publish required):

```bash
bunx github:trotsky1997/botcite#master --help
bunx github:trotsky1997/botcite#master cite bibtex "10.1021/acsomega.2c05310"
bunx github:trotsky1997/botcite#master cite bibtex "https://arxiv.org/pdf/2603.01919.pdf"
```

## MCP mode
Start MCP server over stdio:

```bash
bunx github:trotsky1997/botcite#master mcp
```

Implemented MCP methods:
- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Available tools:
- `cite` (`format`, `query`)
- `cite_pdf` (`pdf_path`)
- `fetch_pdf` (`identifier`, optional `out`, `base`)
- `openurl_resolve` (`identifier`, optional `base`)

## Packaging & publish
Dry-run package contents:

```bash
bun run pack:dry-run
```

Publish to npm:

```bash
npm publish
```
