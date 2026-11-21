import { beforeEach, describe, expect, it } from 'vitest';
import type { EmployeeId, ProjectId, TaskId } from '@/domain/ids';
import { defaultGrants } from '@/domain/rules/access';
import { USER_ACTOR, type RequestedAction, type WorkspaceState } from '@/domain/types';
import { DEPT, EMP } from '@/test/factories';
import { createHarness, expectError, present, unwrap, type Harness } from '@/test/harness';

/*
 * The execution pipeline for AI employees: requests, approvals, the execution
 * registry, idempotency and retries. Controlled test actors only; no AI.
 */

let h: Harness;
let projectId: ProjectId;
let ryansTask: TaskId;
let sarahsTask: TaskId;

const business = (state: WorkspaceState) => ({
  projects: state.projects,
  tasks: state.tasks,
  employees: state.employees,
  meetings: state.meetings,
});

beforeEach(() => {
  h = createHarness();
  projectId = unwrap(h.commands.createProject(USER_ACTOR, { name: 'Website' })).id;
  unwrap(h.commands.updateProject(USER_ACTOR, { projectId, patch: { status: 'active' } }));
  ryansTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.frontend,
      title: 'Build header',
      assigneeId: EMP.ryan,
    }),
  ).id;
  sarahsTask = unwrap(
    h.commands.createTask(USER_ACTOR, {
      projectId,
      departmentId: DEPT.design,
      title: 'Design header',
      assigneeId: EMP.sarah,
    }),
  ).id;
  for (const employeeId of [EMP.ryan, EMP.alex] as EmployeeId[]) {
    unwrap(h.commands.updateAccessProfile(USER_ACTOR, { employeeId, status: 'active' }));
  }
});

/** Lets the project manager delete tasks (still subject to the approval policy). */
const letAlexDelete = () =>
  unwrap(
    h.commands.updateAccessProfile(USER_ACTOR, {
      employeeId: EMP.alex,
      grants: [
        ...defaultGrants({ departmentId: DEPT.management }),
        { permission: 'task.delete', scope: 'any', requiresApproval: false },
      ],
    }),
  );

const deleteSarahsTask: RequestedAction = { type: 'deleteTask', input: { taskId: '' } };
const deleting = (taskId: TaskId): RequestedAction => ({ ...deleteSarahsTask, input: { taskId } });

describe('requesting actions', () => {
  it('runs an allowed action and records it', () => {
    const outcome = unwrap(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'in_progress' } },
          { requestId: 'r-1' },
        ),
    );
    expect(outcome.execution).toMatchObject({
      status: 'succeeded',
      actorId: EMP.ryan,
      requestId: 'r-1',
      summary: 'Move "Build header" to In progress',
      target: { type: 'task', id: ryansTask },
      approvalId: null,
      error: null,
    });
    expect(h.state().tasks[ryansTask]?.status).toBe('in_progress');
    expect(h.state().executions.at(-1)).toEqual(outcome.execution);
    expect(h.state().activity.at(-1)).toMatchObject({
      actorId: EMP.ryan,
      eventType: 'task.status_changed',
    });
    h.expectConsistent();
  });

  it('records a denied action and changes no business data', () => {
    const before = business(h.state());
    const outcome = unwrap(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: sarahsTask, status: 'in_progress' } },
          { requestId: 'r-2' },
        ),
    );
    expect(outcome.execution).toMatchObject({
      status: 'denied',
      error: { code: 'permission_denied' },
    });
    expect(business(h.state())).toEqual(before);
  });

  it('records an action the domain rules reject, with the reason', () => {
    const outcome = unwrap(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'done' } },
          { requestId: 'r-3' },
        ),
    );
    expect(outcome.execution.status).toBe('failed');
    expect(outcome.execution.error?.code).toBe('invalid_transition');
    expect(h.state().tasks[ryansTask]?.status).toBe('todo');
  });

  it('refuses malformed requests and actions an employee may never request', () => {
    expectError(
      h.gatewayFor(EMP.ryan).request(deleting(ryansTask), { requestId: ' ' }),
      'validation',
    );
    expectError(
      h
        .gatewayFor(EMP.ryan)
        .request({ type: 'updateAccessProfile', input: {} }, { requestId: 'x' }),
      'validation',
    );
    expectError(
      h.executor.request({ employeeId: 'emp_ghost', action: deleting(ryansTask), requestId: 'x' }),
      'invalid_actor',
    );
  });
});

