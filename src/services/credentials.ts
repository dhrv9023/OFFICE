/*
 * Provider credentials (Phase 2.0).
 *
 * API keys NEVER enter the workspace: there is no field for them in any domain
 * type, so they cannot reach IndexedDB, exports or backups. The runtime asks a
 * CredentialSource for a provider's key at the moment of a call and passes it
 * only to that call.
 *
 * Phase 2.0 provides only a session vault: keys held in memory for the current
 * page, gone on reload, never written anywhere. It is NOT a secure store (any
 * code in the page could read it) and is not presented as one. A durable store
 * needs either the OS keychain (desktop shell) or a small local/server proxy that
 * keeps keys out of the browser entirely; see docs/PHASE_2_0_REPORT.md.
 */

export interface CredentialSource {
  /** The credential for a provider, or null when none is held. */
  get(providerId: string): string | null;
}

export interface SessionCredentialVault extends CredentialSource {
  set(providerId: string, credential: string): void;
  forget(providerId: string): void;
  /** Provider IDs with a credential held (never the credentials themselves). */
  providers(): readonly string[];
  clear(): void;
}

/** In-memory, per-page credentials. Nothing is persisted. */
export function createSessionCredentialVault(): SessionCredentialVault {
  const keys = new Map<string, string>();
  return {
    get: (providerId) => keys.get(providerId) ?? null,
    set: (providerId, credential) => {
      if (credential.trim() === '') throw new Error('A credential cannot be empty.');
      keys.set(providerId, credential);
    },
    forget: (providerId) => {
      keys.delete(providerId);
    },
    providers: () => [...keys.keys()],
    clear: () => {
      keys.clear();
    },
  };
}
