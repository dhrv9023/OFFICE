import { useMemo } from 'react';
import { Link } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { cn } from '@/components/cn';
import { WORK_STATUS } from '@/features/common/presentation';
import { selectEmployeeSummaries } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { ROUTES } from '../navigation';

const DOT = {
  working: 'bg-accent',
  reviewing: 'bg-secondary',
  blocked: 'bg-danger',
  idle: 'bg-subtle',
} as const;

/** The sidebar's live glance at the team: everyone's face and what they are doing. */
export function TeamPresence() {
  const workspace = useWorkspace((state) => state);
  const team = useMemo(() => selectEmployeeSummaries(workspace), [workspace]);
  if (team.length === 0) return null;
  const working = team.filter((member) => member.status === 'working').length;
  const summary = `${String(working)} of ${String(team.length)} working`;

  return (
    <Link
      to={ROUTES.employees}
      aria-label={`Your team: ${summary}`}
      className="group mx-2.5 mb-2 block rounded-lg px-2.5 py-2.5 transition-colors hover:bg-surface-hover/60"
    >
      <span className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted group-hover:text-content">Your team</span>
        <span className="text-subtle tabular-nums">{summary}</span>
      </span>
      <span className="mt-2 flex flex-wrap gap-1.5" aria-hidden="true">
        {team.map(({ employee, department, status }) => (
          <span
            key={employee.id}
            className="relative"
            title={`${employee.name} · ${WORK_STATUS[status].label}`}
          >
            <Avatar avatarId={employee.avatarId} color={department?.color} size="sm" />
            <span
              className={cn(
                'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-canvas',
                DOT[status],
              )}
            />
          </span>
        ))}
      </span>
    </Link>
  );
}
