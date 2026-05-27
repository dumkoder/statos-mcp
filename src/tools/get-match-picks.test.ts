import { describe, expect, it } from "vitest";

import { StatosApiClient, type SuggestionsResponse } from "../api.js";
import { getMatchPicks } from "./get-match-picks.js";

function mockApi(response: SuggestionsResponse): StatosApiClient {
  const client = new StatosApiClient({
    apiKey: "statos_sk_test_fake",
    baseUrl: "http://test.invalid",
    userAgent: "test/1",
  });
  (client as unknown as { get: () => Promise<SuggestionsResponse> }).get =
    async () => response;
  return client;
}

const pick = (matchID: number, market = "1x2") => ({
  match_id: matchID,
  match_date: "2026-06-01T19:00:00Z",
  home_team: "Home",
  away_team: "Away",
  league_id: 39,
  league_name: "Premier League",
  market_type: market,
  selection: "home",
  suggested_prob: 65,
  confidence: "medium",
});

describe("getMatchPicks", () => {
  it("returns only picks matching the requested match_id", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [
        pick(1, "1x2"),
        pick(1, "over_under"),
        pick(2, "1x2"),
      ],
      count: 3,
    });
    const result = await getMatchPicks(api, { match_id: 1 });
    expect(result.count).toBe(2);
    expect(result.picks.every((p) => p.match_id === 1)).toBe(true);
  });

  it("returns count 0 + an explanatory note when no picks for the match", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [pick(99)],
      count: 1,
    });
    const result = await getMatchPicks(api, { match_id: 1 });
    expect(result.count).toBe(0);
    expect(result.notes?.[0]).toMatch(/No picks found/);
  });

  it("rejects invalid match_id at the zod boundary", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [],
      count: 0,
    });
    await expect(
      getMatchPicks(api, { match_id: -1 } as never),
    ).rejects.toThrow();
  });
});
