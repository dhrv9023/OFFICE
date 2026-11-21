import type { ActivityEvent, WorkspaceState } from '@/domain/types';

export function actorName(actorId: ActivityEvent['actorId'], workspace: WorkspaceState): string {
  if (actorId === 'user') return 'You';
  if (actorId === 'system') return 'System';
  return workspace.employees[actorId]?.name ?? 'Former employee';
}
