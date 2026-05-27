import { describe, expect, it } from "vitest";

import { StatosApiClient } from "../api.js";
import { getAccount, type AccountInfo } from "./get-account.js";

function mockApi(payload: AccountInfo): StatosApiClient {
  const client = new StatosApiClient({
    apiKey: "statos_sk_test_fake",
    baseUrl: "http://test.invalid",
    userAgent: "test/1",
  });
  (client as unknown as { get: () => Promise<AccountInfo> }).get = async () => payload;
  return client;
}

describe("getAccount", () => {
  it("passes through the account payload + reports effective_role for non-trial users", async () => {
    const api = mockApi({
      id: 1,
      email: "user@example.com",
      role: "silver",
      subscription_status: "active",
    });
    const result = await getAccount(api, {});
    expect(result.account.email).toBe("user@example.com");
    expect(result.effective_role).toBe("silver");
    expect(result.notes).toBeUndefined();
  });

  it("elevates effective_role to trial_role when a trial is active", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const api = mockApi({
      id: 1,
      email: "user@example.com",
      role: "silver",
      subscription_status: "trialing",
      trial_role: "diamond",
      trial_ends_at: future,
    });
    const result = await getAccount(api, {});
    expect(result.effective_role).toBe("diamond");
    expect(result.notes?.[0]).toMatch(/Trial active.*diamond/);
  });

  it("does NOT elevate when the trial has already ended", async () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const api = mockApi({
      id: 1,
      email: "user@example.com",
      role: "silver",
      subscription_status: "none",
      trial_role: "diamond",
      trial_ends_at: past,
    });
    const result = await getAccount(api, {});
    expect(result.effective_role).toBe("silver");
  });

  it("does NOT elevate admins (admins are never demoted/elevated by trial)", async () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const api = mockApi({
      id: 1,
      email: "admin@example.com",
      role: "admin",
      subscription_status: "active",
      trial_role: "diamond",
      trial_ends_at: future,
    });
    const result = await getAccount(api, {});
    expect(result.effective_role).toBe("admin");
  });

  it("surfaces past_due as a note", async () => {
    const api = mockApi({
      id: 1,
      email: "user@example.com",
      role: "gold",
      subscription_status: "past_due",
    });
    const result = await getAccount(api, {});
    expect(result.notes?.some((n) => /past_due/i.test(n))).toBe(true);
  });

  it("surfaces cancel_at_period_end as a note", async () => {
    const api = mockApi({
      id: 1,
      email: "user@example.com",
      role: "gold",
      subscription_status: "active",
      cancel_at_period_end: true,
      current_period_end: "2026-12-31T23:59:59Z",
    });
    const result = await getAccount(api, {});
    expect(result.notes?.some((n) => /Cancellation scheduled/.test(n))).toBe(true);
  });
});
