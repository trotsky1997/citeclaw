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

## Zotero account library

Login once (credentials are saved under `.local/state/zotero-auth.json`):

```bash
bun run local zotero whoami --api-key <zotero_api_key>
bun run local zotero login --api-key <zotero_api_key>
bun run local zotero login --user-id <zotero_user_id> --api-key <zotero_api_key>
```

Query your library:

```bash
bun run local zotero query "transformer" --limit 20
```

Dump library items (JSON):

```bash
bun run local zotero dump --limit 50
```

Cite a specific item by key or Zotero URL:

```bash
bun run local zotero cite AB12CD34
bun run local zotero cite "https://www.zotero.org/users/<id>/items/AB12CD34"
```

Write operations (strict sanity checks enabled):

```bash
bun run local zotero add '{"itemType":"journalArticle","title":"Demo"}'
bun run local zotero update AB12CD34 '{"title":"Updated title"}'
bun run local zotero delete AB12CD34
bun run local zotero delete -y AB12CD34
```

Note operations:

```bash
bun run local zotero note add AB12CD34 "<p>Key takeaway: ...</p>"
bun run local zotero note list AB12CD34 --limit 20
bun run local zotero note search "transformer"
bun run local zotero note search "transformer" --parent AB12CD34
bun run local zotero note update CD34EF56 "<p>Updated note</p>"
bun run local zotero note delete CD34EF56
bun run local zotero note delete -y CD34EF56
```

Write-safety notes:
- API key must have write permissions.
- `update` rejects reserved fields (`key`, `version`, `libraryID`, `itemType`, `links`, `meta`).
- `delete` / `update` use item-version preconditions to avoid stale writes.
- `delete` requires typing `yes` unless `-y/--yes` is passed.
- `note add/update` accept HTML or plain text; plain text is auto-wrapped into safe HTML.

Advanced Zotero workflows:

```bash
# persistent dry-run guardrail
bun run local zotero safe-mode on
bun run local zotero safe-mode status

# fill missing "Citation Key" in extra field
bun run local zotero sync-cite --apply

# detect possible duplicates
bun run local zotero dedup --limit 300

# enrich incomplete records (metadata backfill)
bun run local zotero enrich --apply

# export library to Markdown
bun run local zotero export md --out ./library.md

# note reference automation
bun run local zotero note cite-links "doi" --apply

# item templates
bun run local zotero templates paper
bun run local zotero templates paper --apply

# watch query and append new cites to bib
bun run local zotero watch "transformer" --out-bib ./watch.bib --interval 60
```

Logout:

```bash
bun run local zotero logout
```

## Packaging & publish
Dry-run package contents:

```bash
bun run pack:dry-run
```

Publish to npm:

```bash
npm publish
```
