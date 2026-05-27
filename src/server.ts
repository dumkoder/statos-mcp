import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { StatosApiClient } from "./api.js";
import { getAccount, getAccountInputSchema } from "./tools/get-account.js";
import {
  getMatchPicks,
  getMatchPicksInputSchema,
} from "./tools/get-match-picks.js";
import { listLeagues, listLeaguesInputSchema } from "./tools/list-leagues.js";
import { listPicks, listPicksInputSchema } from "./tools/list-picks.js";

const PACKAGE_VERSION = "0.2.0";

// ── Tool JSON-Schemas (advertised in tools/list) ─────────────────────────────
// Hand-written rather than zod-derived to (a) avoid an extra dependency and
// (b) keep tight control over the MCP wire format.  Runtime validation still
// happens via the zod schemas in each tool module — these objects are
// just for the AI client's discovery + arg-checking pass.

const MARKETS_ENUM = [
  "1x2",
  "over_under",
  "btts",
  "asian_handicap",
  "corners",
  "cards",
  "draw_no_bet",
  "double_chance",
  "goal_range",
  "team_to_score",
];

const listPicksJsonSchema = {
  type: "object",
  properties: {
    league_id: {
      type: "integer",
      minimum: 1,
      description:
        "Single league ID to filter to. Omit for all leagues visible to the API-key holder.",
    },
    markets: {
      type: "array",
      items: { type: "string", enum: MARKETS_ENUM },
      description:
        "Filter to specific market types. Omit for all. '1x2'=match winner, " +
        "'over_under'=goal totals, 'btts'=both teams to score, etc.",
    },
    min_edge_pct: {
      type: "number",
      minimum: 0,
      description:
        "Minimum edge percentage. Default 0. Picks without odds attached are always kept.",
    },
    quality: {
      type: "string",
      enum: ["all", "strong", "elite"],
      default: "all",
      description:
        "Quality tier: 'all'=no floor, 'strong'=≥65% suggested_prob, 'elite'=≥85%.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 200,
      default: 50,
      description: "Maximum picks to return (default 50, max 200).",
    },
  },
  additionalProperties: false,
} as const;

const getMatchPicksJsonSchema = {
  type: "object",
  properties: {
    match_id: {
      type: "integer",
      minimum: 1,
      description:
        "Match ID (from a previous list_picks call's `match_id` field) to fetch picks for.",
    },
  },
  required: ["match_id"],
  additionalProperties: false,
} as const;

const CONTINENTS_ENUM = [
  "Europe",
  "South America",
  "North America",
  "Africa",
  "Asia",
  "Oceania",
  "International",
];

const listLeaguesJsonSchema = {
  type: "object",
  properties: {
    continent: {
      type: "string",
      enum: CONTINENTS_ENUM,
      description: "Filter to one continent. Omit for all leagues the API key can see.",
    },
    specialized_only: {
      type: "boolean",
      description:
        "If true, return only is_specialized=true leagues — the curated set the suggestion engine biases toward.",
    },
    limit: {
      type: "integer",
      minimum: 1,
      maximum: 500,
      default: 200,
      description: "Maximum leagues to return (default 200, max 500).",
    },
  },
  additionalProperties: false,
} as const;

const getAccountJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

// ── Server factory ───────────────────────────────────────────────────────────

export interface ServerConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Create + wire the MCP server.  Returns the Server instance so callers can
 * connect a transport (stdio in the CLI; in-memory in tests).
 */
export function createServer(cfg: ServerConfig): Server {
  const api = new StatosApiClient({
    apiKey: cfg.apiKey,
    baseUrl: cfg.baseUrl,
    userAgent: `@statos/mcp/${PACKAGE_VERSION}`,
  });

  const server = new Server(
    { name: "@statos/mcp", version: PACKAGE_VERSION },
    { capabilities: { tools: {} } },
  );

  // tools/list — advertise both tools to the client
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "list_picks",
        description:
          "List Statos's current betting suggestions, optionally filtered by league, " +
          "market type, minimum edge, or quality tier. Each pick carries the model's " +
          "claimed probability, best available odds (where attached), implied edge, and " +
          "a confidence label (low/medium/high). Picks are computed live from upcoming " +
          "fixtures; volumes vary by day. Use this for 'what does Statos suggest today?' " +
          "type queries.",
        inputSchema: listPicksJsonSchema,
      },
      {
        name: "get_match_picks",
        description:
          "Fetch every suggestion the Statos engine has emitted for a single match. " +
          "Useful for per-match analysis: 'what does Statos think about match X across " +
          "every market?'. Returns the same BetSuggestion shape as list_picks but scoped " +
          "to one match.",
        inputSchema: getMatchPicksJsonSchema,
      },
      {
        name: "list_leagues",
        description:
          "List the soccer leagues the Statos engine tracks (filtered to what the " +
          "API-key holder's plan permits). Each league carries an `id` you can pass " +
          "to list_picks for filtering, plus name, country, continent, and an " +
          "`is_specialized` flag indicating leagues the engine biases toward. Useful " +
          "for discovery: 'which European leagues can I see?' or 'show me the " +
          "specialized leagues only'.",
        inputSchema: listLeaguesJsonSchema,
      },
      {
        name: "get_account",
        description:
          "Return the API-key holder's account info: email, role (silver/gold/" +
          "diamond/admin), subscription status, and the effective role (trial-elevated " +
          "while a trial is active). Useful for an AI assistant to explain what plan " +
          "the user is on and which leagues they have access to. Read-only.",
        inputSchema: getAccountJsonSchema,
      },
    ],
  }));

  // tools/call — dispatch by name, runtime-validate args via zod, return JSON
  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};

    try {
      switch (name) {
        case "list_picks": {
          const result = await listPicks(api, listPicksInputSchema.parse(args));
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "get_match_picks": {
          const result = await getMatchPicks(
            api,
            getMatchPicksInputSchema.parse(args),
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "list_leagues": {
          const result = await listLeagues(
            api,
            listLeaguesInputSchema.parse(args),
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        case "get_account": {
          const result = await getAccount(
            api,
            getAccountInputSchema.parse(args),
          );
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          };
        }
        default:
          return {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
          };
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `Tool ${name} failed: ${msg}` }],
      };
    }
  });

  return server;
}

/**
 * Start an MCP server speaking stdio.  Returns when the transport closes
 * (i.e. the client disconnects).
 */
export async function runStdio(cfg: ServerConfig): Promise<void> {
  const server = createServer(cfg);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
