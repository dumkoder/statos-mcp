import { z } from "zod";

import type { BetSuggestion, StatosApiClient, SuggestionsResponse } from "../api.js";

// ── Input schema ─────────────────────────────────────────────────────────────
export const getMatchPicksInputSchema = z.object({
  match_id: z
    .number()
    .int()
    .positive()
    .describe(
      "Match ID (from a previous list_picks call's `match_id` field) to fetch all picks for.",
    ),
});

export type GetMatchPicksInput = z.infer<typeof getMatchPicksInputSchema>;

export interface GetMatchPicksResult {
  match_id: number;
  count: number;
  picks: BetSuggestion[];
  notes?: string[];
}

/**
 * `get_match_picks` — return every pick the engine has emitted for a single
 * match.  Useful for an AI assistant to write a per-match analysis ("what
 * does Statos think about Arsenal vs Chelsea?").
 *
 * Backend has no match-id filter on /suggestions yet — we fetch the full
 * upcoming suggestions list and filter client-side.  Inefficient but
 * functionally correct; a follow-up backend PR adding a `match_id` query
 * parameter would let this become a direct fetch.
 */
export async function getMatchPicks(
  api: StatosApiClient,
  input: GetMatchPicksInput,
): Promise<GetMatchPicksResult> {
  const parsed = getMatchPicksInputSchema.parse(input);

  const res = await api.get<SuggestionsResponse>("/api/v1/suggestions");
  const all = res.suggestions ?? [];
  const picks = all.filter((p) => p.match_id === parsed.match_id);

  const notes: string[] = [];
  if (picks.length === 0) {
    notes.push(
      `No picks found for match_id=${parsed.match_id}. The match may be outside the upcoming-fixtures window, ` +
        `its league may not be visible to this API key, or the engine produced no emissions for that fixture.`,
    );
  }

  return {
    match_id: parsed.match_id,
    count: picks.length,
    picks,
    notes: notes.length > 0 ? notes : undefined,
  };
}
