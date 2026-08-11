# @statospro/mcp

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects
AI assistants — Claude Desktop, Claude Code, claude.ai — to your
[Statos](https://statos.pro) account.

Statos is a football analytics platform: it models match outcomes across ten
markets and prices them against live bookmaker odds. This package wraps the
`api.statos.pro` REST surface in an API-key-authenticated, AI-friendly tool
layer, so an assistant can answer "what does the model like today?" without you
writing a single HTTP call.

```
npx -y @statospro/mcp@latest --api-key statos_sk_live_xxxxxxxx
```

## Tools

**v0.3.0 — full read surface plus admin controls.**

| Tool | Wraps | Required scope |
|---|---|---|
| `list_picks` | `GET /api/v1/suggestions` | `read:suggestions` |
| `get_match_picks` | `GET /api/v1/suggestions` (client-side match filter) | `read:suggestions` |
| `list_leagues` | `GET /api/v1/leagues` | `read:leagues` |
| `get_account` | `GET /api/v1/auth/me` | `read:account` |
| `suppress_market` | `POST /api/v1/admin/market-suppressions` | `admin:market_suppressions` + admin role |
| `list_suppressions` | `GET /api/v1/admin/market-suppressions` | `admin:market_suppressions` + admin role |
| `unsuppress_market` | `DELETE /api/v1/admin/market-suppressions/:id` | `admin:market_suppressions` + admin role |

The four read tools are available to any account. The three **market-suppression**
tools are an operational kill switch — they let an admin stop the engine emitting
a (league × market) combination for a time window without shipping a deploy.
They require an admin-role key carrying the `admin:market_suppressions` scope,
which is not in the default scope set.

> **Upgrading from v0.1?** API keys minted before the v0.2 release carry only
> `read:suggestions`. **Regenerate** your key to pick up `read:leagues` and
> `read:account`, or `list_leagues` and `get_account` will 403.

## Quick start

### 1. Get a Statos API key

Log in at <https://statos.pro/account>, open the **API keys** card, and create a
key. Copy the `statos_sk_live_…` token — **Statos shows it once.**

### 2a. Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "statos": {
      "command": "npx",
      "args": ["-y", "@statospro/mcp@latest"],
      "env": {
        "STATOS_API_KEY": "statos_sk_live_xxxxxxxx"
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear in the tools picker.

### 2b. Claude Code

```bash
claude mcp add statos -- npx -y @statospro/mcp@latest --api-key statos_sk_live_xxxxxxxx
```

### 2c. Test against sandbox first (optional)

```bash
claude mcp add statos-sandbox -- npx -y @statospro/mcp@latest \
  --api-key statos_sk_test_xxxxxxxx \
  --api-base https://api.sandbox.statos.pro
```

## Tool reference

### `list_picks`

List the model's current suggestions, optionally filtered.

| param | type | default | notes |
|---|---|---|---|
| `league_id` | integer | — | Single league. Omit for all visible leagues. |
| `markets` | string[] | — | `1x2`, `over_under`, `btts`, `asian_handicap`, `corners`, `cards`, `draw_no_bet`, `double_chance`, `goal_range`, `team_to_score`. Omit for all. |
| `min_edge_pct` | number | 0 | Suggestions without odds attached are always kept. |
| `quality` | string | `all` | `all` (no floor), `strong` (≥65%), `elite` (≥85%). |
| `limit` | integer | 50 | Max 200. |

Returns an array of `BetSuggestion` objects (match info, market, selection,
`suggested_prob`, `best_odds`, edge, confidence) plus filter metadata and any
truncation notes.

### `get_match_picks`

Every suggestion for a single match — for "what does the model think about
match X?" queries.

| param | type | notes |
|---|---|---|
| `match_id` | integer | The `match_id` field from a `list_picks` response. |

### `list_leagues`

Discover league IDs to filter `list_picks` against. Returns the leagues the
key holder's plan can see.

| param | type | default | notes |
|---|---|---|---|
| `continent` | string | — | `Europe`, `South America`, `North America`, `Africa`, `Asia`, `Oceania`, `International`. Omit for all. |
| `specialized_only` | boolean | `false` | Only `is_specialized=true` leagues (the curated set the engine biases toward). |
| `limit` | integer | 200 | Max 500. |

### `get_account`

Read-only account info: email, role, subscription status, and effective role
(trial-elevated while a trial is active). Useful for "what plan am I on" and for
working out which leagues are visible.

No input. Returns `{ account, effective_role, notes? }`.

### `suppress_market` / `list_suppressions` / `unsuppress_market`

Admin-only. `suppress_market` takes `league_id` (0 = all leagues), `market`, and
`duration_hours`; the others take nothing and an `id` respectively. Requires
backend ≥ v1.16.

## Configuration

| Env var | CLI flag | Default | Notes |
|---|---|---|---|
| `STATOS_API_KEY` | `--api-key <key>` | — | **Required.** |
| `STATOS_API_BASE` | `--api-base <url>` | `https://api.statos.pro` | Point at `https://api.sandbox.statos.pro` for sandbox. |

## Troubleshooting

- **`401: invalid or revoked API key`** — the key was deleted in the Statos UI,
  or the token was truncated on copy. Regenerate at `/account → API keys`.
- **`401: missing or malformed Authorization header`** — the env var or
  `--api-key` flag isn't reaching the server process. Restart your MCP client
  after editing config files.
- **`403` on `list_leagues` / `get_account`** — your key predates v0.2 and lacks
  the scopes. Regenerate it.
- **No picks for any filter** — either a quiet day for the model, or your plan's
  league entitlements exclude what you asked for. Try `list_picks` with no
  filters first.

## Versioning

The package version is independent of the Statos API version. The server sends
`User-Agent: @statospro/mcp/<version>` so backend logs can correlate. Breaking
changes to the `/suggestions` schema trigger a major bump; additive changes
(new fields) are minor. See [CHANGELOG.md](./CHANGELOG.md).

## Roadmap

- ~~v0.2 — `list_leagues` + `get_account`~~ ✓ shipped
- ~~v0.3 — market-suppression tools~~ ✓ shipped
- **v0.4** — backend `match_id` filter on `/suggestions`, so `get_match_picks`
  stops fetching and filtering client-side
- **v0.x** — friendlier zod-error rendering (currently the raw issue array —
  readable, but verbose)
- **v1.0** — remote SSE/HTTP transport for one-click connect, no `npx` step

## Requirements

Node.js ≥ 20. A Statos account with an API key.

## License

MIT — see [LICENSE](./LICENSE).
