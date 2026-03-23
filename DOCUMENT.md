# CiteClaw: Architecture and Core Principles

This document explains how `CiteClaw` works internally, with focus on execution flow, module boundaries, and design decisions.

## 1. System Model

`CiteClaw` has two runtime faces:

- CLI orchestrator (`scripts/citeclaw.js`): one-shot commands (`cite`, `cite-pdf`, `fetch-pdf`, `batch`, etc.) and MCP stdio server mode.
- HTTP service (`server.js` + `app.js`): Citoid-compatible API endpoints used by CLI flows.

Both faces share the same core citation pipeline in `lib/`.

## 2. Citation Resolution Pipeline

At a high level, each request follows this chain:

1. Input normalization: classify DOI / URL / arXiv / local PDF and sanitize edge cases.
2. Source acquisition: pull metadata from web pages, APIs, or PDF signal extraction.
3. Translation and enrichment: map raw metadata into Zotero-like item schema.
4. Export formatting: convert normalized item into requested format (`bibtex`, `mediawiki`, CSL output).

Core modules:

- `lib/CitoidService.js`: top-level orchestration and fallback strategy.
- `lib/Scraper.js`: webpage metadata extraction (HTML/metadata translators).
- `lib/Exporter.js`: schema normalization + output mapping.
- `lib/ZoteroService.js`: Zotero translator interaction.
- `lib/CitoidRequest.js`: HTTP request behavior and cookie handling.

## 3. MCP Design

`citeclaw mcp` exposes the same capabilities over JSON-RPC framing (`Content-Length` over stdio).

Implemented MCP methods:

- `initialize`
- `ping`
- `tools/list`
- `tools/call`

Tool handlers are thin adapters that invoke existing CLI internals:

- `cite`
- `cite_pdf`
- `fetch_pdf`
- `openurl_resolve`

This avoids duplicate business logic: MCP and CLI produce consistent behavior.

## 4. Data, Caching, and Runtime State

Runtime state is local and explicit:

- `.local/state`: sync stamps and runtime markers.
- `.local/cache`: response/PDF cache metadata and files.
- `.local/translators`, `.local/styles`: merged translator/style runtime view.

Caching is key-based with TTL (`cache-meta.json`) to reduce repeated network/PDF resolution.

## 5. Vendoring Strategy

The repository vendors required upstream assets under `vendor/` (e.g., Zotero translators, styles).

Principle: user should only need to clone/pull this repository and run commands; no extra third-party repo setup should be required.

## 6. Performance Levers

Main latency sources are network fetches and PDF probing. The CLI exposes tuning knobs via environment variables (timeouts, concurrency, probe size, cache TTL), enabling controlled trade-offs between throughput and completeness.
