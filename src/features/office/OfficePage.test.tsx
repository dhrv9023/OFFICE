// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameEventBus, InteractionTarget } from '@/bridge/gameEvents';
import type { OfficeViewModel } from '@/bridge/officeViewModel';
import { commands } from '@/commands';
import { USER_ACTOR } from '@/domain/types';
import type { CreateGameOptions, GameHandle } from '@/game/createGame';
import { useUiStore } from '@/stores/uiStore';
import { getWorkspace } from '@/stores/workspace';
import { DEPT, EMP } from '@/test/factories';
import { present, unwrap } from '@/test/harness';
import { freshWorkspace } from '@/test/render';
import { OfficePage } from './OfficePage';

interface FakeGame {
  options: CreateGameOptions;
  handle: { [K in keyof GameHandle]: ReturnType<typeof vi.fn> };
}

const games: FakeGame[] = [];

vi.mock('@/game/createGame', () => ({
  createGame: (options: CreateGameOptions) => {
    const handle = {
      setViewModel: vi.fn(),
      zoomBy: vi.fn(),
      setVirtualDirection: vi.fn(),
      setBackdrop: vi.fn(),
      select: vi.fn(),
      destroy: vi.fn(),
    };
    games.push({ options, handle });
    return handle;
  },
}));

beforeEach(async () => {
  games.length = 0;
  localStorage.clear();
  useUiStore.getState().reset();
  await freshWorkspace();
});

