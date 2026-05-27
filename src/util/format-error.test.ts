import { describe, expect, it } from "vitest";
import { z } from "zod";

import { formatToolError } from "./format-error.js";

describe("formatToolError", () => {
  it("formats a single ZodError issue as 'path: message'", () => {
    const schema = z.object({ limit: z.number().min(1) });
    const err = schema.safeParse({ limit: -5 }).error!;
    const msg = formatToolError(err);
    expect(msg).toBe("limit: Number must be greater than or equal to 1");
  });

  it("joins multiple ZodError issues with semicolons", () => {
    const schema = z.object({
      match_id: z.number(),
      quality: z.enum(["all", "strong", "elite"]),
    });
    const err = schema.safeParse({ match_id: "abc", quality: "platinum" }).error!;
    const msg = formatToolError(err);
    // Both fields should appear; order is whatever zod returns.
    expect(msg).toMatch(/match_id:/);
    expect(msg).toMatch(/quality:/);
    expect(msg).toContain("; ");
  });

  it("returns just the message when path is empty (top-level error)", () => {
    const schema = z.string();
    const err = schema.safeParse(42).error!;
    const msg = formatToolError(err);
    // No "path:" prefix because path is []
    expect(msg).not.toMatch(/^:/);
    expect(msg.length).toBeGreaterThan(0);
  });

  it("falls through to .message for non-Zod Error instances", () => {
    const err = new Error("Statos API 401 on /api/v1/leagues: invalid key");
    expect(formatToolError(err)).toBe("Statos API 401 on /api/v1/leagues: invalid key");
  });

  it("stringifies non-Error throwables", () => {
    expect(formatToolError("a plain string")).toBe("a plain string");
    expect(formatToolError(42)).toBe("42");
    expect(formatToolError(null)).toBe("null");
  });
});
