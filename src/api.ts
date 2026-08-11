// Thin wrapper around `fetch` that injects the Statos API-key Bearer header
// and resolves the API base URL.  Used by every tool.
//
// Auth model: the Statos API accepts a `statos_sk_live_…` or `statos_sk_test_…`
// token as a Bearer credential in the Authorization header.  We do nothing
// fancy — just forward whatever key the operator gave us.

export interface ApiClientConfig {
  apiKey: string;
  baseUrl: string;
  userAgent: string;
}

export class StatosApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
    message: string,
  ) {
    super(message);
    this.name = "StatosApiError";
  }
}

export class StatosApiClient {
  constructor(private readonly cfg: ApiClientConfig) {}

  /**
   * GET an API endpoint and return the parsed JSON.  Throws StatosApiError on
   * any non-2xx response so tool implementations can surface a clean message
   * to the MCP client.
   */
  async get<T>(path: string, query?: Record<string, string | undefined>): Promise<T> {
    const url = new URL(path, this.cfg.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== "") {
          url.searchParams.set(k, v);
        }
      }
    }

    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "User-Agent": this.cfg.userAgent,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new StatosApiError(
        res.status,
        body,
        `Statos API ${res.status} on ${path}: ${body.slice(0, 200)}`,
      );
    }

    return (await res.json()) as T;
  }

  /** POST a JSON body and return the parsed JSON response. */
  async post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>("POST", path, body);
  }

  /** DELETE an endpoint and return the parsed JSON response. */
  async delete<T>(path: string): Promise<T> {
    return this.send<T>("DELETE", path);
  }

  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = new URL(path, this.cfg.baseUrl);
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${this.cfg.apiKey}`,
        "User-Agent": this.cfg.userAgent,
        Accept: "application/json",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new StatosApiError(
        res.status,
        text,
        `Statos API ${res.status} on ${method} ${path}: ${text.slice(0, 200)}`,
      );
    }

    return (await res.json()) as T;
  }
}

/**
 * Shape of a single suggestion returned by `GET /api/v1/suggestions`.
 * Mirrors `services.BetSuggestion` in the backend.  Only fields we actually
 * surface to MCP consumers are typed strictly; rest is `unknown` so the
 * server doesn't break on additive backend changes.
 */
export interface BetSuggestion {
  match_id: number;
  match_date: string;
  home_team: string;
  away_team: string;
  league_id: number;
  league_name: string;
  league_continent?: string;
  market_type: string;
  selection: string;
  line?: number;
  suggested_prob: number;
  best_odds?: number;
  bookmaker?: string;
  implied_probability?: number;
  edge?: number;
  confidence: string; // "low" | "medium" | "high"
  reasoning?: string;
  has_ratings?: boolean;
  has_odds?: boolean;
  tier?: string;
  [key: string]: unknown;
}

export interface SuggestionsResponse {
  league_id: number;
  league_name: string;
  suggestions: BetSuggestion[] | null;
  count: number;
}
