import type { EmployeeId } from '@/domain/ids';
import {
  ACTION_TYPES,
  EXECUTION_STATUSES,
  type ActionTarget,
  type ActionType,
  type Execution,
  type ExecutionStatus,
} from '@/domain/types';

export const RESOURCE_TYPES = ['project', 'task', 'employee', 'meeting', 'workspace'] as const;

export interface ExecutionFilters {
  readonly actor: EmployeeId | 'all';
  readonly action: ActionType | 'all';
  readonly status: ExecutionStatus | 'all';
  readonly resource: ActionTarget['type'] | 'all';
  /** Calendar days `YYYY-MM-DD` (inclusive), compared with the request time. */
  readonly from: string;
  readonly to: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const oneOf = <T extends string>(value: string | null, list: readonly T[]): T | 'all' =>
  list.find((option) => option === value) ?? 'all';

export function readExecutionFilters(params: URLSearchParams): ExecutionFilters {
  const day = (value: string | null) => (value && DAY.test(value) ? value : '');
  return {
    actor: (params.get('actor') as EmployeeId | null) ?? 'all',
    action: oneOf(params.get('action'), ACTION_TYPES),
    status: oneOf(params.get('status'), EXECUTION_STATUSES),
    resource: oneOf(params.get('resource'), RESOURCE_TYPES),
    from: day(params.get('from')),
    to: day(params.get('to')),
  };
}

/** Local calendar day of an ISO timestamp. */
function localDay(iso: string): string {
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Newest first, every filter composing. */
export function filterExecutions(
  executions: readonly Execution[],
  filters: ExecutionFilters,
): Execution[] {
  return executions
    .filter(
      (execution) =>
        (filters.actor === 'all' || execution.actorId === filters.actor) &&
        (filters.action === 'all' || execution.action.type === filters.action) &&
        (filters.status === 'all' || execution.status === filters.status) &&
        (filters.resource === 'all' || execution.target.type === filters.resource) &&
        (filters.from === '' || localDay(execution.requestedAt) >= filters.from) &&
        (filters.to === '' || localDay(execution.requestedAt) <= filters.to),
    )
    .reverse();
}
