import { describe, expect, it, vi } from "vitest";

import { StatosApiClient } from "../api.js";
import {
  suppressMarket,
  listSuppressions,
  unsuppressMarket,
  type MarketSuppressionRow,
} from "./market-suppressions.js";

function client(): StatosApiClient {
  return new StatosApiClient({
    apiKey: "statos_sk_test_fake",
    baseUrl: "http://test.invalid",
    userAgent: "test/1",
  });
}

const row: MarketSuppressionRow = {
  id: 7,
  league_id: 84,
  market_type: "cards",
  reason: "below claimed hit rate",
  suppressed_by: 1,
  expires_at: "2026-06-13T00:00:00Z",
  created_at: "2026-06-11T00:00:00Z",
};

describe("suppressMarket", () => {
  it("POSTs the body and surfaces an actionable note", async () => {
    const api = client();
    const post = vi.fn(async () => row);
    (api as unknown as { post: typeof post }).post = post;

    const res = await suppressMarket(api, {
      market_type: "cards",
      league_id: 84,
      hours: 48,
      reason: "below claimed hit rate",
    });

    expect(post).toHaveBeenCalledWith("/api/v1/admin/market-suppressions", {
      league_id: 84,
      market_type: "cards",
      hours: 48,
      reason: "below claimed hit rate",
    });
    expect(res.suppression.id).toBe(7);
    expect(res.note).toContain("league 84");
    expect(res.note).toContain("unsuppress_market(7)");
  });

  it("defaults league_id to 0 (wildcard) and hours to 24", async () => {
    const api = client();
    const post = vi.fn(async () => ({ ...row, league_id: 0 }));
    (api as unknown as { post: typeof post }).post = post;

    const res = await suppressMarket(api, { market_type: "corners" } as never);
    expect(post).toHaveBeenCalledWith("/api/v1/admin/market-suppressions", {
      league_id: 0,
      market_type: "corners",
      hours: 24,
      reason: "",
    });
    expect(res.note).toContain("ALL leagues");
  });
});

describe("listSuppressions", () => {
  it("returns rows and a friendly note when empty", async () => {
    const api = client();
    (api as unknown as { get: () => Promise<unknown> }).get = async () => ({
      suppressions: [],
      count: 0,
    });
    const res = await listSuppressions(api, {} as never);
    expect(res.count).toBe(0);
    expect(res.notes?.[0]).toContain("No active market suppressions");
  });

  it("passes through active rows", async () => {
    const api = client();
    (api as unknown as { get: () => Promise<unknown> }).get = async () => ({
      suppressions: [row],
      count: 1,
    });
    const res = await listSuppressions(api, {} as never);
    expect(res.count).toBe(1);
    expect(res.suppressions[0].market_type).toBe("cards");
    expect(res.notes).toBeUndefined();
  });
});

describe("unsuppressMarket", () => {
  it("DELETEs by id and confirms", async () => {
    const api = client();
    const del = vi.fn(async () => ({ deleted: 7 }));
    (api as unknown as { delete: typeof del }).delete = del;

    const res = await unsuppressMarket(api, { id: 7 });
    expect(del).toHaveBeenCalledWith("/api/v1/admin/market-suppressions/7");
    expect(res.deleted).toBe(7);
    expect(res.note).toContain("resumes");
  });

  it("rejects a non-positive id at the schema boundary", async () => {
    const api = client();
    await expect(unsuppressMarket(api, { id: 0 } as never)).rejects.toThrow();
  });
});
