import { createSeedWorkspace, OFFICE_LAYOUT } from '@/domain/seed';
import { systemClock } from '@/services/clock';
import { randomIdGenerator } from '@/services/ids';
import { createIndexedDbStorage } from '@/services/storage/indexedDbStorage';
import { appStore } from '@/stores/internal/appStore';
import { workspaceStore } from '@/stores/internal/workspaceStore';
import { useUiStore } from '@/stores/uiStore';
import { createCommands, type Commands, type WorkspaceStorePort } from './createCommands';
import { createWorkspaceLifecycle, type WorkspaceLifecycle } from './workspaceLifecycle';

export type { AgentGateway, Commands } from './createCommands';
export type { Reader } from './reads';
export type { ActionRequest, DecisionInput, DecisionOutcome, ExecutionOutcome } from './execution';
export type { AssignTaskInput } from './handlers/assignTask';
export type { ChangeTaskStatusInput } from './handlers/changeTaskStatus';
export type { CreateProjectInput } from './handlers/createProject';
export type { CreateTaskInput } from './handlers/createTask';
export type { DeleteProjectInput, DeleteProjectOutput } from './handlers/deleteProject';
export type { DeleteTaskInput, DeleteTaskOutput } from './handlers/deleteTask';
export type {
  CancelMeetingInput,
  CompleteMeetingInput,
  ScheduleMeetingInput,
  StartMeetingInput,
  UpdateMeetingInput,
} from './handlers/meetings';
export type { UpdateAccessProfileInput } from './handlers/updateAccessProfile';
export type { SendMessageInput } from './handlers/messages';
export type { UpdateAgentConfigInput } from './handlers/updateAgentConfig';
export type { RenameEmployeeInput } from './handlers/renameEmployee';
export type {
  MarkAllNotificationsReadOutput,
  MarkNotificationReadInput,
} from './handlers/notifications';
export type { UpdateProjectInput } from './handlers/updateProject';
export type { UpdateTaskInput } from './handlers/updateTask';
export type {
  FileDownload,
  ImportOutcome,
  ImportPreview,
  LifecycleError,
  WorkspaceLifecycle,
} from './workspaceLifecycle';

/*
 * Composition root for everything that writes application state: the real store,
 * clock, ID generator and browser storage are wired together here and nowhere else.
 */
const workspacePort: WorkspaceStorePort = {
  getState: () => workspaceStore.getState(),
  setState: (next) => {
    workspaceStore.setState(next, true);
  },
};

/** Start-up, import, export, reset and recovery. Call `initialize()` once on boot. */
export const workspaceLifecycle: WorkspaceLifecycle = createWorkspaceLifecycle({
  workspace: workspacePort,
  app: {
    getState: () => appStore.getState(),
    update: (patch) => {
      appStore.setState(patch);
    },
  },
  storage: createIndexedDbStorage(),
  clock: systemClock,
  layout: OFFICE_LAYOUT,
  createSeed: createSeedWorkspace,
  subscribe: (listener) => workspaceStore.subscribe(listener),
  onWorkspaceReplaced: () => {
    useUiStore.getState().reset();
  },
});

/**
 * The business commands (authorized on every call), the AI execution pipeline and
 * identity-bound agent gateways. Refused until the workspace has been loaded.
 */
const bound = createCommands({
  store: workspacePort,
  clock: systemClock,
  ids: randomIdGenerator,
  isAvailable: () => {
    const { phase, operation } = appStore.getState();
    return phase.status === 'ready' && operation === null;
  },
});

/** What the founder's UI calls. Every call is authorized as the given actor. */
export const commands: Commands = bound.commands;

/**
 * The AI execution pipeline (Phase 1.8). Nothing in the app calls it yet: no AI is
 * connected. Future agent runners receive `gatewayFor(employeeId)`, never this.
 */
export const executor = bound.executor;
export const gatewayFor = bound.gatewayFor;
/** Scoped reads for an AI employee's runner (Phase 2.0). */
export const readerFor = bound.readerFor;
