import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { ROUTES } from '@/app/navigation';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { buttonClasses } from '@/components/buttonStyles';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DropdownMenu, type MenuItem } from '@/components/DropdownMenu';
import { checkProjectStatusChange, PROJECT_TRANSITIONS } from '@/domain/rules/projectTransitions';
import { USER_ACTOR, type Project, type ProjectStatus } from '@/domain/types';
import { reportCommand } from '@/features/common/commandFeedback';
import { PROJECT_STATUS, projectActionLabel } from '@/features/common/presentation';
import { useWorkspace } from '@/stores/workspace';
import { ProjectFormDialog } from './ProjectFormDialog';

/** The most likely next step for each status, shown as the primary button. */
const PRIMARY: Partial<Record<ProjectStatus, ProjectStatus>> = {
  planning: 'active',
  active: 'completed',
  on_hold: 'active',
  archived: 'planning',
};

/** Changes that deserve a confirmation because of what they do to the project. */
const CONFIRM: Partial<Record<ProjectStatus, string>> = {
  completed: 'The project will be marked as delivered. It takes no new tasks unless you reopen it.',
  archived:
    'Archived projects are read-only: their tasks cannot be created, edited, assigned or moved until the project is restored.',
};

/**
 * Lifecycle and management actions for one project. The available status changes
 * come from the domain's transition table, each checked with its full rules.
 */
export function ProjectActions({ project }: { project: Project }) {
  const navigate = useNavigate();
  const tasks = useWorkspace((state) => state.tasks);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pending, setPending] = useState<ProjectStatus | null>(null);

  const moves = useMemo(() => {
    const own = Object.values(tasks).filter((task) => task.projectId === project.id);
    return PROJECT_TRANSITIONS[project.status].map((to) => {
      const check = checkProjectStatusChange(project, to, own);
      return { to, blocked: check.ok ? null : check.error.message };
    });
  }, [tasks, project]);

  const change = (to: ProjectStatus) => {
    if (CONFIRM[to] && pending !== to) {
      setPending(to);
      return;
    }
    setPending(null);
    reportCommand(
      commands.updateProject(USER_ACTOR, { projectId: project.id, patch: { status: to } }),
      {
        title: 'Project status changed',
        description: `"${project.name}" is now ${PROJECT_STATUS[to].label.toLowerCase()}.`,
      },
    );
  };

  const remove = () => {
    const result = reportCommand(commands.deleteProject(USER_ACTOR, { projectId: project.id }), {
      title: 'Project deleted',
      description: `"${project.name}" and its tasks were removed.`,
    });
    setDeleting(false);
    if (result.ok) void navigate(ROUTES.projects);
  };

  const primary = moves.find((move) => move.to === PRIMARY[project.status]);
  const secondary = moves.filter((move) => move !== primary);
  const archived = project.status === 'archived';

  const items: MenuItem[] = [
    ...secondary.map((move) => ({
      label: projectActionLabel(project.status, move.to),
      disabled: move.blocked !== null,
      ...(move.blocked ? { description: move.blocked } : {}),
      onSelect: () => {
        change(move.to);
      },
    })),
    {
      label: 'Edit details',
      icon: Pencil,
      disabled: archived,
      ...(archived ? { description: 'Restore the project to edit it.' } : {}),
      onSelect: () => {
        setEditing(true);
      },
    },
    {
      label: 'Delete project',
      icon: Trash2,
      tone: 'danger',
      onSelect: () => {
        setDeleting(true);
      },
    },
  ];

  return (
    <div className="flex max-w-sm flex-wrap items-center gap-2 lg:justify-end">
      {primary ? (
        <Button
          variant="primary"
          disabled={primary.blocked !== null}
          onClick={() => {
            change(primary.to);
          }}
        >
          {projectActionLabel(project.status, primary.to)}
        </Button>
      ) : null}
      <DropdownMenu
        label="More project actions"
        menuClassName="w-72"
        triggerClassName={buttonClasses('secondary')}
        trigger={
          <>
            <MoreHorizontal className="size-4" aria-hidden="true" />
            <span>More</span>
          </>
        }
        items={items}
      />
      {primary?.blocked ? (
        <p className="w-full text-xs text-muted lg:text-right">{primary.blocked}</p>
      ) : null}

      <ProjectFormDialog
        open={editing}
        project={project}
        onClose={() => {
          setEditing(false);
        }}
      />
      <ConfirmDialog
        open={pending !== null}
        title={pending ? `${projectActionLabel(project.status, pending)}?` : ''}
        description={pending ? (CONFIRM[pending] ?? '') : ''}
        confirmLabel={pending ? projectActionLabel(project.status, pending) : 'Confirm'}
        onCancel={() => {
          setPending(null);
        }}
        onConfirm={() => {
          if (pending) change(pending);
        }}
      />
      <ConfirmDialog
        open={deleting}
        tone="danger"
        title="Delete this project?"
        description={`"${project.name}" and all of its tasks will be permanently deleted. Their history stays in the activity log.`}
        confirmLabel="Delete project"
        onCancel={() => {
          setDeleting(false);
        }}
        onConfirm={remove}
      />
    </div>
  );
}
