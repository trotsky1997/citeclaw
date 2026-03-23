# CiteClaw

`CiteClaw` is a citation operations toolkit for researchers, agents, and knowledge workflows.

It combines:
- fast citation generation (DOI / URL / arXiv / PDF)
- Zotero library automation (items, notes, write-safe updates)
- external scholarly APIs (Wikimedia Citoid, Crossref, Semantic Scholar)
- MCP server mode for AI tool integration
- dual vendored style sources: `zotero-chinese/styles` + official `citation-style-language/styles`
- dual official/community translators: `zotero/translators` + `translators_CN` (merged at runtime)

[Citoid Documentation on mediawiki.org](https://www.mediawiki.org/wiki/Citoid)

## Why CiteClaw
- One CLI for citation retrieval, metadata enrichment, and Zotero maintenance.
- Safe-by-default write workflows (`dry-run`, `safe-mode`, delete confirmation).
- Agent-ready through MCP (`tools/list`, `tools/call`).
- Works locally and remotely with `npx github:...`.

## Quickstart
1. `npm install`
2. `npm run start -- -c config.dev.yaml`
3. Open: [http://localhost:1970/?doc](http://localhost:1970/?doc#!/Citations/get_api)

`citeclaw styles sync` now merges two vendored style repositories by default:
- Chinese community styles: `vendor/styles`
- Official CSL styles: `vendor/styles-official`

## Fast Start (CLI)

Primary command is `citeclaw`. Legacy `botcite` remains available as an alias for backward compatibility.

Entry:

```bash
npx github:trotsky1997/botcite#master --help
npx github:trotsky1997/botcite#master citoid formats
npx github:trotsky1997/botcite#master citoid bibtex "10.1021/acsomega.2c05310"
npx github:trotsky1997/botcite#master crossref "10.1021/acsomega.2c05310"
npx github:trotsky1997/botcite#master semantic-scholar "10.1021/acsomega.2c05310"
npx github:trotsky1997/botcite#master cite bibtex 10.48550/arXiv.1706.03762
```

## MCP Mode

Start MCP server:

```bash
npx github:trotsky1997/botcite#master mcp
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
npx github:trotsky1997/botcite#master zotero whoami --api-key <zotero_api_key>
npx github:trotsky1997/botcite#master zotero login --api-key <zotero_api_key>
```

Core operations:

```bash
npx github:trotsky1997/botcite#master zotero query "transformer" --limit 20
npx github:trotsky1997/botcite#master zotero cite AB12CD34
npx github:trotsky1997/botcite#master zotero add '{"itemType":"journalArticle","title":"Demo"}'
npx github:trotsky1997/botcite#master zotero update AB12CD34 '{"title":"Updated title"}'
npx github:trotsky1997/botcite#master zotero delete AB12CD34
```

Notes:

```bash
npx github:trotsky1997/botcite#master zotero note add AB12CD34 "<p>Key takeaway: ...</p>"
npx github:trotsky1997/botcite#master zotero note search "transformer" --parent AB12CD34
npx github:trotsky1997/botcite#master zotero note cite-links "doi" --apply
```

Safety model:
- `delete` requires interactive `yes` unless `-y/--yes`
- `update/delete` use version preconditions
- `safe-mode` and `--dry-run` available for write protection

## Advanced Workflows

```bash
npx github:trotsky1997/botcite#master zotero safe-mode on
npx github:trotsky1997/botcite#master zotero sync-cite --apply
npx github:trotsky1997/botcite#master zotero dedup --limit 300
npx github:trotsky1997/botcite#master zotero enrich --apply
npx github:trotsky1997/botcite#master zotero export md --out ./library.md
npx github:trotsky1997/botcite#master zotero watch "transformer" --out-bib ./watch.bib --interval 60
```

## Full Semantic Scholar Graph Access

```bash
npx github:trotsky1997/botcite#master semantic-scholar api /paper/search --params '{"query":"transformer","limit":3}'
npx github:trotsky1997/botcite#master semantic-scholar paper-search "transformer attention" --limit 5 --fields "title,year,authors,url"
npx github:trotsky1997/botcite#master semantic-scholar paper-batch @./paper_ids.txt --fields "title,year,authors"
npx github:trotsky1997/botcite#master semantic-scholar author 1741101 --fields "name,paperCount,citationCount"
```

Note: Semantic Scholar may return `429` without API key. Use `--s2-api-key <key>` or set `S2_API_KEY`.

## Packaging

```bash
npm run pack:dry-run
npm publish
```
