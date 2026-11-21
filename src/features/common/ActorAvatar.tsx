import { Cog } from 'lucide-react';
import { Avatar, type AvatarSize } from '@/components/Avatar';
import { cn } from '@/components/cn';
import type { ActivityEvent, WorkspaceState } from '@/domain/types';

/** Who did something, as a face: you (the founder), an employee, or the system. */
export function ActorAvatar({
  actorId,
  workspace,
  size = 'md',
}: {
  actorId: ActivityEvent['actorId'];
  workspace: WorkspaceState;
  size?: AvatarSize;
}) {
  if (actorId === 'user') return <Avatar founder size={size} />;
  const employee = actorId === 'system' ? undefined : workspace.employees[actorId];
  if (employee) {
    return (
      <Avatar
        avatarId={employee.avatarId}
        color={workspace.departments[employee.departmentId]?.color}
        size={size}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-md bg-surface-hover text-muted',
        size === 'sm' ? 'size-6' : 'size-8',
      )}
    >
      <Cog className="size-4" />
    </span>
  );
}