function renderOffice(strict = false) {
  const router = createMemoryRouter([{ path: '/office', element: <OfficePage /> }], {
    initialEntries: ['/office'],
  });
  const tree = <RouterProvider router={router} />;
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

async function readyGame(): Promise<FakeGame & { bus: GameEventBus }> {
  await waitFor(() => {
    expect(games.length).toBeGreaterThan(0);
  });
  const game = present(games.at(-1));
  act(() => {
    game.options.bus.emit('scene.ready', { sceneKey: 'OfficeScene' });
  });
  return { ...game, bus: game.options.bus };
}

const lastView = (game: FakeGame) =>
  present(game.handle.setViewModel.mock.calls.at(-1))[0] as OfficeViewModel;

describe('office page', () => {
  it('creates the game once, even in StrictMode, and destroys it on unmount', async () => {
    const { unmount } = renderOffice(true);
    const game = await readyGame();
    expect(games).toHaveLength(1);
    expect(game.options.keyboardTarget).toBe(
      screen.getByRole('application', { name: 'Virtual office' }),
    );
    unmount();
    expect(game.handle.destroy).toHaveBeenCalledOnce();
    // Events after unmount are ignored (listeners were cleared).
    expect(() => {
      game.options.bus.emit('player.moved', { tile: { col: 1, row: 1 }, roomId: null });
    }).not.toThrow();
  });

  it('shows first-visit instructions that hand the keyboard to the office', async () => {
    renderOffice();
    await readyGame();
    const intro = screen.getByRole('dialog', { name: 'Welcome to your office' });
    expect(intro).toHaveTextContent(/WASD/);
    fireEvent.click(within(intro).getByRole('button', { name: 'Start exploring' }));
    expect(
      screen.queryByRole('dialog', { name: 'Welcome to your office' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('application', { name: 'Virtual office' })).toHaveFocus();
    expect(localStorage.getItem('project-hq:office-intro-seen')).toBe('true');
  });

  it('pushes the state-derived view model, and only when the office would change', async () => {
    renderOffice();
    const game = await readyGame();
    expect(lastView(game).employees).toHaveLength(5);
    const calls = game.handle.setViewModel.mock.calls.length;

    act(() => {
      unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    });
    expect(game.handle.setViewModel.mock.calls.length).toBe(calls);

    act(() => {
      const created = unwrap(commands.createProject(USER_ACTOR, { name: 'Web 2' }));
      const task = unwrap(
        commands.createTask(USER_ACTOR, {
          projectId: created.id,
          departmentId: DEPT.design,
          title: 'Design',
          assigneeId: EMP.sarah,
        }),
      );
      unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    });
    expect(game.handle.setViewModel.mock.calls.length).toBe(calls + 1);
    expect(lastView(game).employees.find((employee) => employee.id === EMP.sarah)?.status).toBe(
      'working',
    );
  });

  it('shows an overview with the location, the team and the rooms', async () => {
    renderOffice();
    const { bus } = await readyGame();
    act(() => {
      bus.emit('player.moved', { tile: { col: 9, row: 4 }, roomId: 'room_design' });
    });
    const inspector = screen.getByRole('complementary', { name: 'Office inspector' });
    expect(within(inspector).getByText('You are in')).toBeInTheDocument();
    expect(within(inspector).getByText('UI/UX Design', { selector: 'p' })).toBeInTheDocument();
    expect(within(inspector).getByText('Team · 0 of 5 working')).toBeInTheDocument();
    expect(within(inspector).getByText('You are here')).toBeInTheDocument();
    // The location chip over the canvas follows the founder too.
    expect(screen.getByRole('region', { name: 'Office floor' })).toHaveTextContent('UI/UX Design');
  });

  it('previews what the founder is standing next to', async () => {
    renderOffice();
    const { bus } = await readyGame();
    act(() => {
      bus.emit('interaction.focus', {
        target: { kind: 'employee', employeeId: EMP.sarah },
        label: 'Sarah Chen',
      });
    });
    const inspector = screen.getByRole('complementary', { name: 'Office inspector' });
    expect(within(inspector).getByText('Nearby')).toBeInTheDocument();
    expect(within(inspector).getAllByText('Sarah Chen')[0]).toBeInTheDocument();
    expect(inspector).toHaveTextContent(/Press\s*E\s*or click to open/);
  });

  it('opens an employee profile with real actions, and goes back to the overview', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    const task = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design homepage',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: task.id, status: 'in_progress' }));
    renderOffice();
    const game = await readyGame();
    act(() => {
      game.bus.emit('interaction.activate', {
        target: { kind: 'employee', employeeId: EMP.sarah },
        label: 'Sarah Chen',
        source: 'keyboard',
      });
    });
    expect(screen.getByRole('heading', { name: 'Sarah Chen' })).toBeInTheDocument();
    expect(screen.getByText('UI/UX Designer · UI/UX Design')).toBeInTheDocument();
    expect(screen.getByText('Working on')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Design homepage/ }).length).toBeGreaterThan(0);
    expect(screen.getByText('Web · In progress')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '1 open task, 0 done' })).toBeInTheDocument();
    for (const action of [
      'Assign a new task',
      /Assign an existing task/,
      'Talk',
      'Meet',
      'Rename Sarah Chen',
      'Reassign',
      'All their tasks on the board',
    ]) {
      expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
    }
    expect(
      screen.getByText('Task "Design homepage" was assigned to Sarah Chen.'),
    ).toBeInTheDocument();
    expect(useUiStore.getState().selectedEmployeeId).toBe(EMP.sarah);
    expect(game.handle.select).toHaveBeenLastCalledWith('employee:emp_sarah_chen');
    expect(lastView(game).selectedEmployeeId).toBe(EMP.sarah);

    fireEvent.click(screen.getByRole('button', { name: 'Back to overview' }));
    expect(useUiStore.getState().selectedEmployeeId).toBeNull();
    expect(game.handle.select).toHaveBeenLastCalledWith(null);
    expect(screen.getByText('You are in')).toBeInTheDocument();
  });

  it('selects someone from the team list, just like walking up to them', async () => {
    renderOffice();
    const game = await readyGame();
    const inspector = screen.getByRole('complementary', { name: 'Office inspector' });
    fireEvent.click(within(inspector).getByRole('button', { name: /Ryan Miller/ }));
    expect(screen.getByRole('heading', { name: 'Ryan Miller' })).toBeInTheDocument();
    expect(game.handle.select).toHaveBeenLastCalledWith('employee:emp_ryan_miller');
  });

  it('describes departments, the meeting room and objects with live data', async () => {
    unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    renderOffice();
    const { bus } = await readyGame();
    const activate = (target: InteractionTarget, label: string) => {
      act(() => {
        bus.emit('interaction.activate', {
          target,
          label,
          source: 'pointer',
        });
      });
    };

    activate(
      { kind: 'room_entrance', roomId: 'room_frontend', doorId: 'door_frontend' },
      'Frontend Development entrance',
    );
    expect(screen.getByRole('heading', { name: 'Frontend Development' })).toBeInTheDocument();
    expect(screen.getByText('People · 1')).toBeInTheDocument();
    expect(screen.getByText('Ryan Miller')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open the task board' })).toBeInTheDocument();

    activate(
      { kind: 'room_entrance', roomId: 'room_meeting', doorId: 'door_meeting' },
      'Meeting Room entrance',
    );
    expect(screen.getByRole('heading', { name: 'Meeting Room' })).toBeInTheDocument();
    expect(screen.getByText(/5 seats around a shared table/)).toBeInTheDocument();

    activate(
      {
        kind: 'object',
        objectId: 'mgmt_board',
        objectKind: 'project_board',
        roomId: 'room_management',
      },
      'Project board',
    );
    expect(screen.getByRole('heading', { name: 'Project board' })).toBeInTheDocument();
    const projects = screen.getByText('Projects', { selector: 'dt' }).closest('div');
    expect(projects?.querySelector('dd')).toHaveTextContent('1');
  });

  it('forwards zoom buttons and the touch direction pad to the game', async () => {
    renderOffice();
    const game = await readyGame();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(game.handle.zoomBy).toHaveBeenCalledWith(1);
    const up = screen.getByRole('button', { name: 'Walk up' });
    up.setPointerCapture = vi.fn();
    fireEvent.pointerDown(up, { pointerId: 1 });
    expect(game.handle.setVirtualDirection).toHaveBeenLastCalledWith(
      expect.objectContaining({ up: true }) as unknown,
    );
    fireEvent.pointerUp(up, { pointerId: 1 });
    expect(game.handle.setVirtualDirection).toHaveBeenLastCalledWith(null);
  });
});

