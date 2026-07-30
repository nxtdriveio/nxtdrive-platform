export type AutocompleteSessionState = Readonly<{
  token: string;
  startedAt: number;
  lastActivityAt: number;
  requests: number;
  resolved: boolean;
}>;

export type AutocompleteDecision =
  | Readonly<{ action: "SKIP"; reason: "TOO_SHORT" | "UNCHANGED" }>
  | Readonly<{ action: "DEBOUNCE"; waitMs: number }>
  | Readonly<{ action: "REQUEST"; session: AutocompleteSessionState }>;

export class AutocompleteSession {
  readonly #minimumLength: number;
  readonly #debounceMs: number;
  readonly #ttlMs: number;
  readonly #tokenFactory: () => string;
  #state: AutocompleteSessionState | null = null;
  #lastQuery = "";

  constructor(input?: {
    minimumLength?: number;
    debounceMs?: number;
    ttlMs?: number;
    tokenFactory?: () => string;
  }) {
    this.#minimumLength = input?.minimumLength ?? 3;
    this.#debounceMs = input?.debounceMs ?? 250;
    this.#ttlMs = input?.ttlMs ?? 3 * 60 * 1000;
    this.#tokenFactory = input?.tokenFactory ?? (() => crypto.randomUUID());
  }

  evaluate(query: string, now: number): AutocompleteDecision {
    const normalized = query.trim().replaceAll(/\s+/g, " ");
    if (normalized.length < this.#minimumLength) {
      this.#lastQuery = normalized;
      return { action: "SKIP", reason: "TOO_SHORT" };
    }
    if (normalized === this.#lastQuery) {
      return { action: "SKIP", reason: "UNCHANGED" };
    }
    if (
      this.#state &&
      !this.#state.resolved &&
      now - this.#state.lastActivityAt < this.#debounceMs
    ) {
      return {
        action: "DEBOUNCE",
        waitMs: this.#debounceMs - (now - this.#state.lastActivityAt),
      };
    }
    if (
      !this.#state ||
      this.#state.resolved ||
      now - this.#state.startedAt >= this.#ttlMs
    ) {
      this.#state = {
        token: this.#tokenFactory(),
        startedAt: now,
        lastActivityAt: now,
        requests: 0,
        resolved: false,
      };
    }
    this.#lastQuery = normalized;
    this.#state = {
      ...this.#state,
      lastActivityAt: now,
      requests: this.#state.requests + 1,
    };
    return { action: "REQUEST", session: this.#state };
  }

  resolve(now: number): AutocompleteSessionState | null {
    if (!this.#state) return null;
    this.#state = { ...this.#state, resolved: true, lastActivityAt: now };
    return this.#state;
  }

  abandon(now: number): AutocompleteSessionState | null {
    if (!this.#state || this.#state.resolved) return null;
    const abandoned = { ...this.#state, lastActivityAt: now };
    this.#state = null;
    this.#lastQuery = "";
    return abandoned;
  }
}
