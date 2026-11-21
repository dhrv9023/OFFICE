import type { ApprovalStatus, ExecutionStatus } from '@/domain/types';

/** How approval and execution states are shown: always written out, never colour alone. */
export const APPROVAL_STATUS: Record<
  ApprovalStatus,
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }
> = {
  pending: { label: 'Waiting for you', tone: 'accent' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  cancelled: { label: 'Withdrawn', tone: 'neutral' },
  stale: { label: 'Out of date', tone: 'warning' },
};

export const EXECUTION_STATUS: Record<
  ExecutionStatus,
  { label: string; tone: 'neutral' | 'accent' | 'success' | 'danger' | 'warning' }
> = {
  awaiting_approval: { label: 'Waiting for approval', tone: 'accent' },
  succeeded: { label: 'Succeeded', tone: 'success' },
  failed: { label: 'Failed', tone: 'danger' },
  denied: { label: 'Denied', tone: 'danger' },
  rejected: { label: 'Rejected', tone: 'warning' },
  cancelled: { label: 'Withdrawn', tone: 'neutral' },
};