describe('approvals', () => {
  beforeEach(letAlexDelete);

  const requestDelete = (requestId = 'd-1') => {
    const outcome = unwrap(
      h.gatewayFor(EMP.alex).request(deleting(sarahsTask), {
        requestId,
        reason: 'Duplicate of the hero task.',
      }),
    );
    return { ...outcome, approval: present(outcome.approval, 'approval request') };
  };

  it('creates a pending request, applies nothing and tells the founder', () => {
    const before = business(h.state());
    const outcome = requestDelete();
    expect(outcome.execution.status).toBe('awaiting_approval');
    expect(outcome.approval).toMatchObject({
      status: 'pending',
      requesterId: EMP.alex,
      summary: 'Delete task "Design header"',
      reason: 'Duplicate of the hero task.',
      policyReason: 'Deleting a task always needs the founder.',
    });
    expect(business(h.state())).toEqual(before);
    expect(h.state().notifications.at(-1)).toMatchObject({
      title: 'Approval needed',
      relatedEntityId: outcome.approval.id,
    });
    h.expectConsistent();
  });

  it('applies the exact action once the founder approves, and never twice', () => {
    const { approval } = requestDelete();
    const decided = unwrap(
      h.commands.approveRequest(USER_ACTOR, { approvalId: approval.id, note: 'Fine.' }),
    );
    expect(decided.approval).toMatchObject({
      status: 'approved',
      decidedBy: 'user',
      decisionNote: 'Fine.',
    });
    expect(decided.execution?.status).toBe('succeeded');
    expect(h.state().tasks[sarahsTask]).toBeUndefined();
    // The deletion is attributed to the employee who asked; the approval to the founder.
    const types = h
      .state()
      .activity.slice(-2)
      .map((event) => [event.eventType, event.actorId]);
    expect(types).toEqual([
      ['task.deleted', EMP.alex],
      ['approval.approved', 'user'],
    ]);

    const again = expectError(
      h.commands.approveRequest(USER_ACTOR, { approvalId: approval.id }),
      'conflict',
    );
    expect(again.reason).toBe('approval_closed');
    h.expectConsistent();
  });

  it('never runs a rejected request', () => {
    const { approval } = requestDelete();
    unwrap(h.commands.rejectRequest(USER_ACTOR, { approvalId: approval.id, note: 'Keep it.' }));
    expect(h.state().tasks[sarahsTask]).toBeDefined();
    expect(h.state().executions.at(-1)?.status).toBe('rejected');
    expectError(h.commands.approveRequest(USER_ACTOR, { approvalId: approval.id }), 'conflict');
    expect(h.state().tasks[sarahsTask]).toBeDefined();
  });

  it('lets only the requester withdraw their request', () => {
    const { approval } = requestDelete();
    expectError(h.gatewayFor(EMP.ryan).cancel(approval.id), 'permission_denied');
    unwrap(h.gatewayFor(EMP.alex).cancel(approval.id));
    expect(h.state().approvals.at(-1)).toMatchObject({ status: 'cancelled', decidedBy: EMP.alex });
    expect(h.state().executions.at(-1)?.status).toBe('cancelled');
  });

  it('forbids self-approval: no employee can decide requests', () => {
    const { approval } = requestDelete();
    expectError(
      h.commands.approveRequest(
        { kind: 'agent', employeeId: EMP.alex },
        { approvalId: approval.id },
      ),
      'permission_denied',
    );
    expect(h.state().approvals.at(-1)?.status).toBe('pending');
  });

  it('marks a request stale if its target changed, and applies nothing', () => {
    const { approval } = requestDelete();
    unwrap(
      h.commands.updateTask(USER_ACTOR, { taskId: sarahsTask, patch: { title: 'Design hero' } }),
    );
    const decided = unwrap(h.commands.approveRequest(USER_ACTOR, { approvalId: approval.id }));
    expect(decided.approval.status).toBe('stale');
    expect(decided.approval.decisionNote).toContain('changed after the request was made');
    expect(decided.execution).toMatchObject({ status: 'failed', error: { code: 'conflict' } });
    expect(h.state().tasks[sarahsTask]?.title).toBe('Design hero');
  });

  it('marks a request stale if the requester lost the permission meanwhile', () => {
    const { approval } = requestDelete();
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.alex, status: 'suspended' }),
    );
    const decided = unwrap(h.commands.approveRequest(USER_ACTOR, { approvalId: approval.id }));
    expect(decided.approval.status).toBe('stale');
    expect(h.state().tasks[sarahsTask]).toBeDefined();
  });
});

