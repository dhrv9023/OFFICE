/** Source of "now" as an ISO-8601 UTC string. Injected so rules and commands stay deterministic. */
export interface Clock {
  now(): string;
}
