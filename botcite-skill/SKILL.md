---
name: botcite
description: Unified citation and bibliography workflow using botcite CLI (Wikimedia Citoid, Zotero library ops, Crossref, Semantic Scholar, notes, dedup, enrich, export).
---

# botcite Skill

Use this skill when the user asks to:
- generate citations from DOI/URL/arXiv/PDF
- operate Zotero library items or notes
- query Crossref or Semantic Scholar
- run metadata cleanup workflows (dedup, enrich, sync-cite)

## Prerequisites
- Run in repo root: `/home/aka/citoid`
- Prefer top-level commands:
  - `botcite citoid ...`
  - `botcite crossref ...`
  - `botcite semantic-scholar ...`
  - `botcite zotero ...`

## Quick Commands

### Citoid / Citation
- `bun run local citoid formats`
- `bun run local citoid bibtex "10.1021/acsomega.2c05310"`
- `bun run local citation mediawiki "10.1021/acsomega.2c05310"`

### External APIs
- `bun run local crossref "10.1021/acsomega.2c05310" --json`
- `bun run local semantic-scholar "10.1021/acsomega.2c05310" --json`
- `bun run local semantic-scholar api /paper/search --params '{"query":"transformer","limit":3}' --json`

### Zotero
- Login: `bun run local zotero login --api-key <KEY>`
- Query: `bun run local zotero query "transformer" --limit 20 --json`
- Add: `bun run local zotero add '{"itemType":"journalArticle","title":"Demo"}'`
- Update: `bun run local zotero update AB12CD34 '{"title":"New"}'`
- Delete: `bun run local zotero delete AB12CD34` (or `-y`)

### Zotero Notes
- Add: `bun run local zotero note add AB12CD34 "<p>note</p>"`
- List: `bun run local zotero note list AB12CD34 --limit 20`
- Search: `bun run local zotero note search "keyword" --parent AB12CD34`
- Cite links: `bun run local zotero note cite-links "doi" --apply`

### Advanced Workflows
- Safe mode: `bun run local zotero safe-mode on`
- Sync citation keys: `bun run local zotero sync-cite --apply`
- Dedup suggestions: `bun run local zotero dedup --limit 300 --json`
- Enrich metadata: `bun run local zotero enrich --apply`
- Export markdown: `bun run local zotero export md --out ./library.md`
- Watch query: `bun run local zotero watch "transformer" --out-bib ./watch.bib --interval 60`

## Guardrails
- Prefer `--json` for machine-readable output.
- For write operations, use `--dry-run` or safe mode first.
- `zotero delete` should require confirmation unless user explicitly asks for `-y`.
- Semantic Scholar may return 429 without key; use `--s2-api-key` if needed.
- Wikimedia Citoid requires valid user-agent context; this repo already sets one in command implementation.
