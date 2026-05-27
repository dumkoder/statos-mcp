import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StatosApiClient, type SuggestionsResponse } from "../api.js";
import { listPicks } from "./list-picks.js";

// ── Test helpers ─────────────────────────────────────────────────────────────

function mockApi(response: SuggestionsResponse): StatosApiClient {
  const client = new StatosApiClient({
    apiKey: "statos_sk_test_fake",
    baseUrl: "http://test.invalid",
    userAgent: "test/1",
  });
  // Override `get` directly — we don't need a full fetch mock for unit-level
  // validation of the filter/limit/edge logic.
  (client as unknown as { get: () => Promise<SuggestionsResponse> }).get =
    async () => response;
  return client;
}

function pick(
  overrides: Partial<SuggestionsResponse["suggestions"] extends (infer T)[] | null ? T : never> = {},
) {
  return {
    match_id: 1,
    match_date: "2026-06-01T19:00:00Z",
    home_team: "Home",
    away_team: "Away",
    league_id: 39,
    league_name: "Premier League",
    market_type: "1x2",
    selection: "home",
    suggested_prob: 70,
    best_odds: 1.8,
    edge: 12,
    confidence: "medium",
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("listPicks", () => {
  it("returns all picks when no filters provided", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [pick(), pick({ match_id: 2 })],
      count: 2,
    });
    const result = await listPicks(api, {} as never);
    expect(result.count).toBe(2);
    expect(result.picks.map((p) => p.match_id)).toEqual([1, 2]);
  });

  it("filters by quality tier (strong = ≥65%)", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [
        pick({ match_id: 1, suggested_prob: 60 }),
        pick({ match_id: 2, suggested_prob: 70 }),
        pick({ match_id: 3, suggested_prob: 85 }),
      ],
      count: 3,
    });
    const result = await listPicks(api, { quality: "strong" } as never);
    expect(result.picks.map((p) => p.match_id)).toEqual([2, 3]);
  });

  it("filters by quality tier (elite = ≥85%)", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [
        pick({ match_id: 1, suggested_prob: 70 }),
        pick({ match_id: 2, suggested_prob: 85 }),
        pick({ match_id: 3, suggested_prob: 90 }),
      ],
      count: 3,
    });
    const result = await listPicks(api, { quality: "elite" } as never);
    expect(result.picks.map((p) => p.match_id)).toEqual([2, 3]);
  });

  it("filters by min_edge_pct, keeping picks without odds", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: [
        pick({ match_id: 1, edge: 2.0 }), // below 5% — drop
        pick({ match_id: 2, edge: 8.0 }), // keep
        pick({ match_id: 3, edge: undefined, best_odds: undefined }), // no odds — always keep
      ],
      count: 3,
    });
    const result = await listPicks(api, { min_edge_pct: 5 } as never);
    expect(result.picks.map((p) => p.match_id)).toEqual([2, 3]);
  });

  it("respects limit + reports truncation note", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: Array.from({ length: 10 }, (_, i) => pick({ match_id: i + 1 })),
      count: 10,
    });
    const result = await listPicks(api, { limit: 3 } as never);
    expect(result.count).toBe(3);
    expect(result.notes?.[0]).toMatch(/Truncated to 3 picks/);
  });

  it("forwards markets filter to the API as comma-separated query", async () => {
    let capturedQuery: Record<string, string | undefined> | undefined;
    const api = new StatosApiClient({
      apiKey: "statos_sk_test_fake",
      baseUrl: "http://test.invalid",
      userAgent: "test/1",
    });
    (api as unknown as { get: typeof api.get }).get = (async (
      _path: string,
      query?: Record<string, string | undefined>,
    ) => {
      capturedQuery = query;
      return {
        league_id: 0,
        league_name: "All Leagues",
        suggestions: [],
        count: 0,
      } satisfies SuggestionsResponse;
    }) as typeof api.get;

    await listPicks(api, {
      markets: ["1x2", "over_under"],
      league_id: 39,
    } as never);

    expect(capturedQuery?.market_types).toBe("1x2,over_under");
    expect(capturedQuery?.league_id).toBe("39");
  });

  it("emits a friendly note when the API returns no picks", async () => {
    const api = mockApi({
      league_id: 0,
      league_name: "All Leagues",
      suggestions: null,
      count: 0,
    });
    const result = await listPicks(api, {} as never);
    expect(result.count).toBe(0);
    expect(result.notes?.[0]).toMatch(/No picks returned/);
  });
});
