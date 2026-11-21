import { Avatar } from '@/components/Avatar';
import type { Department, Employee } from '@/domain/types';

interface AvatarStackProps {
  people: readonly Employee[];
  departments: Readonly<Record<string, Department>>;
  max?: number;
}

/** Overlapping avatars with the names available as text. */
export function AvatarStack({ people, departments, max = 4 }: AvatarStackProps) {
  if (people.length === 0) return <span className="text-xs text-muted">Nobody assigned yet</span>;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <span className="flex items-center">
      <span className="sr-only">{people.map((person) => person.name).join(', ')}</span>
      <span className="flex -space-x-1.5" aria-hidden="true">
        {shown.map((person) => (
          <span key={person.id} title={person.name} className="flex rounded-md ring-2 ring-card">
            <Avatar
              avatarId={person.avatarId}
              color={departments[person.departmentId]?.color}
              size="sm"
            />
          </span>
        ))}
        {extra > 0 ? (
          <span className="flex size-6 items-center justify-center rounded-md bg-surface-hover text-2xs font-medium text-muted ring-2 ring-card">
            +{extra}
          </span>
        ) : null}
      </span>
    </span>
  );
}
