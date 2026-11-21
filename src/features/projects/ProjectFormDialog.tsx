import { useId, useState, type SyntheticEvent } from 'react';
import { commands } from '@/commands';
import { Button } from '@/components/Button';
import { Dialog } from '@/components/Dialog';
import { Input, Select, Textarea } from '@/components/Field';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import {
  PRIORITIES,
  PROJECT_CATEGORIES,
  USER_ACTOR,
  type Priority,
  type Project,
  type ProjectCategory,
} from '@/domain/types';
import { errorTitle, fieldError } from '@/features/common/commandFeedback';
import { PRIORITY, PROJECT_CATEGORY } from '@/features/common/presentation';

interface ProjectFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Edit this project; omit to create one. */
  project?: Project | undefined;
  onSaved?: (project: Project) => void;
}

const FIELDS = [
  'name',
  'description',
  'category',
  'priority',
  'deadline',
  'objectives',
  'requirements',
];

/** One entry per line; blank lines are ignored. */
const toList = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

export function ProjectFormDialog(props: ProjectFormDialogProps) {
  return props.open ? <ProjectForm {...props} /> : null;
}

function ProjectForm({ onClose, project, onSaved }: ProjectFormDialogProps) {
  const formId = useId();
  const [name, setName] = useState(project?.name ?? '');
  const [description, setDescription] = useState(project?.description ?? '');
  const [category, setCategory] = useState<ProjectCategory>(project?.category ?? 'web_app');
  const [priority, setPriority] = useState<Priority>(project?.priority ?? 'medium');
  const [deadline, setDeadline] = useState(project?.deadline ?? '');
  const [objectives, setObjectives] = useState(project?.objectives.join('\n') ?? '');
  const [requirements, setRequirements] = useState(project?.requirements.join('\n') ?? '');
  const [error, setError] = useState<DomainError | null>(null);

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    setError(null);
    const values = {
      name,
      description,
      category,
      priority,
      deadline: deadline === '' ? null : deadline,
      objectives: toList(objectives),
      requirements: toList(requirements),
    };
    const result = project
      ? commands.updateProject(USER_ACTOR, { projectId: project.id, patch: values })
      : commands.createProject(USER_ACTOR, values);

    if (!result.ok) {
      if (result.error.code === 'conflict' && result.error.reason === 'no_change') {
        onClose();
        return;
      }
      setError(result.error);
      return;
    }
    toast.success(project ? 'Project updated' : 'Project created', `"${result.value.name}"`);
    onSaved?.(result.value);
    onClose();
  };

  const formLevel =
    error && !(error.code === 'validation' && FIELDS.includes(error.field)) ? error : null;

  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={project ? 'Edit project' : 'New project'}
      description={
        project ? undefined : 'New projects start in planning. Activate one when work begins.'
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary">
            {project ? 'Save changes' : 'Create project'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="flex flex-col gap-4">
        {formLevel ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(formLevel)}</p>
            <p className="mt-0.5 text-muted">{formLevel.message}</p>
          </div>
        ) : null}
        <Input
          label="Project name"
          value={name}
          maxLength={100}
          required
          data-autofocus
          error={fieldError(error, 'name')}
          onChange={(event) => {
            setName(event.target.value);
          }}
        />
        <Textarea
          label="Description"
          hint="Optional. What the project is and who it is for."
          value={description}
          error={fieldError(error, 'description')}
          onChange={(event) => {
            setDescription(event.target.value);
          }}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            label="Category"
            value={category}
            error={fieldError(error, 'category')}
            options={PROJECT_CATEGORIES.map((value) => ({
              value,
              label: PROJECT_CATEGORY[value],
            }))}
            onChange={(event) => {
              setCategory(event.target.value as ProjectCategory);
            }}
          />
          <Select
            label="Priority"
            value={priority}
            error={fieldError(error, 'priority')}
            options={PRIORITIES.map((value) => ({ value, label: PRIORITY[value].label }))}
            onChange={(event) => {
              setPriority(event.target.value as Priority);
            }}
          />
          <Input
            label="Deadline"
            type="date"
            hint="Optional."
            value={deadline}
            error={fieldError(error, 'deadline')}
            onChange={(event) => {
              setDeadline(event.target.value);
            }}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label="Objectives"
            hint="One per line."
            value={objectives}
            error={fieldError(error, 'objectives')}
            onChange={(event) => {
              setObjectives(event.target.value);
            }}
          />
          <Textarea
            label="Requirements"
            hint="One per line."
            value={requirements}
            error={fieldError(error, 'requirements')}
            onChange={(event) => {
              setRequirements(event.target.value);
            }}
          />
        </div>
      </form>
    </Dialog>
  );
}
