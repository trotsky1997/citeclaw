---
name: botcite-cli
description: Use botcite as a terminal-first citation toolkit (top-level citoid/crossref/semantic-scholar + basic cite/fetch commands).
---

# botcite CLI Skill

Use this skill when the task is best handled by direct CLI calls and shell pipelines.

## Primary Scope
- `botcite citoid` / `botcite citation`
- `botcite crossref`
- `botcite semantic-scholar`
- `botcite cite`, `cite-pdf`, `fetch-pdf`, `openurl-resolve`, `batch`

## Fast Commands
```bash
bun run local citoid formats
bun run local citoid bibtex "10.1021/acsomega.2c05310"
bun run local crossref "10.1021/acsomega.2c05310" --json
bun run local semantic-scholar "10.1021/acsomega.2c05310" --json
```

## Advanced Semantic Scholar
```bash
bun run local semantic-scholar api /paper/search --params '{"query":"transformer","limit":3}'
bun run local semantic-scholar paper-search "transformer attention" --limit 5 --fields "title,year,authors,url"
```

## Guardrails
- Prefer `--json` for machine-consumable output.
- Respect API limits; use `--s2-api-key` for Semantic Scholar to avoid 429.
- For PDF and batch flows, keep `--profile` and logs for diagnosis.
