---
name: citeclaw-bibliography-curation
version: 1.0.1
description: Use CiteClaw to build, clean, expand, and verify bibliographies for surveys, papers, and literature reviews. Trigger this whenever the user asks to collect references, grow a bibliography to dozens or hundreds of papers, clean BibTeX, map literature by topic, turn arXiv/DOI/URLs into citations, or create a survey-style literature map. Use this especially for research writing workflows where CiteClaw alone is not enough and you need a robust process that combines CiteClaw, web search, and manual verification.
---

# CiteClaw Bibliography Curation

Use this skill when the user is not just asking for a single citation, but for a real literature workflow:

- expanding a bibliography
- cleaning noisy BibTeX
- curating references for a survey
- building a topic-wise literature map
- finding representative papers for a theme
- reconciling arXiv IDs, DOIs, anthology pages, and URLs

This skill complements `citeclaw-cli`. `citeclaw-cli` gives you commands. This skill gives you the workflow and decision rules.

## Primary CiteClaw scope

Use CiteClaw for these command families:

- `citeclaw citoid` / `citeclaw citation`
- `citeclaw crossref`
- `citeclaw semantic-scholar`
- `citeclaw cite`, `cite-pdf`, `fetch-pdf`, `openurl-resolve`, `batch`

## Fast commands

Use these as canonical examples:

```bash
npx citeclaw citoid formats
npx citeclaw citoid bibtex "10.1021/acsomega.2c05310"
npx citeclaw crossref "10.1021/acsomega.2c05310" --json
npx citeclaw semantic-scholar "10.1021/acsomega.2c05310" --json
```

## Advanced Semantic Scholar

```bash
npx citeclaw semantic-scholar api /paper/search --params '{"query":"transformer","limit":3}'
npx citeclaw semantic-scholar paper-search "transformer attention" --limit 5 --fields "title,year,authors,url"
```

## CiteClaw guardrails

- Prefer `--json` for machine-consumable output.
- Respect API limits; use `--s2-api-key` for Semantic Scholar to avoid 429.
- For PDF and batch flows, keep `--profile` and logs for diagnosis.

## What this skill is for

This skill is optimized for the messy reality of research writing:

- some references are clean DOI/arXiv inputs
- some are only known by title or GitHub list entries
- some APIs rate-limit
- some metadata sources return the wrong paper
- a paper may need a small main bibliography and a large supplemental bibliography

The goal is not merely to produce BibTeX. The goal is to produce a bibliography that is:

- accurate enough to compile cleanly
- structured enough to support a survey narrative
- large enough to cover the field without flooding the main text

## Default workflow

Follow this sequence unless there is a strong reason not to.

### 1. Separate the task type first

Classify the user request into one of these modes:

- `single-citation`: one or a few citations, high precision
- `main-bibliography`: the core papers that will be cited in the main text
- `supplemental-bibliography`: broad coverage, often 50-200+ entries
- `literature-map`: references grouped by topic, benchmark, or method family

Use different standards for each mode:

- `main-bibliography`: prioritize precision and canonical papers
- `supplemental-bibliography`: prioritize breadth, deduplication, and grouping

### 2. Start with canonical identifiers

Prefer, in order:

1. DOI
2. arXiv abs URL
3. ACL/EMNLP/NAACL anthology URL
4. official project or official benchmark page
5. title search only as fallback

If the user gives a vague title or a list from a GitHub awesome repo, do not trust the list blindly. Resolve each candidate to a canonical identifier first.

### 3. Use CiteClaw where it is strongest

Use CiteClaw first for:

- DOI -> BibTeX
- arXiv -> BibTeX
- anthology URL -> BibTeX
- quick Crossref lookups
- quick Semantic Scholar lookups when the API is responsive

Typical commands:

```bash
npx citeclaw citoid bibtex "https://arxiv.org/abs/2305.19860"
npx citeclaw citoid bibtex "10.1145/3589334.3648158"
npx citeclaw citoid bibtex "https://aclanthology.org/2023.emnlp-main.398/"
npx citeclaw crossref "conversational recommender systems survey" --json
```

Use the npm-hosted `npx citeclaw ...` form above as the default documented interface. Only switch to a local checkout if you explicitly need to inspect or patch CiteClaw itself.

## Runtime sync

Normal citation commands can run directly. Use explicit sync commands when you want broader translator coverage or local CSL rendering:

```bash
npx citeclaw translators sync
npx citeclaw styles sync
```

Use `translators sync` to pull additional official/community translators.
Use `styles sync` when you need local `cite-style` rendering or a larger CSL style set.

## When CiteClaw is not enough

Do not force everything through CiteClaw. Switch methods when needed.

### Use web search when:

- title-only search through CiteClaw is unstable
- Semantic Scholar is rate-limited
- Crossref returns books, theses, or irrelevant near-matches
- you need recent official platform or regulator documents

