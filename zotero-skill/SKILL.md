---
name: botcite-zotero
description: Zotero-focused workflows with botcite: library operations, notes, enrichment, dedup, export, and safe write controls.
---

# Zotero Skill

Use this skill when the user asks for Zotero library operations.

## Login / Identity
```bash
bun run local zotero whoami --api-key <KEY>
bun run local zotero login --api-key <KEY>
```

## Core Item Ops
```bash
bun run local zotero query "transformer" --limit 20 --json
bun run local zotero cite AB12CD34
bun run local zotero add '{"itemType":"journalArticle","title":"Demo"}'
bun run local zotero update AB12CD34 '{"title":"Updated title"}'
bun run local zotero delete AB12CD34
```

## Note Ops
```bash
bun run local zotero note add AB12CD34 "<p>note</p>"
bun run local zotero note list AB12CD34 --limit 20
bun run local zotero note search "keyword" --parent AB12CD34
bun run local zotero note update CD34EF56 "<p>updated</p>"
bun run local zotero note delete CD34EF56
```

## Maintenance / Automation
```bash
bun run local zotero safe-mode on
bun run local zotero sync-cite --apply
bun run local zotero dedup --limit 300
bun run local zotero enrich --apply
bun run local zotero export md --out ./library.md
bun run local zotero note cite-links "doi" --apply
```

## Write Safety
- Default to `--dry-run` or `safe-mode on` before bulk writes.
- `delete` requires explicit confirmation unless `-y`.
- `update/delete` use version preconditions to avoid stale writes.
