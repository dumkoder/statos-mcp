# Changelog

All notable changes to `@statospro/mcp`.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.1] — 2026-05-27

Polish release. Pure metadata + UX; no protocol or behaviour changes.

### Added

- `serverInfo.title = "Statos"` — human-readable display name in MCP
  client tool pickers (was bare `@statospro/mcp` package name before).
- `serverInfo.description` — one-line summary of the server's purpose.
- `serverInfo.websiteUrl = "https://statos.pro"`.
- `serverInfo.icons` — array with `https://statos.pro/min-logo.svg`
  (the same SVG the prod web app uses). Single entry; MCP clients can
  rescale to any picker size.
- `util/format-error.ts` + 5 unit tests: a small formatter that turns
  `ZodError` instances into a `"path: message; path: message"`
  one-liner. Surfaces in MCP `isError` content text. Non-Zod errors
  fall through to `.message`.

### Changed

- Tool input-validation errors render as
  `Tool list_picks failed: limit: Number must be greater than or equal to 1`
  instead of the raw zod-issue-array JSON blob.

## [0.2.0] — 2026-05-27

First publish to npm under the `@statospro` org (the `@statos` org name was
already taken on npmjs.com).

Backend changes shipped in Statos v1.13.0 (deployed to prod 2026-05-27) extend
`BearerAuth` to `/api/v1/leagues` and `/api/v1/auth/me` and add two new
API-key scopes — `read:leagues` and `read:account`. **API keys minted before
2026-05-27 carry only `read:suggestions`; regenerate to use the new tools.**

### Added

- `list_leagues(continent?, specialized_only?, limit?)` — discover league IDs
  to feed into `list_picks`. Filters work client-side; the backend `/leagues`
  endpoint applies the API-key holder's `allowed_league_groups` gate. Requires
  scope `read:leagues`.
- `get_account()` — zero-arg tool returning email, role, subscription status,
  and the **effective role** (trial-elevated while a trial is active —
  mirrors the backend's trial-role logic). Surfaces notes when subscription
  is `past_due`, cancellation is scheduled, or trial is active. Requires
  scope `read:account`.
- 11 new unit tests across the two tools (21 total in v0.2).
- Protocol-level smoke harness at `scripts/smoke.mjs` — exercises the
  initialize handshake + tools/list + each tool with bogus/real key.

### Changed

- npm package name: `@statos/mcp` → `@statospro/mcp` (first npm publish).
- pnpm version pin: 10.26.0 → 11.4.0 (Statos PR #157).
- License: UNLICENSED → MIT.

### Internal

- Backend: `RequireScope(scope)` middleware added; per-route scope enforcement
  replaces the hardcoded `ScopeReadSuggestions` check in `authenticateAPIKey`.
- Default scopes for newly-minted API keys expanded to
  `[read:suggestions, read:leagues, read:account]`.

## [0.1.0] — 2026-05-27

Initial implementation (not published to npm; repo-local only).

### Added

- stdio MCP server using `@modelcontextprotocol/sdk`, TypeScript strict mode.
- `list_picks(league_id?, markets?, min_edge_pct?, quality?, limit?)` — wraps
  `GET /api/v1/suggestions` with curated, intent-shaped filters. Picks
  without odds attached are always kept through the edge filter (mirrors
  backend `filterByEdge` behaviour).
- `get_match_picks(match_id)` — fetches `/suggestions` and filters client-side
  by `match_id`. A backend `?match_id=N` filter is a v0.3 candidate.
- CLI entry (`statos-mcp` bin) with `--api-key` / `--api-base` flags, env-var
  fallbacks, `--help` / `--version`. Stderr-only diagnostics so stdout stays
  reserved for the MCP transport.
- Hand-written JSON Schemas advertised in `tools/list`; runtime validation
  via `zod`.
- 10 unit tests covering filter logic, edge handling with odds-less picks,
  query-param forwarding, empty-response handling, match filtering, and
  input validation.
- README with Claude Desktop + Claude Code setup snippets.

[0.2.0]: https://github.com/dumkoder/statos/releases/tag/v1.13.0
[0.1.0]: https://github.com/dumkoder/statos/releases/tag/v1.11.0