### Use arXiv page metadata when:

- arXiv API resolution is flaky
- curated lists only provide arXiv links
- you need a large batch of reliable title/author/year extraction

Reliable fallback pattern:

1. scrape or collect `https://arxiv.org/abs/<id>`
2. read `citation_title`, `citation_author`, and `citation_date` meta tags
3. generate `@misc` entries from these fields

This is often more robust for bulk survey expansion than trying to title-search APIs under rate limits.

### Use curated lists strategically

Curated GitHub lists are useful for recall, not for truth.

Use them to:

- discover candidate arXiv IDs
- identify subtopics and communities
- bootstrap supplemental bibliographies

Do not use them as final metadata sources. Always resolve entries to canonical identifiers and regenerate BibTeX.

## Main bibliography vs supplemental bibliography

For surveys and broad literature reviews, use two layers.

### Main bibliography

Keep this small and argument-driven.

Include:

- canonical papers
- surveys
- benchmarks
- representative methods
- official policy/platform documents directly used in the main argument

In the main text, cite selectively and synthetically. A paragraph should usually cite:

- one canonical paper
- one contrasting or newer paper
- one benchmark or survey if needed

Avoid long undifferentiated citation dumps in the core narrative.

### Supplemental bibliography

Put broad coverage here.

Use it for:

- topic-wise expansion to 50-200+ entries
- appendix literature maps
- “additional literature” sections grouped by theme

Typical split:

- `references.bib`: core papers used in main argument
- `references_supplement.bib`: broad coverage

This lets the paper look like a thoughtful survey instead of a citation dump while still achieving field coverage.

## Literature-map workflow

When the user wants a survey or broad coverage, group papers by research function, not by chronology alone.

Useful groupings:

- surveys
- task-defining papers
- benchmarks
- method families
- safety / fairness / governance
- domain-specific applications

For each group:

1. gather candidate IDs
2. deduplicate
3. generate BibTeX
4. write a short synthesis sentence explaining what that group contributes

The synthesis is as important as the references. The bibliography should support an argument, not replace one.

## Deduplication rules

Before adding anything to the final bibliography:

- deduplicate by DOI if available
- otherwise deduplicate by arXiv ID
- otherwise deduplicate by normalized title

If the same work appears as arXiv and conference:

- use the venue version when the paper is clearly published and metadata is clean
- otherwise use arXiv for speed and consistency

Be consistent within one paper. Do not mix random venue versions and arXiv preprints unless there is a clear reason.

## Citation quality rules

Treat main-text citations as claims with burden of proof.

- For technical claims: prefer papers, benchmarks, or official docs
- For policy claims: prefer regulator or government pages
- For platform/product claims: prefer official company announcements
- For public discourse or panic framing: it is acceptable to use major media, but only as background, not as technical evidence

Do not let media reporting become the backbone of a scientific argument.

## Large-scale expansion pattern

When the user asks for something like “expand this to ~200 references”:

1. keep the main bibliography stable
2. identify 3-6 high-yield curated sources
3. extract candidate arXiv IDs or DOIs
4. bulk-resolve metadata
5. create a supplemental `.bib`
6. generate an appendix literature map grouped by topic
7. compile and verify no missing citation keys

This is usually better than trying to inflate the main bibliography.

## Verification checklist

Before finishing, always check:

- all cited keys exist
- there are no unresolved citations in the LaTeX log
- core main-text claims are backed by the right type of source
- bibliography growth has not turned main-text paragraphs into citation dumps
- appendix or supplemental grouping is coherent

Useful checks:

```bash
latexmk -pdf -interaction=nonstopmode main.tex
rg -n "undefined citations|undefined on input line|I didn't find a database entry" main.log main.blg
```

## Output patterns

If the user wants a bibliography build, prefer outputs like:

- `references.bib`
- `references_supplement.bib`
- `sections/appendix_litmap.tex`

If the user wants a report rather than files, summarize:

- what sources were used
- how many entries were added
- how they were grouped
- what still needs manual review

## Guardrails

- Do not trust one API result without sanity-checking the title.
- Do not treat a curated list entry as verified metadata.
- Do not let supplemental coverage dilute the main-text argument.
- Do not use weak title-only matches when an official or canonical identifier can still be found.
- Do not keep hammering rate-limited APIs; switch tools.

## Example use cases

**Example 1**
User: “Use CiteClaw to clean this BibTeX and fix the broken arXiv references.”
Action: use CiteClaw first, repair bad identifiers, regenerate clean entries, and verify compile.

**Example 2**
User: “Expand this survey bibliography to around 200 papers.”
Action: keep core references stable, build a supplemental bibliography from curated lists plus canonical metadata, and generate an appendix literature map.

**Example 3**
User: “Find representative work on agentic recommendation, shopping benchmarks, and agent safety.”
Action: build grouped paper pools by theme, select representative papers for the main text, and place the long tail into supplemental references.
