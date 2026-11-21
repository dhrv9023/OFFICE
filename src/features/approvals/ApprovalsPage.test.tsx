// @vitest-environment jsdom
import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { commands, gatewayFor } from '@/commands';
import type { TaskId } from '@/domain/ids';
import { defaultGrants } from '@/domain/rules/access';
import { USER_ACTOR } from '@/domain/types';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { unwrap } from '@/test/harness';
import { freshWorkspace, renderApp } from '@/test/render';

/*
 * The founder's approvals screen, driven by a controlled test actor (the project
 * manager's gateway). No AI is involved.
 */

let taskId: TaskId;

beforeEach(async () => {
  await freshWorkspace();
  const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
  taskId = unwrap(
    commands.createTask(USER_ACTOR, {
      projectId: project.id,
      departmentId: DEPT.design,
      title: 'Old moodboard',
      assigneeId: EMP.sarah,
    }),
  ).id;
  unwrap(
    commands.updateAccessProfile(USER_ACTOR, {
      employeeId: EMP.alex,
      status: 'active',
      grants: [
        ...defaultGrants({ departmentId: DEPT.management }),
        { permission: 'task.delete', scope: 'any', requiresApproval: false },
      ],
    }),
  );
});

const requestDelete = () =>
  unwrap(
    gatewayFor(EMP.alex).request(
      { type: 'deleteTask', input: { taskId } },
      { requestId: 'del-1', reason: 'Superseded by the new brand.' },
    ),
  );

describe('approvals page (Phase 1.8)', () => {
  it('explains the empty state honestly', () => {
    renderApp('/approvals');
    expect(screen.getByText('Nothing to decide')).toBeInTheDocument();
    expect(screen.getByText(/No AI employee is connected yet/)).toBeInTheDocument();
  });

  it('shows a pending request in full and applies it only when approved', () => {
    requestDelete();
    renderApp('/approvals');
    expect(screen.getByRole('link', { name: /Approvals/ })).toHaveTextContent('1');
    const card = screen.getByText('Delete task "Old moodboard"').closest('div[class*="rounded"]');
    expect(card).not.toBeNull();
    expect(screen.getByText('Superseded by the new brand.')).toBeInTheDocument();
    expect(screen.getByText('Deleting a task always needs the founder.')).toBeInTheDocument();
    expect(screen.getByText('Requested by Alex Morgan', { exact: false })).toBeInTheDocument();
    expect(getWorkspace().tasks[taskId]).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Approve…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Approve this request?' });
    fireEvent.change(within(dialog).getByLabelText('Note'), { target: { value: 'Agreed.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve and apply' }));

    expect(getWorkspace().tasks[taskId]).toBeUndefined();
    expect(getWorkspace().approvals[0]).toMatchObject({
      status: 'approved',
      decisionNote: 'Agreed.',
    });
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Approve…' })).toBeNull();
  });

  it('rejects without changing anything', () => {
    requestDelete();
    renderApp('/approvals');
    fireEvent.click(screen.getByRole('button', { name: 'Reject…' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Reject this request?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Reject' }));
    expect(getWorkspace().tasks[taskId]).toBeDefined();
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('refuses a stale request with the reason and applies nothing', () => {
    requestDelete();
    unwrap(commands.updateTask(USER_ACTOR, { taskId, patch: { title: 'Moodboard v2' } }));
    renderApp('/approvals');
    fireEvent.click(screen.getByRole('button', { name: 'Approve…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Approve and apply' }));
    expect(getWorkspace().tasks[taskId]?.title).toBe('Moodboard v2');
    expect(screen.getByText('Out of date')).toBeInTheDocument();
    expect(screen.getAllByText(/changed after the request was made/).length).toBeGreaterThan(0);
  });

  it('lists every execution in the log, filterable by status', () => {
    unwrap(
      gatewayFor(EMP.alex).request(
        {
          type: 'updateProject',
          input: {
            projectId: Object.keys(getWorkspace().projects)[0],
            patch: { status: 'archived' },
          },
        },
        { requestId: 'archive' },
      ),
    );
    requestDelete();
    unwrap(
      gatewayFor(EMP.ryan).request(
        { type: 'deleteTask', input: { taskId } },
        { requestId: 'ryan-del' },
      ),
    );
    renderApp('/approvals?tab=log');
    expect(screen.getByText('3 recorded')).toBeInTheDocument();
    expect(
      screen.getByText('Ryan Miller is not enabled to act (AI access is disabled).'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'denied' } });
    // Archiving is denied too: the project manager has no project-status grant by default.
    expect(screen.getByText('2 of 3 match')).toBeInTheDocument();
  });

  it('opens the approvals page from the notification', () => {
    requestDelete();
    const { router } = renderApp('/');
    fireEvent.click(screen.getByRole('button', { name: /^Notifications/ }));
    fireEvent.click(screen.getByRole('button', { name: /Alex Morgan asks to delete task/ }));
    expect(router.state.location.pathname).toBe('/approvals');
  });
});

describe('employee access (Phase 1.8)', () => {
  it('lets the founder enable an employee and change a grant, recorded in activity', () => {
    renderApp('/employees');
    fireEvent.click(screen.getByRole('button', { name: 'AI access for Ryan Miller' }));
    const dialog = screen.getByRole('dialog', { name: 'Access for Ryan Miller' });
    // Founder-only powers are not offered.
    expect(within(dialog).queryByText('Approve or reject requests')).toBeNull();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Active/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Delete tasks/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save access' }));

    const profile = getWorkspace().accessProfiles[EMP.ryan];
    expect(profile?.status).toBe('active');
    expect(profile?.grants.some((grant) => grant.permission === 'task.delete')).toBe(true);
    expect(getWorkspace().activity.at(-1)).toMatchObject({
      eventType: 'access.changed',
      actorId: 'user',
    });
  });
});
