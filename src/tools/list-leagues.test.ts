import { describe, expect, it } from "vitest";

import { StatosApiClient } from "../api.js";
import { listLeagues, type LeagueRow } from "./list-leagues.js";

function mockApi(leagues: LeagueRow[]): StatosApiClient {
  const client = new StatosApiClient({
    apiKey: "statos_sk_test_fake",
    baseUrl: "http://test.invalid",
    userAgent: "test/1",
  });
  (client as unknown as { get: () => Promise<LeagueRow[]> }).get = async () => leagues;
  return client;
}

function league(id: number, continent = "Europe", specialized = false): LeagueRow {
  return {
    id,
    external_id: String(id),
    name: `League ${id}`,
    country: "Country",
    continent,
    sport: "soccer",
    is_specialized: specialized,
    specialized_at: specialized ? "2026-01-01T00:00:00Z" : null,
    logo: "",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

describe("listLeagues", () => {
  it("returns all leagues when no filters", async () => {
    const api = mockApi([league(1), league(2, "South America")]);
    const result = await listLeagues(api, {} as never);
    expect(result.count).toBe(2);
    expect(result.leagues.map((l) => l.id)).toEqual([1, 2]);
  });

  it("filters by continent client-side", async () => {
    const api = mockApi([
      league(1, "Europe"),
      league(2, "South America"),
      league(3, "Europe"),
    ]);
    const result = await listLeagues(api, { continent: "Europe" } as never);
    expect(result.count).toBe(2);
    expect(result.leagues.every((l) => l.continent === "Europe")).toBe(true);
  });

  it("filters by specialized_only", async () => {
    const api = mockApi([
      league(1, "Europe", false),
      league(2, "Europe", true),
      league(3, "Europe", true),
    ]);
    const result = await listLeagues(api, { specialized_only: true } as never);
    expect(result.count).toBe(2);
    expect(result.leagues.every((l) => l.is_specialized)).toBe(true);
  });

  it("respects limit + reports truncation", async () => {
    const api = mockApi(Array.from({ length: 10 }, (_, i) => league(i + 1)));
    const result = await listLeagues(api, { limit: 3 } as never);
    expect(result.count).toBe(3);
    expect(result.notes?.[0]).toMatch(/Truncated to 3/);
  });

  it("emits a note when API returns nothing", async () => {
    const api = mockApi([]);
    const result = await listLeagues(api, {} as never);
    expect(result.count).toBe(0);
    expect(result.notes?.[0]).toMatch(/no leagues/i);
  });
});
