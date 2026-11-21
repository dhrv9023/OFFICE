import { ACTION_TYPES, type ActionType } from '@/domain/types';

/**
 * An action a model proposes. The model never executes anything: the runtime
 * validates the structure, then hands it to the employee's gateway, where the
 * Phase 1.8 pipeline (authorization, dry run, approval) decides.
 */
export interface ActionProposal {
  /** Idempotency key for this action within the run (stable across retries). */
  readonly requestId: string;
  readonly action: { readonly type: ActionType; readonly input: Readonly<Record<string, unknown>> };
  /** What the proposal is about, as the model sees it (informational). */
  readonly target: { readonly type: string; readonly id: string | null } | null;
  /** Why, in the model's words (shown to the founder with any approval request). */
  readonly explanation: string;
  /** Optional context summary; stored on the run, never executed. */
  readonly reasoning: string | null;
}

export type ProposalCheck =
  | { readonly ok: true; readonly proposal: ActionProposal }
  | { readonly ok: false; readonly reason: string };

/** Actions a runtime may never propose (founder-only or approval decisions). */
const NEVER_PROPOSED = new Set<string>([
  'updateAccessProfile',
  'updateAgentConfig',
  'approveRequest',
  'rejectRequest',
  'markNotificationRead',
  'markAllNotificationsRead',
]);

const REQUEST_ID = /^[A-Za-z0-9._:-]{1,60}$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Structural validation of untrusted model output. It does not decide whether
 * the action is allowed (the gateway does) or valid (the commands do).
 */
export function validateProposal(raw: unknown): ProposalCheck {
  if (!isRecord(raw)) return { ok: false, reason: 'A proposal must be an object.' };
  const { requestId, action, target, explanation, reasoning } = raw;
  if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) {
    return {
      ok: false,
      reason: 'A proposal needs a request ID of 1–60 letters, digits or . _ : -',
    };
  }
  if (!isRecord(action) || typeof action.type !== 'string') {
    return { ok: false, reason: 'A proposal needs an action with a type.' };
  }
  const type = ACTION_TYPES.find((candidate) => candidate === action.type);
  if (!type || NEVER_PROPOSED.has(type)) {
    return {
      ok: false,
      reason: `"${action.type}" is not an action an employee can propose.`,
    };
  }
  if (!isRecord(action.input)) return { ok: false, reason: 'The action input must be an object.' };
  let json: string;
  try {
    json = JSON.stringify(action.input);
  } catch {
    return { ok: false, reason: 'The action input must be plain data.' };
  }
  if (json.length > 20_000) return { ok: false, reason: 'The action input is too large.' };
  if (typeof explanation !== 'string' || explanation.trim() === '' || explanation.length > 1000) {
    return { ok: false, reason: 'A proposal needs a short explanation (1–1000 characters).' };
  }
  if (
    reasoning !== undefined &&
    reasoning !== null &&
    (typeof reasoning !== 'string' || reasoning.length > 4000)
  ) {
    return { ok: false, reason: 'Reasoning must be text of at most 4000 characters.' };
  }
  let parsedTarget: ActionProposal['target'] = null;
  if (target !== undefined && target !== null) {
    if (
      !isRecord(target) ||
      typeof target.type !== 'string' ||
      (target.id !== null && typeof target.id !== 'string')
    ) {
      return { ok: false, reason: 'A target must name a type and an ID (or null).' };
    }
    parsedTarget = { type: target.type, id: target.id };
  }
  return {
    ok: true,
    proposal: {
      requestId,
      action: { type, input: JSON.parse(json) as Record<string, unknown> },
      target: parsedTarget,
      explanation: explanation.trim(),
      reasoning: typeof reasoning === 'string' ? reasoning : null,
    },
  };
}
