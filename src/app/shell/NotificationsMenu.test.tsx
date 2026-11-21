// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands } from '@/commands';
import { USER_ACTOR } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';
import { targetOf } from './notificationTarget';

beforeEach(async () => {
  await freshWorkspace();
});

describe('notifications (Phase 1.7)', () => {
  it('opens what a notification is about and marks only that one as read', () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
        assigneeId: EMP.sarah,
      }),
    );
    const unreadBefore = getWorkspace().notifications.filter((n) => !n.isRead).length;
    const { router } = renderApp('/');

    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    const item = screen.getByRole('button', { name: /Sarah Chen was assigned "Design homepage"/ });
    expect(within(item).getByText('Unread')).toBeInTheDocument();
    fireEvent.click(item);

    const assigned = getWorkspace().notifications.find((n) => n.relatedEntityId === task.id);
    expect(assigned?.isRead).toBe(true);
    expect(getWorkspace().notifications.filter((n) => !n.isRead)).toHaveLength(unreadBefore - 1);
    expect(router.state.location.search).toContain(`task=${task.id}`);
    expect(screen.getByRole('dialog', { name: 'Design homepage' })).toBeInTheDocument();
  });

  it('knows where each kind of entity lives', () => {
    expect(targetOf('prj_1')).toMatchObject({ path: '/projects/prj_1' });
    expect(targetOf('task_1')).toMatchObject({ taskId: 'task_1' });
    expect(targetOf('dept_design')).toMatchObject({ path: '/employees#dept_design' });
    expect(targetOf(null)).toBeNull();
  });
});
