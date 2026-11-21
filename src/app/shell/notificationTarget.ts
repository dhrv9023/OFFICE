import type { EntityId, TaskId } from '@/domain/ids';
import { ROUTES } from '../navigation';

/**
 * Where a notification leads, from the entity it is about. Deleted entities have
 * their reference cleared by the commands, so there is nothing to follow.
 */
export function targetOf(
  id: EntityId | null,
): { label: string; path: string; taskId?: TaskId } | null {
  if (id === null) return null;
  if (id.startsWith('task_'))
    return { label: 'Open task', path: ROUTES.tasks, taskId: id as TaskId };
  if (id.startsWith('prj_')) return { label: 'Open project', path: `${ROUTES.projects}/${id}` };
  if (id.startsWith('emp_')) return { label: 'Open employees', path: ROUTES.employees };
  if (id.startsWith('apr_')) return { label: 'Review request', path: ROUTES.approvals };
  if (id.startsWith('dept_'))
    return { label: 'Open department', path: `${ROUTES.employees}#${id}` };
  return null;
}
