import { z } from "zod";

import type { StatosApiClient } from "../api.js";

// `get_account` is a zero-arg tool; schema is an empty object.
export const getAccountInputSchema = z.object({}).strict();

export type GetAccountInput = z.infer<typeof getAccountInputSchema>;

// ── Shape returned by GET /api/v1/auth/me (curated for MCP consumers) ───────
//
// The backend's User struct has many fields (locale, avatar URL, internal
// timestamps, etc.) the AI doesn't need. We pass through the ones useful
// for "tell the user what plan they're on and what they can see" use
// cases, and keep the rest under an extensible `[key: string]: unknown`
// so additive backend changes don't break the type.
export interface AccountInfo {
  id: number;
  email: string;
  role: string;                            // silver | gold | diamond | admin
  subscription_status: string;             // none | trialing | active | past_due | canceled
  trial_role?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
  pending_plan_change?: string;
  pending_plan_change_at?: string;
  [key: string]: unknown;
}

export interface GetAccountResult {
  account: AccountInfo;
  effective_role: string; // role OR trial_role if trial is active — what the AI should reason against
  notes?: string[];
}

/**
 * `get_account` — wraps GET /api/v1/auth/me. Returns the API key holder's
 * own plan + subscription state so an AI assistant can tell the user
 * which leagues their plan permits (Statos gates by `allowed_league_groups`
 * server-side; this is the front-of-house equivalent).
 */
export async function getAccount(
  api: StatosApiClient,
  input: GetAccountInput,
): Promise<GetAccountResult> {
  getAccountInputSchema.parse(input);
  const me = await api.get<AccountInfo>("/api/v1/auth/me");

  // Mirror backend trial-role logic: while a trial is active, the user's
  // *effective* role is trial_role rather than their base role. The AI
  // should reason against the effective role.
  const trialActive =
    typeof me.trial_role === "string" &&
    me.trial_role.length > 0 &&
    typeof me.trial_ends_at === "string" &&
    new Date(me.trial_ends_at).getTime() > Date.now() &&
    me.role !== "admin";
  const effectiveRole = trialActive ? (me.trial_role as string) : me.role;

  const notes: string[] = [];
  if (trialActive) {
    notes.push(
      `Trial active: role is elevated to '${effectiveRole}' until ${me.trial_ends_at}.`,
    );
  }
  if (me.subscription_status === "past_due") {
    notes.push(
      "Subscription is past_due — Stripe will retry payment; current access remains for now.",
    );
  }
  if (me.cancel_at_period_end) {
    notes.push(
      `Cancellation scheduled for end of current period${me.current_period_end ? " (" + me.current_period_end + ")" : ""}.`,
    );
  }

  return {
    account: me,
    effective_role: effectiveRole,
    notes: notes.length > 0 ? notes : undefined,
  };
}
