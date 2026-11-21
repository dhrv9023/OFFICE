import { gatewayFor, readerFor } from '@/commands';
import { createAgentRuntime } from '@/runtime/runtime';
import { createProviderRegistry } from '@/runtime/provider';
import { systemClock } from '@/services/clock';
import { createSessionCredentialVault } from '@/services/credentials';
import { getAppStatus } from '@/stores/appStatus';
import { getWorkspace } from '@/stores/workspace';

/*
 * Composition root of the agent runtime (Phase 2.0). The runtime receives only:
 * identity-bound gateways and readers, a read-only configuration lookup, the
 * provider registry, a session credential source and a "can we save?" check.
 *
 * No provider is registered in Phase 2.0, so no run can start: preparing fails
 * with "provider not available". Nothing in the interface starts runs yet.
 */

/** Session-only credentials (memory, never persisted). Empty until a provider exists. */
export const credentialVault = createSessionCredentialVault();

let counter = 0;

export const agentRuntime = createAgentRuntime({
  gatewayFor,
  readerFor,
  configFor: (employeeId) => getWorkspace().agentConfigs[employeeId],
  providers: createProviderRegistry([]),
  credentials: credentialVault,
  clock: systemClock,
  newRunId: () => {
    counter += 1;
    return `run_${Date.now().toString(36)}_${String(counter)}`;
  },
  canPersist: () => {
    const { phase, save } = getAppStatus();
    return phase.status === 'ready' && phase.storage === 'persistent' && save.state !== 'error';
  },
  maxRunDurationMs: 30 * 60_000,
});
