import { conflict, notFound } from '@/domain/errors';
import type { EmployeeId } from '@/domain/ids';
import { err, ok } from '@/domain/result';
import { applyAgentConfigPatch, type AgentConfigPatch } from '@/domain/rules/agentConfig';
import type { AgentConfig } from '@/domain/types';
import { activityEvent, checkActor, commit } from '../support';
import type { CommandHandler } from '../types';

export interface UpdateAgentConfigInput {
  readonly employeeId: EmployeeId;
  readonly patch: AgentConfigPatch;
}

/**
 * Changes how an AI employee would run (provider, model, instructions, limits).
 * Founder only (`agent.configure` can never be granted). Refuses credential-like
 * fields: keys never enter the workspace.
 */
export const updateAgentConfig: CommandHandler<UpdateAgentConfigInput, AgentConfig> = (
  state,
  input,
  context,
) => {
  const actor = checkActor(state, context);
  if (!actor.ok) return actor;
  const employee = state.employees[input.employeeId];
  const current = employee ? state.agentConfigs[employee.id] : undefined;
  if (!employee || !current) return err(notFound('employee', input.employeeId));

  const next = applyAgentConfigPatch(current, input.patch);
  if (!next.ok) return next;
  const changed = (Object.keys(next.value) as (keyof AgentConfig)[]).filter(
    (key) => next.value[key] !== current[key],
  );
  if (changed.length === 0)
    return err(conflict('no_change', 'The configuration already has these values.'));

  const now = context.clock.now();
  const config: AgentConfig = { ...next.value, updatedAt: now };
  return ok({
    value: config,
    state: commit(
      state,
      { agentConfigs: { ...state.agentConfigs, [employee.id]: config } },
      [
        activityEvent(context, now, {
          eventType: 'agent.configured',
          description: `${employee.name}'s AI configuration was changed (${changed.join(', ')}).`,
          employeeId: employee.id,
        }),
      ],
      [],
    ),
  });
};
