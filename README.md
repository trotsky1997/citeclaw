# CiteClaw

`CiteClaw` is a citation and bibliography toolkit built on top of Wikimedia Citoid, Crossref, Semantic Scholar, and Zotero-oriented workflows.

It is designed for two related jobs:

- fast citation resolution from DOI, URL, arXiv, anthology pages, and PDFs
- larger bibliography workflows such as cleaning BibTeX, expanding literature coverage, and maintaining Zotero-backed reference sets

## What It Does

`CiteClaw` combines:

- a CLI for citation lookup, metadata export, PDF resolution, and batch jobs
- an HTTP service compatible with Citoid-style API flows
- an MCP server mode for agent/tool integrations
- Zotero automation for query, cite, add, update, notes, dedup, enrichment, and export
- optional translator/style sync commands for broader coverage and local CSL rendering

## Fast Start

Run from npm:

```bash
npx citeclaw --help
npx citeclaw citoid formats
npx citeclaw cite bibtex 10.48550/arXiv.1706.03762
npx citeclaw crossref "10.1021/acsomega.2c05310"
```

Typical resolution flows:

```bash
npx citeclaw citoid bibtex "10.1145/3589334.3648158"
npx citeclaw citoid bibtex "https://arxiv.org/abs/2305.19860"
npx citeclaw citoid bibtex "https://aclanthology.org/2023.emnlp-main.398/"
npx citeclaw cite mediawiki "https://arxiv.org/abs/1706.03762"
```

Fresh npm installs can run normal citation commands directly. `CiteClaw` will bootstrap Zotero and build a local translator runtime automatically from the bundled Zotero translator set.

## Local Service

Install dependencies and start the service:

```bash
npm install
npm run start -- -c config.dev.yaml
```

Then open:

- API docs: `http://localhost:1970/?doc`
- OpenAPI spec: `http://localhost:1970/?spec`
- Service info: `http://localhost:1970/_info`

The service layer is still based on the Wikimedia Citoid architecture:

- homepage: <https://www.mediawiki.org/wiki/Citoid>
- HTTP entrypoints: [server.js](/mnt/e/botcite/server.js), [app.js](/mnt/e/botcite/app.js)

## MCP Mode

Start the MCP server over stdio:

```bash
npx citeclaw mcp
```

Implemented methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Exposed tools:

- `cite`
- `cite_pdf`
- `fetch_pdf`
- `openurl_resolve`
- `citoid`
- `crossref`
- `semantic_scholar`
- `semantic_scholar_api`

## Zotero Workflows

Identity and login:

```bash
npx citeclaw zotero whoami --api-key <zotero_api_key>
npx citeclaw zotero login --api-key <zotero_api_key>
```

Core item operations:

```bash
npx citeclaw zotero query "transformer" --limit 20
npx citeclaw zotero cite AB12CD34
npx citeclaw zotero add '{"itemType":"journalArticle","title":"Demo"}'
npx citeclaw zotero update AB12CD34 '{"title":"Updated title"}'
```

Note and maintenance operations:

```bash
npx citeclaw zotero note add AB12CD34 "<p>Key takeaway: ...</p>"
npx citeclaw zotero dedup --limit 300
npx citeclaw zotero enrich --apply
npx citeclaw zotero export md --out ./library.md
```

Safety defaults:

- destructive deletes require confirmation unless `-y`
- `update` and `delete` use version preconditions
- `safe-mode` and `--dry-run` are available for write protection

## Runtime Sync

For npm installs, extra runtime assets can be synced explicitly when you want broader translator coverage or local style rendering:

```bash
npx citeclaw translators sync
npx citeclaw styles sync
```

Notes:

- `translators sync` will clone or update the translator sources with `git` when needed
- `styles sync` will clone or update style repositories with `git` when local CSL styles are unavailable
- normal `cite` commands can run without manually syncing translators first
- `cite-style` will fetch style sources on demand if local styles are missing
- if `git` is not installed, the commands fail with an explicit message

## Bibliography Curation

This repo includes a higher-level bibliography workflow skill:

- [SKILL.md](/mnt/e/botcite/.skills/citeclaw-bibliography-curation/SKILL.md)

Use it when the task is broader than “generate one citation”, for example:

- clean a noisy `.bib`
- expand a survey bibliography to dozens or hundreds of references
- split core references from supplemental references
- build a topic-wise literature map for an appendix

## Development

Useful commands:

```bash
npm run test
npm run test:zotero
npm run coverage
npm run lint
npm run pack:dry-run
```

Current package metadata and entrypoints live in:

- [package.json](/mnt/e/botcite/package.json)
- [scripts/citeclaw.js](/mnt/e/botcite/scripts/citeclaw.js)

## npm Publishing

This repo includes a GitHub Actions workflow for npm publishing:

- workflow file: `.github/workflows/npm-publish.yml`
- trigger: push a tag like `v2.0.8` that matches `package.json`'s `version`
- required secret: add `NPM_TOKEN` in GitHub repository settings with publish permission for the `citeclaw` package

Typical release flow:

```bash
npm version patch
git push origin master --follow-tags
```

The workflow installs dependencies with `npm ci`, checks that the tag matches `package.json`, validates the tarball with `npm pack --dry-run`, and then runs `npm publish --access public --provenance`.

## Notes

- The npm package name and primary CLI are `citeclaw`.
- Primary install/run path is `npx citeclaw ...`.
