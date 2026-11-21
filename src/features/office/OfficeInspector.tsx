import {
  ArrowLeft,
  Building2,
  Coffee,
  FolderKanban,
  Gamepad2,
  ListChecks,
  Presentation,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/navigation';
import type { InteractionTarget } from '@/bridge/gameEvents';
import { Avatar } from '@/components/Avatar';
import { Button, IconButton } from '@/components/Button';
import { cn } from '@/components/cn';
import { StatusIndicator } from '@/components/StatusIndicator';
import type { EmployeeId, RoomId } from '@/domain/ids';
import { OFFICE_LAYOUT } from '@/domain/seed';
import type { Room, WorkspaceState } from '@/domain/types';
import { WORK_STATUS } from '@/features/common/presentation';
import { selectEmployeeSummaries, type EmployeeSummary } from '@/stores/selectors';
import { useWorkspace } from '@/stores/workspace';
import { EmployeeProfile } from './EmployeeProfile';
import { Header, IconTile, Section, Stat } from './inspectorParts';
import { MeetingRoomPanel } from './MeetingRoomPanel';
import { Kbd } from './OfficeCanvas';

interface OfficeInspectorProps {
  /** What the founder opened (E or click), or null for the overview. */
  active: InteractionTarget | null;
  /** What the founder is standing next to right now. */
  nearby: { target: InteractionTarget; label: string } | null;
  /** The room the founder is in. */
  roomId: RoomId | null;
  /** Opens an employee from the team list (same as interacting with them). */
  onSelectEmployee: (employeeId: EmployeeId) => void;
  onBack: () => void;
  className?: string;
}

/**
 * The office's contextual inspector. With nothing open it is an overview (where
 * you are, who is doing what, the rooms, the controls); otherwise it describes
 * the person, room or object you opened. It shows live application data and
 * offers only actions the application already supports.
 */
export function OfficeInspector({
  active,
  nearby,
  roomId,
  onSelectEmployee,
  onBack,
  className,
}: OfficeInspectorProps) {
  const workspace = useWorkspace((state) => state);
  const team = useMemo(() => selectEmployeeSummaries(workspace), [workspace]);

  return (
    <aside
      aria-label="Office inspector"
      className={cn('flex min-h-0 flex-col overflow-y-auto bg-surface', className)}
    >
      {active ? (
        <>
          <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
            <IconButton icon={ArrowLeft} label="Back to overview" onClick={onBack} />
            <span className="text-sm text-muted">{KIND_LABEL[active.kind]}</span>
          </div>
          <Detail target={active} workspace={workspace} team={team} />
        </>
      ) : (
        <Overview
          nearby={nearby}
          roomId={roomId}
          workspace={workspace}
          team={team}
          onSelectEmployee={onSelectEmployee}
        />
      )}
    </aside>
  );
}

const KIND_LABEL: Readonly<Record<InteractionTarget['kind'], string>> = {
  employee: 'Employee',
  desk: 'Desk',
  room_entrance: 'Room',
  object: 'Object',
};

/* ───────────────────────── Overview ───────────────────────── */

function Overview({
  nearby,
  roomId,
  workspace,
  team,
  onSelectEmployee,
}: {
  nearby: OfficeInspectorProps['nearby'];
  roomId: RoomId | null;
  workspace: WorkspaceState;
  team: readonly EmployeeSummary[];
  onSelectEmployee: (employeeId: EmployeeId) => void;
}) {
  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === roomId) ?? null;
  const working = team.filter((member) => member.status === 'working').length;
  const upcoming = Object.values(workspace.meetings).filter(
    (meeting) => meeting.status === 'scheduled',
  ).length;

  return (
    <>
      {nearby ? (
        <Section title="Nearby">
          <Preview target={nearby.target} label={nearby.label} workspace={workspace} team={team} />
          <p className="mt-3 text-xs text-subtle">
            Press <Kbd>E</Kbd> or click to open.
          </p>
        </Section>
      ) : null}

      <Section title="You are in">
        <p className="text-base font-semibold">{room?.name ?? 'The office'}</p>
        <p className="mt-0.5 text-sm text-muted">
          {room ? roomDescription(room, workspace) : 'Walk around to explore.'}
        </p>
      </Section>

      <Section title="Run your company from here">
        <p className="text-sm text-muted">
          Walk up to someone and press <Kbd>E</Kbd> to give them work, reassign tasks, rename them
          or plan a meeting. The meeting room door opens the meeting planner.
        </p>
        {upcoming > 0 ? (
          <p className="mt-2 text-sm">
            <span className="font-medium tabular-nums">{upcoming}</span>{' '}
            <span className="text-muted">
              {upcoming === 1 ? 'meeting' : 'meetings'} scheduled in the meeting room
            </span>
          </p>
        ) : null}
      </Section>

      <Section title={`Team · ${working} of ${team.length} working`}>
        <ul className="-mx-2 flex flex-col">
          {team.map(({ employee, department, status }) => (
            <li key={employee.id}>
              <button
                type="button"
                onClick={() => {
                  onSelectEmployee(employee.id);
                }}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
              >
                <Avatar avatarId={employee.avatarId} color={department?.color} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{employee.name}</span>
                  <span className="block truncate text-xs text-muted">{employee.role}</span>
                </span>
                <StatusIndicator
                  tone={WORK_STATUS[status].tone}
                  label={WORK_STATUS[status].label}
                />
              </button>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Rooms">
        <ul className="flex flex-col gap-1.5">
          {OFFICE_LAYOUT.rooms
            .filter((candidate) => candidate.kind !== 'corridor')
            .map((candidate) => {
              const color = candidate.departmentId
                ? workspace.departments[candidate.departmentId]?.color
                : undefined;
              const here = candidate.id === roomId;
              return (
                <li key={candidate.id} className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: color ?? 'var(--color-line-strong)' }}
                  />
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate',
                      here ? 'font-medium text-content' : 'text-muted',
                    )}
                  >
                    {candidate.name}
                  </span>
                  {here ? (
                    <span className="text-xs font-medium text-accent-strong">You are here</span>
                  ) : null}
                </li>
              );
            })}
        </ul>
      </Section>

      <Section title="Controls">
        <dl className="flex flex-col gap-2 text-sm">
          <ControlRow label="Walk">
            <Kbd>WASD</Kbd> <Kbd>↑↓←→</Kbd>
          </ControlRow>
          <ControlRow label="Interact">
            <Kbd>E</Kbd>
          </ControlRow>
          <ControlRow label="Zoom">
            <Kbd>+</Kbd> <Kbd>−</Kbd>
          </ControlRow>
        </dl>
      </Section>
    </>
  );
}

function ControlRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** A compact description of what the founder is standing next to. */
function Preview({
  target,
  label,
  workspace,
  team,
}: {
  target: InteractionTarget;
  label: string;
  workspace: WorkspaceState;
  team: readonly EmployeeSummary[];
}) {
  if (target.kind === 'employee') {
    const member = team.find((item) => item.employee.id === target.employeeId);
    if (member) {
      return (
        <div className="flex items-center gap-3">
          <Avatar avatarId={member.employee.avatarId} color={member.department?.color} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{member.employee.name}</p>
            <p className="truncate text-xs text-muted">
              {member.employee.role} · {member.department?.name}
            </p>
          </div>
          <StatusIndicator
            tone={WORK_STATUS[member.status].tone}
            label={WORK_STATUS[member.status].label}
          />
        </div>
      );
    }
  }
  const { icon: Icon, subtitle } = describeTarget(target, workspace);
  return (
    <div className="flex items-center gap-3">
      <IconTile icon={Icon} />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{label}</p>
        <p className="truncate text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}

/* ───────────────────────── Details ───────────────────────── */

function Detail({
  target,
  workspace,
  team,
}: {
  target: InteractionTarget;
  workspace: WorkspaceState;
  team: readonly EmployeeSummary[];
}) {
  switch (target.kind) {
    case 'employee': {
      const member = team.find((item) => item.employee.id === target.employeeId);
      return member ? (
        <EmployeeProfile member={member} team={team} workspace={workspace} />
      ) : (
        <Section>
          <p className="text-sm text-muted">This person no longer works here.</p>
        </Section>
      );
    }
    case 'desk':
      return (
        <Header icon={Building2} title="Empty desk" subtitle="Nobody works at this desk yet." />
      );
    case 'room_entrance':
      return <RoomDetails roomId={target.roomId} workspace={workspace} team={team} />;
    case 'object':
      return <ObjectDetails target={target} workspace={workspace} />;
  }
}

function RoomDetails({
  roomId,
  workspace,
  team,
}: {
  roomId: RoomId;
  workspace: WorkspaceState;
  team: readonly EmployeeSummary[];
}) {
  const navigate = useNavigate();
  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === roomId);
  if (!room) return <Header icon={Building2} title="Room" subtitle="This room no longer exists." />;
  if (room.kind === 'meeting') return <MeetingRoomPanel roomId={room.id} workspace={workspace} />;

  const department = room.departmentId ? workspace.departments[room.departmentId] : undefined;
  const people = team.filter((member) =>
    OFFICE_LAYOUT.desks.some(
      (desk) => desk.id === member.employee.deskId && desk.roomId === roomId,
    ),
  );
  const open = Object.values(workspace.tasks).filter(
    (task) =>
      task.departmentId === room.departmentId &&
      task.status !== 'done' &&
      task.status !== 'cancelled',
  ).length;

  return (
    <>
      <Header
        icon={room.kind === 'department' ? Users : Building2}
        title={room.name}
        subtitle={roomDescription(room, workspace)}
      />
      {department ? (
        <>
          <Section title={`People · ${people.length}`}>
            <ul className="flex flex-col gap-2">
              {people.map(({ employee, status }) => (
                <li key={employee.id} className="flex items-center gap-3 text-sm">
                  <Avatar avatarId={employee.avatarId} color={department.color} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{employee.name}</span>
                  <StatusIndicator
                    tone={WORK_STATUS[status].tone}
                    label={WORK_STATUS[status].label}
                  />
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Work">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">{open}</span>{' '}
              <span className="text-muted">
                open {open === 1 ? 'task' : 'tasks'} in this department
              </span>
            </p>
            <Button
              icon={ListChecks}
              className="mt-3 w-full justify-start"
              onClick={() => {
                void navigate(`${ROUTES.tasks}?department=${department.id}`);
              }}
            >
              Open the task board
            </Button>
          </Section>
        </>
      ) : null}
    </>
  );
}

function ObjectDetails({
  target,
  workspace,
}: {
  target: Extract<InteractionTarget, { kind: 'object' }>;
  workspace: WorkspaceState;
}) {
  const navigate = useNavigate();
  const item = OFFICE_LAYOUT.furniture.find((candidate) => candidate.id === target.objectId);
  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === target.roomId);
  const label = item?.label ?? 'Object';

  switch (target.objectKind) {
    case 'meeting_screen':
      return <MeetingRoomPanel roomId={target.roomId} workspace={workspace} />;
    case 'project_board': {
      const projects = Object.values(workspace.projects);
      const active = projects.filter((project) => project.status === 'active').length;
      return (
        <>
          <Header icon={FolderKanban} title={label} subtitle={`In ${room?.name ?? 'the office'}`} />
          <Section>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <Stat label="Projects" value={projects.length} />
              <Stat label="Active" value={active} />
            </dl>
            <Button
              icon={FolderKanban}
              className="mt-4 w-full justify-start"
              onClick={() => {
                void navigate(ROUTES.projects);
              }}
            >
              Open projects
            </Button>
          </Section>
        </>
      );
    }
    case 'department_board': {
      const open = Object.values(workspace.tasks).filter(
        (task) =>
          task.departmentId === room?.departmentId &&
          task.status !== 'done' &&
          task.status !== 'cancelled',
      ).length;
      return (
        <>
          <Header
            icon={ListChecks}
            title={label}
            subtitle={`${room?.name ?? 'Department'} planning board`}
          />
          <Section>
            <dl className="text-sm">
              <Stat label="Open tasks" value={open} />
            </dl>
            <Button
              icon={ListChecks}
              className="mt-4 w-full justify-start"
              onClick={() => {
                void navigate(
                  `${ROUTES.tasks}${room?.departmentId ? `?department=${room.departmentId}` : ''}`,
                );
              }}
            >
              Open the task board
            </Button>
          </Section>
        </>
      );
    }
    case 'reception_desk':
      return (
        <Header
          icon={Building2}
          title={label}
          subtitle="Visitors and new hires will check in here."
        />
      );
    case 'coffee_machine':
      return (
        <Header
          icon={Coffee}
          title={label}
          subtitle="Freshly brewed. The team takes breaks here."
        />
      );
    case 'arcade':
      return (
        <Header icon={Gamepad2} title={label} subtitle="For well-earned breaks in the lounge." />
      );
  }
}

/* ───────────────────────── Helpers ───────────────────────── */

function describeTarget(
  target: InteractionTarget,
  workspace: WorkspaceState,
): { icon: LucideIcon; subtitle: string } {
  switch (target.kind) {
    case 'employee':
      return { icon: Users, subtitle: 'Employee' };
    case 'desk':
      return { icon: Building2, subtitle: 'Empty desk' };
    case 'room_entrance': {
      const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === target.roomId);
      return {
        icon: room?.kind === 'meeting' ? Presentation : Building2,
        subtitle: room ? roomDescription(room, workspace) : 'Room',
      };
    }
    case 'object':
      return {
        icon:
          target.objectKind === 'project_board'
            ? FolderKanban
            : target.objectKind === 'coffee_machine'
              ? Coffee
              : ListChecks,
        subtitle:
          OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === target.roomId)?.name ?? 'Object',
      };
  }
}

const ROOM_KIND_TEXT: Readonly<Record<Room['kind'], string>> = {
  department: 'Department',
  meeting: 'Meeting room for the whole team',
  break: 'Kitchen and break area',
  lounge: 'A place to relax',
  reception: 'Where visitors arrive',
  corridor: 'Connects every room',
};

function roomDescription(room: Room, workspace: WorkspaceState): string {
  if (room.departmentId) {
    return workspace.departments[room.departmentId]?.description ?? ROOM_KIND_TEXT.department;
  }
  return ROOM_KIND_TEXT[room.kind];
}
