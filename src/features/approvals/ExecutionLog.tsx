import { FilterX, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { EmptyState } from '@/components/EmptyState';
import { Input, Select } from '@/components/Field';
import { RelativeTime } from '@/components/time';
import { ACTION_TYPES, EXECUTION_STATUSES, type WorkspaceState } from '@/domain/types';
import { filterExecutions, readExecutionFilters, RESOURCE_TYPES } from './executionFilters';
import { EXECUTION_STATUS } from './statusLabels';

const PAGE = 50;

/**
 * Every action an AI employee asked to perform, how it was authorized and how
 * it ended. Filtered through the URL so a view can be shared or revisited.
 */
export function ExecutionLog({ workspace }: { workspace: WorkspaceState }) {
  const [params, setParams] = useSearchParams();
  const filters = readExecutionFilters(params);
  const [shown, setShown] = useState(PAGE);
  const matching = filterExecutions(workspace.executions, filters);
  const filtered =
    filters.actor !== 'all' ||
    filters.action !== 'all' ||
    filters.status !== 'all' ||
    filters.resource !== 'all' ||
    filters.from !== '' ||
    filters.to !== '';

  const set = (key: string, value: string) => {
    setShown(PAGE);
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value === 'all' || value === '') next.delete(key);
        else next.set(key, value);
        return next;
      },
      { replace: true },
    );
  };

  if (workspace.executions.length === 0) {
    return (
      <EmptyState
        compact
        icon={ScrollText}
        title="No executions yet"
        description="Every action an AI employee requests (allowed, denied, failed or sent for approval) is recorded here. No AI employee is connected yet."
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6 lg:items-end">
        <Select
          label="Employee"
          value={filters.actor}
          onChange={(event) => {
            set('actor', event.target.value);
          }}
          options={[
            { value: 'all', label: 'Anyone' },
            ...Object.values(workspace.employees).map((employee) => ({
              value: employee.id,
              label: employee.name,
            })),
          ]}
        />
        <Select
          label="Action"
          value={filters.action}
          onChange={(event) => {
            set('action', event.target.value);
          }}
          options={[
            { value: 'all', label: 'Any action' },
            ...ACTION_TYPES.map((type) => ({ value: type, label: type })),
          ]}
        />
        <Select
          label="Status"
          value={filters.status}
          onChange={(event) => {
            set('status', event.target.value);
          }}
          options={[
            { value: 'all', label: 'Any status' },
            ...EXECUTION_STATUSES.map((status) => ({
              value: status,
              label: EXECUTION_STATUS[status].label,
            })),
          ]}
        />
        <Select
          label="Resource"
          value={filters.resource}
          onChange={(event) => {
            set('resource', event.target.value);
          }}
          options={[
            { value: 'all', label: 'Any resource' },
            ...RESOURCE_TYPES.map((type) => ({
              value: type,
              label: type.charAt(0).toUpperCase() + type.slice(1),
            })),
          ]}
        />
        <Input
          label="From"
          type="date"
          value={filters.from}
          onChange={(event) => {
            set('from', event.target.value);
          }}
        />
        <Input
          label="To"
          type="date"
          value={filters.to}
          onChange={(event) => {
            set('to', event.target.value);
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          {filtered
            ? `${String(matching.length)} of ${String(workspace.executions.length)} match`
            : `${String(matching.length)} recorded`}
        </p>
        {filtered ? (
          <Button
            variant="ghost"
            icon={FilterX}
            onClick={() => {
              setParams({ tab: 'log' }, { replace: true });
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {matching.length === 0 ? (
        <p className="text-sm text-muted">No executions match.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-line rounded-xl border border-line bg-card">
          {matching.slice(0, shown).map((execution) => {
            const employee = workspace.employees[execution.actorId];
            const department = employee ? workspace.departments[employee.departmentId] : undefined;
            const status = EXECUTION_STATUS[execution.status];
            return (
              <li key={execution.id} className="flex items-start gap-3 px-4 py-3">
                {employee ? (
                  <Avatar avatarId={employee.avatarId} color={department?.color} size="sm" />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-sm font-medium">{execution.summary}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {employee?.name ?? execution.actorId} · {execution.action.type} ·{' '}
                    <RelativeTime iso={execution.requestedAt} /> · request “{execution.requestId}”
                    {execution.retryOf ? ' · retry' : ''}
                  </p>
                  {execution.error ? (
                    <p className="mt-1 text-sm text-danger">{execution.error.message}</p>
                  ) : execution.result ? (
                    <p className="mt-1 text-xs text-muted">{execution.result}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {matching.length > shown ? (
        <Button
          className="self-start"
          onClick={() => {
            setShown((current) => current + PAGE);
          }}
        >
          Show older ({String(matching.length - shown)} more)
        </Button>
      ) : null}
    </div>
  );
}
