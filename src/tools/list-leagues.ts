import { z } from "zod";

import type { StatosApiClient } from "../api.js";

// ── Continents the backend tags leagues with ────────────────────────────────
// Matches services/leagues.go's continent string set. Used as a client-side
// filter; the backend endpoint doesn't accept a query param for it.
const CONTINENTS = [
  "Europe",
  "South America",
  "North America",
  "Africa",
  "Asia",
  "Oceania",
  "International",
] as const;

export const listLeaguesInputSchema = z.object({
  continent: z
    .enum(CONTINENTS)
    .optional()
    .describe("Filter to a single continent. Omit for all leagues visible to the API key."),
  specialized_only: z
    .boolean()
    .optional()
    .describe(
      "If true, return only leagues with is_specialized=true — the curated set that " +
        "the suggestion engine biases toward. Defaults to false (return everything).",
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .default(200)
    .describe("Maximum leagues to return (default 200, max 500)."),
});

export type ListLeaguesInput = z.infer<typeof listLeaguesInputSchema>;

// ── Shape returned by GET /api/v1/leagues ───────────────────────────────────
export interface LeagueRow {
  id: number;
  external_id: string;
  name: string;
  country: string;
  continent: string;
  sport: string;
  is_specialized: boolean;
  specialized_at: string | null;
  logo: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface ListLeaguesResult {
  count: number;
  leagues: LeagueRow[];
  filters_applied: {
    continent?: string;
    specialized_only?: boolean;
    limit: number;
  };
  notes?: string[];
}

/**
 * `list_leagues` — wraps GET /api/v1/leagues with optional client-side
 * continent + specialization filters.  Useful for the AI to discover
 * `league_id` values to feed into list_picks.
 */
export async function listLeagues(
  api: StatosApiClient,
  input: ListLeaguesInput,
): Promise<ListLeaguesResult> {
  const parsed = listLeaguesInputSchema.parse(input);
  const all = await api.get<LeagueRow[]>("/api/v1/leagues");

  let filtered = all;
  if (parsed.continent) {
    filtered = filtered.filter((l) => l.continent === parsed.continent);
  }
  if (parsed.specialized_only) {
    filtered = filtered.filter((l) => l.is_specialized);
  }

  const limited = filtered.slice(0, parsed.limit);

  const notes: string[] = [];
  if (filtered.length > limited.length) {
    notes.push(
      `Truncated to ${limited.length} (${filtered.length} matched filters before limit).`,
    );
  }
  if (all.length === 0) {
    notes.push(
      "Statos returned no leagues — could mean the API-key holder's plan excludes every league group.",
    );
  }

  return {
    count: limited.length,
    leagues: limited,
    filters_applied: {
      continent: parsed.continent,
      specialized_only: parsed.specialized_only,
      limit: parsed.limit,
    },
    notes: notes.length > 0 ? notes : undefined,
  };
}
