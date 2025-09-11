# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run
- Install deps: `npm install`
- Type-check (no emit, run before commits): `npm run typecheck`
- Build TypeScript: `npm run build` (outputs to `dist/`)
- Run built server: `npm start` (executes `node dist/server.js`)
- CLI entry (after build / via npx): `npx miniflux-mcp`

## Environment
Server requires at minimum:
- `MINIFLUX_BASE_URL` (no trailing slash)
Optional:
- `MINIFLUX_TOKEN` (API token sent as `X-Auth-Token` header)
Loads from `.env` via `dotenv`.

## Project Structure (concise)
- `src/server.ts`: Single entry; registers all MCP tools and starts stdio transport.
- `openapi.yaml`: Upstream Miniflux API reference (read-only use here).
- `package.json`: Build scripts and dependency versions (TypeScript only, no test/lint tooling defined).

## Runtime Architecture
Single-process MCP server exposing read-only Miniflux data:
1. Environment parsing (`getEnv`) normalizes base URL, optional token.
2. Lightweight `apiRequest` helper adds auth + JSON accept header; uses global `fetch` (Node >=18).
3. Utility normalization functions implement robust fuzzy matching for category/feed resolution (diacritics stripping, token subset, collapsed alphanumerics).
4. Tools registered on `McpServer` instance; all responses serialized as a single JSON object inside a text content item.
5. No persistent caching; every tool call performs fresh HTTP requests.

## Tool Interaction Protocol (Important Behavioral Contract)
For name/ID inputs, callers must provide numeric IDs directly (no automatic resolution). If a user supplies a name, instruct them to retrieve IDs via `listCategories` or `listFeeds` first. Surface ambiguity by listing available items; do not guess.

## Available Tools (summary semantics)
- `listCategories(counts?)`: Optionally include unread/feed counts.
- `listFeeds()`: Full feed listing.
- `searchFeedsByCategory(category_id, query?)`: Filter feeds within a category by substring.
- `resolveId(query, limit?)`: Fuzzy resolve a name or numeric ID across categories and feeds (always searches both); returns scored matches plus optional exact numeric match metadata.
- `searchEntries(...)`: Global or scoped (category/feed) entry search with pagination & temporal filters; constructs URLSearchParams; returns pagination hints (`has_more`, `next_offset`). Default order: `published_at desc`. Accepts flexible datetime / unix inputs (normalized by `toUnixSeconds`).

## Key Implementation Details
- Matching normalizations: `stripDiacritics` -> lowercase -> either tokenization or collapsed alphanumerics for equality/contains checks.
- Error signaling uses `isError: true` plus JSON object containing `error` field.
- Pagination strategy: derives `has_more` via `offset + returned_count < total`; `next_offset` published for iterative retrieval.
- Date/time parsing: accepts ISO, YYYY-MM-DD, unix (sec/ms) strings or numbers.

## Extensibility Guidance
When adding new tools:
- Keep read-only contract (no write operations to Miniflux).
- Reuse `apiRequest` + `json<T>` helpers.
- Return a single JSON object inside one text content item for consistency.
- Follow existing error pattern (`{ error: CODE }` with `isError: true`).
- For any name-based resolution, reuse existing normalization helpers.

## Versioning & Distribution
`package.json` exports a bin (`miniflux-mcp`). Consumers typically run via `npx miniflux-mcp` with required env vars. Only TypeScript compile step; no test suite presently.

## Important Constraints for Claude
- Do not introduce stateful caching without explicit request.
- Preserve resolver ordering and ambiguity surfacing logic.
- Maintain read-only scope (no POST/PUT/DELETE additions) unless explicitly directed.
- Keep tool outputs compact JSON (avoid extraneous prose).

