import { z } from "zod";

import type { BetSuggestion, StatosApiClient, SuggestionsResponse } from "../api.js";

// ── Markets accepted by the backend's `market_types` filter ──────────────────
// Mirrors what the suggestion engine emits in production.  Keep in sync with
// backend/internal/services/market_analyzers.go.
const MARKETS = [
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
] as const;

const QUALITY_TIERS = ["all", "strong", "elite"] as const;

// Tier → minimum suggested_prob.  Mirrors frontend/src/lib/suggestionConfig.ts.
const QUALITY_MIN_PROB: Record<(typeof QUALITY_TIERS)[number], number> = {
  all: 0,
  strong: 65,
  elite: 85,
};

// ── Input schema ─────────────────────────────────────────────────────────────
// Zod is the runtime validator.  We also export the JSON-Schema (derived via
// `zodToJsonSchema`-style mapping below) so the MCP SDK can advertise it to
// clients.  Schemas stay close to the conversational intent: optional filters,
// sane defaults, no flag soup.
export const listPicksInputSchema = z.object({
  league_id: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Single league ID to filter to. Use list_leagues (when available) for discovery. " +
        "Omit for all leagues visible to the API-key holder.",
    ),
  markets: z
    .array(z.enum(MARKETS))
    .optional()
    .describe(
      "Filter to specific market types. Omit for all. Each market is a separate selection " +
        "type (e.g. '1x2' for match winner, 'over_under' for goal totals).",
    ),
  min_edge_pct: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Minimum edge percentage (claimed_prob × best_odds − 1, ×100). Default 0. " +
        "Picks with no odds attached (best_odds=0) are always kept regardless.",
    ),
  quality: z
    .enum(QUALITY_TIERS)
    .optional()
    .default("all")
    .describe(
      "Quality tier filter: 'all' (no floor), 'strong' (≥65% suggested_prob), " +
        "'elite' (≥85%). Mirrors the website's filter UI.",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .optional()
    .default(50)
    .describe("Maximum picks to return (default 50, max 200)."),
});

export type ListPicksInput = z.infer<typeof listPicksInputSchema>;

// ── Implementation ───────────────────────────────────────────────────────────

export interface ListPicksResult {
  count: number;
  picks: BetSuggestion[];
  filters_applied: {
    league_id?: number;
    markets?: string[];
    min_edge_pct?: number;
    quality: string;
    limit: number;
  };
  notes?: string[];
}

/**
 * `list_picks` — wraps GET /api/v1/suggestions with curated, intent-shaped
 * filters.  Client-side post-filters min_edge_pct and quality because the
 * backend endpoint doesn't accept those params (yet); league + markets are
 * forwarded server-side.
 */
export async function listPicks(
  api: StatosApiClient,
  input: ListPicksInput,
): Promise<ListPicksResult> {
  const parsed = listPicksInputSchema.parse(input);

  const query: Record<string, string | undefined> = {
    league_id: parsed.league_id?.toString(),
    market_types:
      parsed.markets && parsed.markets.length > 0
        ? parsed.markets.join(",")
        : undefined,
  };

  const res = await api.get<SuggestionsResponse>("/api/v1/suggestions", query);
  const all = res.suggestions ?? [];

  const qualityFloor = QUALITY_MIN_PROB[parsed.quality];
  const minEdge = parsed.min_edge_pct ?? 0;

  const filtered = all.filter((p) => {
    if (p.suggested_prob < qualityFloor) return false;
    // edge filter: only apply when the pick HAS odds (and therefore an edge).
    // Picks without odds (best_odds === 0/undefined) carry no edge field; keep them.
    if (minEdge > 0 && typeof p.edge === "number" && p.edge < minEdge) {
      return false;
    }
    return true;
  });

  const limited = filtered.slice(0, parsed.limit);

  const notes: string[] = [];
  if (filtered.length > limited.length) {
    notes.push(
      `Truncated to ${limited.length} picks (${filtered.length} matched filters before limit).`,
    );
  }
  if (all.length === 0) {
    notes.push(
      "No picks returned by the Statos API for this request — could mean no upcoming fixtures, " +
        "the model has nothing above the emission floors, or the API-key holder's plan doesn't include the requested leagues.",
    );
  }

  return {
    count: limited.length,
    picks: limited,
    filters_applied: {
      league_id: parsed.league_id,
      markets: parsed.markets,
      min_edge_pct: parsed.min_edge_pct,
      quality: parsed.quality,
      limit: parsed.limit,
    },
    notes: notes.length > 0 ? notes : undefined,
  };
}
