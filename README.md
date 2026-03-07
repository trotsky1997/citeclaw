# botcite

`botcite` is a citation operations toolkit for researchers, agents, and knowledge workflows.

It combines:
- fast citation generation (DOI / URL / arXiv / PDF)
- Zotero library automation (items, notes, write-safe updates)
- external scholarly APIs (Wikimedia Citoid, Crossref, Semantic Scholar)
- MCP server mode for AI tool integration
- dual vendored style sources: `zotero-chinese/styles` + official `citation-style-language/styles`
- dual official/community translators: `zotero/translators` + `translators_CN` (merged at runtime)

[Citoid Documentation on mediawiki.org](https://www.mediawiki.org/wiki/Citoid)

## Why botcite
- One CLI for citation retrieval, metadata enrichment, and Zotero maintenance.
- Safe-by-default write workflows (`dry-run`, `safe-mode`, delete confirmation).
- Agent-ready through MCP (`tools/list`, `tools/call`).
- Works locally and remotely with `bunx github:...`.

## Quickstart
1. `bun install`
2. `bun run start -c config.dev.yaml`
3. Open: [http://localhost:1970/?doc](http://localhost:1970/?doc#!/Citations/get_api)

`botcite styles sync` now merges two vendored style repositories by default:
- Chinese community styles: `vendor/styles`
- Official CSL styles: `vendor/styles-official`

## Fast Start (CLI)

Local:

```bash
bun run local --help
bun run local cite bibtex 10.48550/arXiv.1706.03762
```

Remote (no publish step required):

```bash
bunx github:trotsky1997/botcite#master --help
bunx github:trotsky1997/botcite#master citoid formats
bunx github:trotsky1997/botcite#master citoid bibtex "10.1021/acsomega.2c05310"
bunx github:trotsky1997/botcite#master crossref "10.1021/acsomega.2c05310"
bunx github:trotsky1997/botcite#master semantic-scholar "10.1021/acsomega.2c05310"
```

## MCP Mode

Start MCP server:

```bash
bunx github:trotsky1997/botcite#master mcp
```

Implemented methods:
- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Current MCP tools:
- `cite`
- `cite_pdf`
- `fetch_pdf`
- `openurl_resolve`
- `citoid`
- `crossref`
- `semantic_scholar`
- `semantic_scholar_api`

## Zotero Workflows

Login:

```bash
bun run local zotero whoami --api-key <zotero_api_key>
bun run local zotero login --api-key <zotero_api_key>
```

Core operations:

```bash
bun run local zotero query "transformer" --limit 20
bun run local zotero cite AB12CD34
bun run local zotero add '{"itemType":"journalArticle","title":"Demo"}'
bun run local zotero update AB12CD34 '{"title":"Updated title"}'
bun run local zotero delete AB12CD34
```

Notes:

```bash
bun run local zotero note add AB12CD34 "<p>Key takeaway: ...</p>"
bun run local zotero note search "transformer" --parent AB12CD34
bun run local zotero note cite-links "doi" --apply
```

Safety model:
- `delete` requires interactive `yes` unless `-y/--yes`
- `update/delete` use version preconditions
- `safe-mode` and `--dry-run` available for write protection

## Advanced Workflows

```bash
bun run local zotero safe-mode on
bun run local zotero sync-cite --apply
bun run local zotero dedup --limit 300
bun run local zotero enrich --apply
bun run local zotero export md --out ./library.md
bun run local zotero watch "transformer" --out-bib ./watch.bib --interval 60
```

## Full Semantic Scholar Graph Access

```bash
bun run local semantic-scholar api /paper/search --params '{"query":"transformer","limit":3}'
bun run local semantic-scholar paper-search "transformer attention" --limit 5 --fields "title,year,authors,url"
bun run local semantic-scholar paper-batch @./paper_ids.txt --fields "title,year,authors"
bun run local semantic-scholar author 1741101 --fields "name,paperCount,citationCount"
```

Note: Semantic Scholar may return `429` without API key. Use `--s2-api-key <key>` or set `S2_API_KEY`.

## Packaging

```bash
bun run pack:dry-run
npm publish
```