describe('managing the workforce from the office (Phase 1.6)', () => {
  async function openEmployee(employeeId: (typeof EMP)[keyof typeof EMP], label: string) {
    renderOffice();
    const game = await readyGame();
    act(() => {
      game.bus.emit('interaction.activate', {
        target: { kind: 'employee', employeeId },
        label,
        source: 'keyboard',
      });
    });
    return game;
  }

  const dialog = (name: string | RegExp) => screen.getByRole('dialog', { name });

  it('assigns a new task with the employee preselected, through the createTask command', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    unwrap(
      commands.updateProject(USER_ACTOR, { projectId: project.id, patch: { status: 'active' } }),
    );
    await openEmployee(EMP.sarah, 'Sarah Chen');

    fireEvent.click(screen.getByRole('button', { name: 'Assign a new task' }));
    const form = dialog('New task for Sarah Chen');
    expect(within(form).getByLabelText('Department')).toHaveValue(DEPT.design);
    expect(within(form).getByRole('radio', { name: /Sarah Chen/ })).toBeChecked();
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Pricing page' } });
    fireEvent.change(within(form).getByLabelText('Deadline'), { target: { value: '2026-12-18' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create task' }));

    const task = present(
      Object.values(getWorkspace().tasks).find((t) => t.title === 'Pricing page'),
    );
    expect(task).toMatchObject({
      assigneeId: EMP.sarah,
      departmentId: DEPT.design,
      projectId: project.id,
      deadline: '2026-12-18',
      status: 'todo',
    });
    const { activity, notifications } = getWorkspace();
    expect(activity.at(-1)?.description).toBe('Task "Pricing page" was assigned to Sarah Chen.');
    expect(notifications.at(-1)).toMatchObject({
      title: 'Task assigned',
      message: 'Sarah Chen was assigned "Pricing page".',
    });
    // The profile follows the shared state immediately.
    expect(screen.getByText('Open tasks · 1')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Pricing page/ }).length).toBeGreaterThan(0);
  });

  it('shows the real validation reason when a new task cannot be created', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    await openEmployee(EMP.sarah, 'Sarah Chen');
    fireEvent.click(screen.getByRole('button', { name: 'Assign a new task' }));
    const form = dialog('New task for Sarah Chen');
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: '   ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Create task' }));
    expect(within(form).getByText('Task title is required.')).toBeInTheDocument();
    expect(Object.values(getWorkspace().tasks).filter((t) => t.projectId === project.id)).toEqual(
      [],
    );
  });

  it('assigns an existing unassigned task, explaining which ones are not possible', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    const create = (title: string, departmentId: (typeof DEPT)[keyof typeof DEPT]) =>
      unwrap(commands.createTask(USER_ACTOR, { projectId: project.id, departmentId, title }));
    const design = create('Moodboard', DEPT.design);
    create('API schema', DEPT.backend);
    await openEmployee(EMP.sarah, 'Sarah Chen');

    fireEvent.click(screen.getByRole('button', { name: /Assign an existing task/ }));
    const form = dialog('Assign a task to Sarah Chen');
    const backend = within(form).getByRole('radio', { name: /API schema/ });
    expect(backend).toBeDisabled();
    expect(
      within(form).getByText('Sarah Chen is not in the department that owns this task.'),
    ).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('radio', { name: /Moodboard/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Assign task' }));
    expect(getWorkspace().tasks[design.id]?.assigneeId).toBe(EMP.sarah);
    expect(getWorkspace().activity.at(-1)?.eventType).toBe('task.assigned');
  });

  it('reassigns a task, and shows the domain reason when the new assignee cannot take it', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Web' }));
    const busy = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.frontend,
        title: 'Build header',
        assigneeId: EMP.ryan,
      }),
    );
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: busy.id, status: 'in_progress' }));
    const active = unwrap(
      commands.createTask(USER_ACTOR, {
        projectId: project.id,
        departmentId: DEPT.design,
        title: 'Design header',
        assigneeId: EMP.sarah,
      }),
    );
    unwrap(commands.changeTaskStatus(USER_ACTOR, { taskId: active.id, status: 'in_progress' }));
    await openEmployee(EMP.sarah, 'Sarah Chen');

    fireEvent.click(screen.getByRole('button', { name: 'Reassign' }));
    const form = dialog('Reassign task');
    fireEvent.click(within(form).getByRole('checkbox', { name: /another department/i }));
    expect(within(form).getByRole('radio', { name: /Ryan Miller/ })).toBeDisabled();
    expect(
      within(form).getByText('Ryan Miller is already working on "Build header".'),
    ).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('radio', { name: /Emma Wilson/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Reassign' }));
    expect(getWorkspace().tasks[active.id]?.assigneeId).toBe(EMP.emma);
    expect(getWorkspace().activity.at(-1)?.description).toBe(
      'Task "Design header" was reassigned from Sarah Chen to Emma Wilson.',
    );
    // Sarah is free again and Emma is working: the office view model follows.
    expect(screen.getByText('Free to take on new work.')).toBeInTheDocument();
  });

  it('renames an employee; the profile, team list and office labels all follow', async () => {
    const game = await openEmployee(EMP.sarah, 'Sarah Chen');
    fireEvent.click(screen.getByRole('button', { name: 'Rename Sarah Chen' }));
    const form = dialog('Rename employee');
    expect(within(form).getByText('Sarah Chen')).toBeInTheDocument();
    const field = within(form).getByLabelText('New name');

    fireEvent.change(field, { target: { value: '   ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(within(form).getByText('Name is required.')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: 'x'.repeat(81) } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(within(form).getByText('Name must be 80 characters or fewer.')).toBeInTheDocument();

    fireEvent.change(field, { target: { value: '  Sarah Lee ' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(screen.queryByRole('dialog', { name: 'Rename employee' })).toBeNull();

    expect(getWorkspace().employees[EMP.sarah]).toMatchObject({ id: EMP.sarah, name: 'Sarah Lee' });
    expect(screen.getByRole('heading', { name: 'Sarah Lee' })).toBeInTheDocument();
    expect(screen.getByText('Sarah Chen was renamed to Sarah Lee.')).toBeInTheDocument();
    const sprite = lastView(game).employees.find((employee) => employee.id === EMP.sarah);
    expect(sprite).toMatchObject({ name: 'Sarah Lee', avatarId: 'avatar_sarah_chen' });
  });

  it('opens Talk without pretending the employee can answer', async () => {
    await openEmployee(EMP.ryan, 'Ryan Miller');
    fireEvent.click(screen.getByRole('button', { name: 'Talk' }));
    expect(screen.getByRole('note')).toHaveTextContent(
      'Ryan Miller is not connected to an AI agent yet',
    );
    expect(screen.getByRole('textbox', { name: /not available yet/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Ryan Miller' }));
    expect(screen.getByRole('button', { name: 'Assign a new task' })).toBeInTheDocument();
  });
});

describe('meeting room (Phase 1.6)', () => {
  async function openMeetingRoom() {
    renderOffice();
    const game = await readyGame();
    act(() => {
      game.bus.emit('interaction.activate', {
        target: { kind: 'room_entrance', roomId: 'room_meeting', doorId: 'door_meeting' },
        label: 'Meeting Room entrance',
        source: 'keyboard',
      });
    });
  }

  it('schedules a meeting with chosen participants, then records it as held', async () => {
    await openMeetingRoom();
    expect(screen.getByText('Nothing scheduled in this room.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    const form = screen.getByRole('dialog', { name: 'Schedule a meeting' });
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Kick-off' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule meeting' }));
    expect(within(form).getByText('Invite at least one employee.')).toBeInTheDocument();

    fireEvent.click(within(form).getByRole('checkbox', { name: /Sarah Chen/ }));
    fireEvent.click(within(form).getByRole('checkbox', { name: /Ryan Miller/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule meeting' }));

    const meeting = present(Object.values(getWorkspace().meetings)[0]);
    expect(meeting).toMatchObject({
      title: 'Kick-off',
      status: 'scheduled',
      participantIds: [EMP.sarah, EMP.ryan],
    });
    expect(screen.getByText('Upcoming · 1')).toBeInTheDocument();
    expect(screen.getByText(/Sarah Chen, Ryan Miller/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mark as held' }));
    const held = screen.getByRole('dialog', { name: 'Mark as held' });
    fireEvent.change(within(held).getByLabelText('Notes'), {
      target: { value: 'Ship the hero first.' },
    });
    fireEvent.click(within(held).getByRole('button', { name: 'Mark as held' }));

    expect(getWorkspace().meetings[meeting.id]).toMatchObject({
      status: 'completed',
      notes: 'Ship the hero first.',
    });
    expect(screen.getByText('Ship the hero first.')).toBeInTheDocument();
    expect(screen.getByText('Held')).toBeInTheDocument();
  });

  it('cancels a meeting after confirmation and keeps the record', async () => {
    unwrap(
      commands.scheduleMeeting(USER_ACTOR, {
        title: 'Retro',
        participantIds: [EMP.emma],
        roomId: 'room_meeting',
        startsAt: '2026-12-01T10:00',
        durationMinutes: 30,
      }),
    );
    await openMeetingRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel meeting' }));
    expect(Object.values(getWorkspace().meetings)[0]?.status).toBe('cancelled');
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
  });
});

describe('meeting times, lifecycle and presence (Phase 1.7)', () => {
  async function openMeetingRoom() {
    renderOffice();
    const game = await readyGame();
    act(() => {
      game.bus.emit('interaction.activate', {
        target: { kind: 'room_entrance', roomId: 'room_meeting', doorId: 'door_meeting' },
        label: 'Meeting Room entrance',
        source: 'keyboard',
      });
    });
    return game;
  }

  it('schedules with a date, time, duration and project, and refuses a clash with the reason', async () => {
    const project = unwrap(commands.createProject(USER_ACTOR, { name: 'Website' }));
    unwrap(
      commands.scheduleMeeting(USER_ACTOR, {
        title: 'Design review',
        participantIds: [EMP.sarah],
        roomId: 'room_meeting',
        startsAt: '2099-03-02T10:00',
        durationMinutes: 60,
      }),
    );
    await openMeetingRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    const form = screen.getByRole('dialog', { name: 'Schedule a meeting' });
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Planning' } });
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2099-03-02' } });
    fireEvent.change(within(form).getByLabelText('Start time'), { target: { value: '10:30' } });
    fireEvent.change(within(form).getByLabelText('Duration'), { target: { value: '30' } });
    fireEvent.change(within(form).getByLabelText(/^Project/), { target: { value: project.id } });
    // Live availability uses the same rule as the command.
    expect(within(form).getByText('Busy: in “Design review”')).toBeInTheDocument();
    fireEvent.click(within(form).getByRole('checkbox', { name: /Sarah Chen/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule meeting' }));
    expect(
      within(form).getByText(
        'Sarah Chen is already in "Design review" at that time. Choose another time or other people.',
      ),
    ).toBeInTheDocument();

    fireEvent.change(within(form).getByLabelText('Start time'), { target: { value: '11:00' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule meeting' }));
    const planning = present(
      Object.values(getWorkspace().meetings).find((meeting) => meeting.title === 'Planning'),
    );
    expect(planning).toMatchObject({
      startsAt: '2099-03-02T11:00',
      durationMinutes: 30,
      projectId: project.id,
      participantIds: [EMP.sarah],
    });
  });

  it('refuses a time that has already passed', async () => {
    await openMeetingRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Schedule a meeting' }));
    const form = screen.getByRole('dialog', { name: 'Schedule a meeting' });
    fireEvent.change(within(form).getByLabelText('Title'), { target: { value: 'Retro' } });
    fireEvent.change(within(form).getByLabelText('Date'), { target: { value: '2020-01-01' } });
    fireEvent.click(within(form).getByRole('checkbox', { name: /Emma Wilson/ }));
    fireEvent.click(within(form).getByRole('button', { name: 'Schedule meeting' }));
    expect(within(form).getByText('Choose a time that has not passed yet.')).toBeInTheDocument();
    expect(Object.values(getWorkspace().meetings)).toEqual([]);
  });

  it('starts a meeting: participants move to the meeting room in the office and their profile says so', async () => {
    const meeting = unwrap(
      commands.scheduleMeeting(USER_ACTOR, {
        title: 'Kick-off',
        participantIds: [EMP.ryan],
        roomId: 'room_meeting',
        startsAt: '2099-03-02T10:00',
        durationMinutes: 30,
      }),
    );
    const game = await openMeetingRoom();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(getWorkspace().meetings[meeting.id]?.status).toBe('in_progress');
    expect(screen.getByText('In progress', { selector: 'h2' })).toBeInTheDocument();
    const ryan = lastView(game).employees.find((employee) => employee.id === EMP.ryan);
    expect(ryan).toMatchObject({ presence: 'in_meeting' });

    act(() => {
      game.bus.emit('interaction.activate', {
        target: { kind: 'employee', employeeId: EMP.ryan },
        label: 'Ryan Miller',
        source: 'pointer',
      });
    });
    expect(screen.getByText('In a meeting: Kick-off')).toBeInTheDocument();
  });
});