describe('idempotency and retries', () => {
  it('returns the existing result for a repeated request and does nothing again', () => {
    const create = {
      type: 'createTask' as const,
      input: { projectId, departmentId: DEPT.frontend, title: 'Footer', assigneeId: EMP.ryan },
    };
    const first = unwrap(h.gatewayFor(EMP.ryan).request(create, { requestId: 'same' }));
    const tasks = Object.keys(h.state().tasks).length;
    const commits = h.commits();
    const second = unwrap(h.gatewayFor(EMP.ryan).request(create, { requestId: 'same' }));
    expect(second.duplicate).toBe(true);
    expect(second.execution).toEqual(first.execution);
    expect(Object.keys(h.state().tasks)).toHaveLength(tasks);
    expect(h.commits()).toBe(commits);
  });

  it('refuses a request ID reused for a different action', () => {
    unwrap(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'in_progress' } },
          { requestId: 'k' },
        ),
    );
    const error = expectError(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'blocked' } },
          { requestId: 'k' },
        ),
      'conflict',
    );
    expect(error.reason).toBe('idempotency_conflict');
  });

  it('retries a failed action only explicitly, through the whole pipeline', () => {
    const failed = unwrap(
      h
        .gatewayFor(EMP.ryan)
        .request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'in_review' } },
          { requestId: 'early' },
        ),
    ).execution;
    expect(failed.status).toBe('failed');
    unwrap(h.commands.changeTaskStatus(USER_ACTOR, { taskId: ryansTask, status: 'in_progress' }));

    const retried = unwrap(h.gatewayFor(EMP.ryan).retry(failed.id, 'early-retry'));
    expect(retried.execution).toMatchObject({ status: 'succeeded', retryOf: failed.id });
    expect(h.state().tasks[ryansTask]?.status).toBe('in_review');

    // A succeeded action never runs twice, and nobody retries someone else's request.
    expectError(h.gatewayFor(EMP.ryan).retry(retried.execution.id, 'again'), 'conflict');
    expectError(h.gatewayFor(EMP.alex).retry(failed.id, 'theirs'), 'permission_denied');
  });

  it('does not let a retry skip approval', () => {
    letAlexDelete();
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, { employeeId: EMP.alex, status: 'suspended' }),
    );
    const denied = unwrap(
      h.gatewayFor(EMP.alex).request(deleting(sarahsTask), { requestId: 'del' }),
    );
    expect(denied.execution.status).toBe('denied');
    // Denied is not "failed": a new request is needed, and it would need approval.
    expectError(h.gatewayFor(EMP.alex).retry(denied.execution.id, 'del-2'), 'conflict');
  });
});

describe('the acceptance scenario: a limited AI employee', () => {
  it('may update its own task; everything else is refused or routed to approval, even bypassing the UI', () => {
    const ryan = h.gatewayFor(EMP.ryan);
    const before = () => business(h.state());

    // 1. Update its own assigned task: allowed by its profile.
    expect(
      unwrap(
        ryan.request(
          { type: 'changeTaskStatus', input: { taskId: ryansTask, status: 'in_progress' } },
          { requestId: 's-1' },
        ),
      ).execution.status,
    ).toBe('succeeded');

    // 2. Assign a task to another employee: outside its scope.
    let snapshot = before();
    expect(
      unwrap(
        ryan.request(
          {
            type: 'assignTask',
            input: { taskId: sarahsTask, assigneeId: EMP.emma, allowCrossDepartment: true },
          },
          { requestId: 's-2' },
        ),
      ).execution.status,
    ).toBe('denied');
    expect(before()).toEqual(snapshot);

    // 3. Delete a task: no grant.
    expect(unwrap(ryan.request(deleting(ryansTask), { requestId: 's-3' })).execution.status).toBe(
      'denied',
    );

    // 4. Archive a project: no grant.
    expect(
      unwrap(
        ryan.request(
          { type: 'updateProject', input: { projectId, patch: { status: 'archived' } } },
          { requestId: 's-4' },
        ),
      ).execution.status,
    ).toBe('denied');

    // 5. Reset the workspace: not an action an employee can even ask for.
    expectError(
      ryan.request({ type: 'resetWorkspace' as never, input: {} }, { requestId: 's-5' }),
      'validation',
    );
    expect(Object.keys(ryan)).toEqual([
      'employeeId',
      'request',
      'retry',
      'cancel',
      'statusOf',
      'approvalFor',
    ]);

    // Bypassing the gateway and calling the commands directly changes nothing either.
    snapshot = before();
    const RYAN = { kind: 'agent' as const, employeeId: EMP.ryan };
    expectError(
      h.commands.assignTask(RYAN, { taskId: sarahsTask, assigneeId: EMP.ryan }),
      'permission_denied',
    );
    expectError(h.commands.deleteTask(RYAN, { taskId: ryansTask }), 'permission_denied');
    expectError(
      h.commands.updateProject(RYAN, { projectId, patch: { status: 'archived' } }),
      'permission_denied',
    );
    expectError(
      h.commands.updateAccessProfile(RYAN, { employeeId: EMP.ryan, status: 'active' }),
      'permission_denied',
    );
    expect(before()).toEqual(snapshot);

    // With a delete grant, deleting is routed to the founder instead of running.
    unwrap(
      h.commands.updateAccessProfile(USER_ACTOR, {
        employeeId: EMP.ryan,
        grants: [
          ...defaultGrants({ departmentId: DEPT.frontend }),
          { permission: 'task.delete', scope: 'own', requiresApproval: false },
        ],
      }),
    );
    const routed = unwrap(ryan.request(deleting(ryansTask), { requestId: 's-6' }));
    expect(routed.execution.status).toBe('awaiting_approval');
    expect(h.state().tasks[ryansTask]).toBeDefined();
    expectError(h.commands.deleteTask(RYAN, { taskId: ryansTask }), 'approval_required');
    expect(h.state().tasks[ryansTask]).toBeDefined();

    // Every attempt through the pipeline is on record.
    expect(h.state().executions.map((execution) => execution.status)).toEqual([
      'succeeded',
      'denied',
      'denied',
      'denied',
      'awaiting_approval',
    ]);
    h.expectConsistent();
  });
});
