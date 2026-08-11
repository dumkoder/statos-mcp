import { z } from "zod";

import type { StatosApiClient } from "../api.js";

// Operational market kill switch. These tools wrap the admin
// market-suppressions endpoints. They require an API key with both the
// `admin:market_suppressions` scope AND an admin-role holder — a read-only key
// cannot disable emission. Use sparingly: suppression stops Statos emitting a
// (league × market) until it expires or is cancelled.

// ── Shared row shape (mirrors services.MarketSuppression) ────────────────────
export interface MarketSuppressionRow {
  id: number;
  league_id: number; // 0 = all leagues
  market_type: string;
  reason: string;
  suppressed_by: number;
  expires_at: string;
  created_at: string;
  [key: string]: unknown;
}

// ── suppress_market ──────────────────────────────────────────────────────────
export const suppressMarketInputSchema = z.object({
  market_type: z
    .string()
    .min(1)
    .describe(
      "Market to suppress, e.g. 'cards', 'corners', 'over_under', '1x2', " +
        "'asian_handicap', 'draw_no_bet', 'double_chance', 'team_to_score'.",
    ),
  league_id: z
    .number()
    .int()
    .min(0)
    .optional()
    .default(0)
    .describe(
      "League to suppress the market in. 0 (default) is a WILDCARD = all leagues. " +
        "Use a specific league_id (e.g. the World Cup league) to scope it.",
    ),
  hours: z
    .number()
    .int()
    .min(1)
    .max(720)
    .optional()
    .default(24)
    .describe("How long the suppression stays active, in hours (default 24, max 720)."),
  reason: z
    .string()
    .optional()
    .default("")
    .describe("Free-text rationale, e.g. 'cards 30% below claimed hit rate on n=18'."),
});

export type SuppressMarketInput = z.infer<typeof suppressMarketInputSchema>;

/** `suppress_market` — POST /api/v1/admin/market-suppressions. */
export async function suppressMarket(
  api: StatosApiClient,
  input: SuppressMarketInput,
): Promise<{ suppression: MarketSuppressionRow; note: string }> {
  const parsed = suppressMarketInputSchema.parse(input);
  const row = await api.post<MarketSuppressionRow>("/api/v1/admin/market-suppressions", {
    league_id: parsed.league_id,
    market_type: parsed.market_type,
    hours: parsed.hours,
    reason: parsed.reason,
  });
  const scope = parsed.league_id === 0 ? "ALL leagues" : `league ${parsed.league_id}`;
  return {
    suppression: row,
    note: `Suppressed ${parsed.market_type} for ${scope} until ${row.expires_at}. Emission stops within ~60s (cache TTL). Cancel early with unsuppress_market(${row.id}).`,
  };
}

// ── list_suppressions ────────────────────────────────────────────────────────
export const listSuppressionsInputSchema = z.object({});
export type ListSuppressionsInput = z.infer<typeof listSuppressionsInputSchema>;

/** `list_suppressions` — GET /api/v1/admin/market-suppressions (active only). */
export async function listSuppressions(
  api: StatosApiClient,
  _input: ListSuppressionsInput,
): Promise<{ count: number; suppressions: MarketSuppressionRow[]; notes?: string[] }> {
  const res = await api.get<{ suppressions: MarketSuppressionRow[]; count: number }>(
    "/api/v1/admin/market-suppressions",
  );
  return {
    count: res.count,
    suppressions: res.suppressions,
    notes: res.count === 0 ? ["No active market suppressions — the engine is emitting all markets."] : undefined,
  };
}

// ── unsuppress_market ────────────────────────────────────────────────────────
export const unsuppressMarketInputSchema = z.object({
  id: z.number().int().min(1).describe("The suppression id to cancel (from suppress_market or list_suppressions)."),
});
export type UnsuppressMarketInput = z.infer<typeof unsuppressMarketInputSchema>;

/** `unsuppress_market` — DELETE /api/v1/admin/market-suppressions/:id. */
export async function unsuppressMarket(
  api: StatosApiClient,
  input: UnsuppressMarketInput,
): Promise<{ deleted: number; note: string }> {
  const parsed = unsuppressMarketInputSchema.parse(input);
  const res = await api.delete<{ deleted: number }>(
    `/api/v1/admin/market-suppressions/${parsed.id}`,
  );
  return {
    deleted: res.deleted,
    note: `Suppression ${res.deleted} cancelled. Emission resumes within ~60s (cache TTL).`,
  };
}
