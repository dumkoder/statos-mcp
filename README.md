# @statos/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects
AI assistants — Claude Desktop, Claude Code, claude.ai — to your
[Statos](https://statos.pro) account's betting suggestions.

Wraps `api.statos.pro` with an API-key-authenticated, AI-friendly tool surface.
Zero new server-side code: rides on the API-key feature shipped in Statos
v1.11.0.

## Status

**v0.1.0 — early access.** Two of the planned four tools are live (those that
the existing `BearerAuth` middleware on `/api/v1/suggestions` supports). The
other two (`list_leagues`, `get_account`) need a small backend `BearerAuth`
extension on the `/leagues` and `/auth/me` endpoints; they'll land in a
follow-up release. See [Roadmap](#roadmap).

## Quick start

### 1. Get a Statos API key

Log in at <https://statos.pro/account>, open the **API keys** card, and create
a key with the `read:suggestions` scope. Copy the `statos_sk_live_…` token —
**Statos shows it once.**

### 2a. Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "statos": {
      "command": "npx",
      "args": ["-y", "@statos/mcp@latest"],
      "env": {
        "STATOS_API_KEY": "statos_sk_live_xxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. The new tools appear in the tools picker.

### 2b. Claude Code

```bash
claude mcp add statos -- npx -y @statos/mcp@latest --api-key statos_sk_live_xxxxxxxx
```

### 2c. Test against sandbox first (optional)

```bash
claude mcp add statos-sandbox -- npx -y @statos/mcp@latest \
  --api-key statos_sk_test_xxxxxxxx \
  --api-base https://api.sandbox.statos.pro
```

## Tools

### `list_picks`

List Statos's current betting suggestions, optionally filtered.

| param | type | default | notes |
|---|---|---|---|
| `league_id` | integer | — | Single league. Omit for all visible leagues. |
| `markets` | string[] | — | `1x2`, `over_under`, `btts`, `asian_handicap`, `corners`, `cards`, `draw_no_bet`, `double_chance`, `goal_range`, `team_to_score`. Omit for all. |
| `min_edge_pct` | number | 0 | Picks without odds attached are always kept. |
| `quality` | string | `all` | `all` (no floor), `strong` (≥65%), `elite` (≥85%). |
| `limit` | integer | 50 | Max 200. |

Returns an array of `BetSuggestion` objects (match info, market, selection,
suggested_prob, best_odds, edge, confidence) plus filter metadata and any
truncation notes.

### `get_match_picks`

Fetch every pick for a single match — useful for "what does Statos think about
match X?" queries.

| param | type | notes |
|---|---|---|
| `match_id` | integer | The `match_id` field from a `list_picks` response. |

## Configuration

| Env var | CLI flag | Default | Notes |
|---|---|---|---|
| `STATOS_API_KEY` | `--api-key <key>` | — | **Required.** |
| `STATOS_API_BASE` | `--api-base <url>` | `https://api.statos.pro` | Use `https://api.sandbox.statos.pro` to point at sandbox. |

## Troubleshooting

- **`401: invalid or revoked API key`** — the key was deleted in the Statos
  UI, or you copied a truncated token. Regenerate at `/account → API keys`.
- **`401: missing or malformed Authorization header`** — the env var or
  `--api-key` flag isn't reaching the server process. Restart your MCP
  client after editing config files.
- **No picks returned for any filter** — could be a quiet day for the model,
  or your plan's `allowed_league_groups` excludes the leagues you asked for.
  Try `list_picks` with no filters first.

## Versioning

The npm package version is independent of the Statos API version. The server
sends `User-Agent: @statos/mcp/<version>` so backend logs can correlate.
Breaking changes to Statos's `/suggestions` schema will trigger a major
version bump; additive changes (new fields) are minor.

## Roadmap

- **v0.2** — `list_leagues` tool (needs backend `BearerAuth` on `/leagues`)
- **v0.2** — `get_account` tool (needs backend `BearerAuth` on `/auth/me`
  or a new `/api/v1/account/profile` endpoint)
- **v0.3** — backend `match_id` filter on `/suggestions` so `get_match_picks`
  doesn't have to fetch+filter client-side
- **v1.0** — remote SSE/HTTP transport for one-click connect (no
  `npx`/install step)

## Local development

```bash
pnpm install
pnpm test
pnpm build
pnpm dev --api-key statos_sk_test_xxxxxxxx
```

To smoke against a running Claude Code locally:

```bash
pnpm build
claude mcp add statos-dev -- node "$PWD/dist/cli.js" --api-key statos_sk_test_xxxxxxxx
```

## License

UNLICENSED — internal Statos package. Distribution rights TBD before npm
publish.
