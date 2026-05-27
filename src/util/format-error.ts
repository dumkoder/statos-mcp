import { ZodError } from "zod";

/**
 * Format an error for inclusion in an MCP tool's `isError` content text.
 *
 * Special-cases `ZodError` (the runtime-validation failures from input
 * schemas) into a short human-readable summary instead of the raw issue
 * array. AI clients render the text directly to users — the issue-array
 * JSON is parseable but visually noisy.
 *
 * Examples:
 *
 *   ZodError on { limit: -5 } →
 *     "limit: Number must be greater than or equal to 1"
 *
 *   ZodError on { match_id: "abc", quality: "platinum" } →
 *     "match_id: Expected number, received string; quality: Invalid enum value"
 *
 *   Plain Error("Statos API 401 …") →
 *     "Statos API 401 …"
 */
export function formatToolError(err: unknown): string {
  if (err instanceof ZodError) {
    return err.issues
      .map((issue) => {
        const path = issue.path
          .map((p) => String(p))
          .join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join("; ");
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}
