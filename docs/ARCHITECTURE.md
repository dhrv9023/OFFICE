# Project HQ — Architecture

## 1. Principles

1. **Domain first.** Business rules live in pure TypeScript with no React, Phaser or browser APIs.
2. **Single source of truth.** Zustand stores (hydrated from IndexedDB) own all employee, department, project, task, activity and notification data.
3. **Phaser is a renderer.** It reads a snapshot, renders, and emits _intents_. It never mutates domain data. It owns only ephemeral view state (pixel position, current animation frame, camera).
4. **One-way flow.** Intent → command → domain rule → store → (React re-render, Phaser view update, persistence).
5. **Services behind interfaces.** Persistence and (future) AI execution are injected via interfaces.

## 2. Layers

```
┌────────────────────────────────────────────────────────────┐
│ UI layer (React)      components/, features/*/ui           │
│   dumb presentational + feature containers; no rules       │
├────────────────────────────────────────────────────────────┤
│ Application layer     stores/, commands/                   │
│   Zustand slices; commands orchestrate domain + services   │
├───────────────┬────────────────────────────────────────────┤
│ Game layer    │ Domain layer (pure TS)                     │
│ (Phaser)      │   entities, rules, selectors, seed data    │
│ game/         │   domain/                                  │
├───────────────┴────────────────────────────────────────────┤
│ Services layer        services/                            │
│   StorageService (IndexedDB), AgentService (stub), Clock   │
└────────────────────────────────────────────────────────────┘
```

Dependency rule: arrows only point downward/inward. `domain/` imports nothing from other layers. `game/` imports from `domain/` (types only) and `bridge/`. React imports stores and commands. Nothing imports React or Phaser except their own layers.

## 3. Directory layout

```
project-hq/
├─ docs/
├─ public/
├─ src/
│  ├─ app/                    # App shell, providers, boot/hydration, error boundary
│  ├─ domain/                 # PURE TS
│  │  ├─ types/               # Employee, Department, Project, Task, ActivityEvent, Notification
│  │  ├─ rules/               # task transitions, status derivation, progress, validation
│  │  ├─ seed/                # departments, employees, office layout definition
│  │  └─ ids.ts
│  ├─ stores/
│  │  ├─ internal/            # the writable workspace store (commands only)
│  │  ├─ workspace.ts         # read-only access + React hook
│  │  ├─ selectors.ts         # pure queries and derived values
│  │  └─ uiStore.ts           # selection (ephemeral, not business state)
│  ├─ commands/               # handlers/ (pure), createCommands (binding), index (wired instance)
│  ├─ services/
│  │  ├─ storage/             # StorageService interface + IndexedDB impl + migrations
│  │  └─ agents/              # AgentService interface + ManualAgentService (no-op)
│  ├─ bridge/                 # Typed event bus + Phaser<->store adapter
│  ├─ game/                   # PHASER ONLY
│  │  ├─ createGame.ts
│  │  ├─ scenes/              # BootScene, OfficeScene
│  │  ├─ entities/            # EmployeeSprite, DeskZone, RoomZone
│  │  ├─ systems/             # Navigation, Camera, Animation
│  │  └─ assets/              # procedural texture generators
│  ├─ features/               # React feature modules
│  │  ├─ office/              # OfficeView (mounts Phaser), controls
│  │  ├─ employees/           # roster, profile panel
│  │  ├─ projects/            # switcher, create dialog, progress
│  │  ├─ tasks/               # board, list, create/edit dialog
│  │  ├─ activity/            # feed
│  │  └─ notifications/       # toasts + center
│  ├─ components/             # reusable UI primitives (Button, Dialog, Badge, EmptyState ...)
│  ├─ hooks/
│  └─ styles/
(tests are co-located: `foo.ts` + `foo.test.ts`)
```

## 4. Data models (implemented in Phase 1.1)

Source of truth: `src/domain/types/`. All fields are `readonly`; state is never mutated in place.

**Identifiers** are strings with a kind prefix encoded in the type (`type TaskId = \`task_${string}\``), so IDs of different kinds cannot be mixed up at compile time. New IDs come only from an injected `IdGenerator` (`services/ids.ts`in production: prefix + UUID;`createSequentialIdGenerator`in tests). **Timestamps** are ISO-8601 UTC strings from an injected`Clock`. A project **deadline** is a calendar day, `YYYY-MM-DD`.

| Entity          | Fields                                                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `Department`    | `id`, `name`, `description`, `color` (hex), `roomId`                                                                                      |
| `Employee`      | `id`, `name`, `role`, `departmentId`, `description`, `skills[]`, `currentTaskId`, `deskId`, `avatarId`, `createdAt`                       |
| `Project`       | `id`, `name`, `description`, `category`, `objectives[]`, `requirements[]`, `priority`, `status`, `deadline`, `createdAt`, `updatedAt`     |
| `Task`          | `id`, `projectId`, `departmentId`, `assigneeId`, `title`, `description`, `priority`, `status`, `dependencies[]`, `createdAt`, `updatedAt` |
| `ActivityEvent` | `id`, `actorId`, `eventType`, `description`, `projectId`, `taskId`, `employeeId`, `timestamp`                                             |
| `Notification`  | `id`, `title`, `message`, `type`, `relatedEntityId`, `isRead`, `createdAt`                                                                |

Enumerations: `Priority` = low · medium · high · critical. `ProjectStatus` = planning · active · on_hold · completed · archived. `ProjectCategory` = web_app · mobile_app · website · api_service · internal_tool · other. `TaskStatus` = todo · in_progress · in_review · blocked · done · cancelled. `NotificationType` = info · success · warning · error.

Supporting types:

- `Actor` — `{kind:'user'} | {kind:'agent', employeeId} | {kind:'system'}`; stored on events as `ActorId` (`'user' | 'system' | EmployeeId`).
- `Result<T, E>` — `{ok:true, value} | {ok:false, error}`. Rules and commands return it instead of throwing.
- `DomainError` — union discriminated by `code`: `validation`, `not_found`, `invalid_reference`, `duplicate_id`, `invalid_transition`, `assignment_rejected` (with `reason`), `dependency_cycle` (with `cycle`), `dependencies_incomplete` (with `blockedBy`), `conflict` (with `reason`), `invalid_actor`. Every variant carries a user-presentable `message`.
- `WorkspaceState` — the whole durable business state as one immutable value: `departments`, `employees`, `projects`, `tasks` (maps by ID) plus `activity[]` and `notifications[]`.
- `OfficeLayout` — rooms, doors, desks and waypoints in isometric tile coordinates (static data, not part of `WorkspaceState`).

**Relationships**: Department 1—N Employee; Department 1—1 Room; Employee 1—1 Desk; Project 1—N Task; Task → Department (owning discipline); Task → Employee (assignee, optional); Task N—N Task (dependencies, same project, acyclic). Events and notifications reference entities by ID.

### Business rules (`src/domain/rules/`, all pure)

- **Task workflow** (`taskTransitions.ts`) — explicit table: todo → in_progress · blocked · cancelled; in_progress → in_review · blocked · todo · cancelled; in_review → done · in_progress · blocked · cancelled; blocked → todo · in_progress · cancelled; done and cancelled are terminal (no reopening). Starting work additionally requires an assignee who is free and resolved dependencies.
- **One active task per employee** (`employeeStatus.ts`) — "active" = in_progress or in_review. Queued and blocked tasks do not occupy anyone.
- **Employee work status** (derived, never stored) — active task in progress → `working`; in review → `reviewing`; no active task but a blocked one → `blocked`; otherwise `idle`.
- **Work status vs presence** — presence (at desk, in a meeting, on a break) cannot be derived from tasks and is _not_ modelled yet. When it arrives (Phase 1.6) it is a second, explicit axis next to work status, never a replacement for it.
- **`Employee.currentTaskId`** — the employee's active task. It is stored, but written in exactly one place (`syncCurrentTasks`, run by every command that changes tasks) and checked by `validateWorkspace`, so it cannot drift.
- **Project lifecycle** (`projectTransitions.ts`) — explicit table: planning → active · on_hold · archived; active → on_hold · completed · archived; on_hold → active · planning · archived; completed → active · archived; archived → planning · active. Completing needs every task closed; completed projects take no new tasks; archived projects accept only a restoring status change. Never automatic (TD-39).
- **Project progress** (`projectProgress.ts`) — done ÷ (total − cancelled) × 100, rounded; 0% when there are no counted tasks.
- **Assignment** (`assignment.ts`) — assignee must be in the task's department unless `allowCrossDepartment: true` is passed; closed tasks cannot be assigned; an active task can only be handed to someone free; an active task cannot be unassigned.
- **Dependencies** (`dependencies.ts`) — distinct existing tasks of the same project, never the task itself, never a cycle. A dependency is resolved only when **done**. A cancelled prerequisite keeps its dependents from starting (`dependencies_incomplete`, with the cancelled IDs listed); the explicit waiver is to remove or replace the dependency with `updateTask`. Cancelling a task that others depend on raises a warning notification naming how many are now stranded.
- **Validation** (`validation.ts`) — field validators accept `unknown` and return normalised values; unknown properties are dropped.
- **Integrity gate** (`workspaceIntegrity.ts`) — `buildWorkspace` / `validateWorkspace` check duplicate IDs and every relationship and invariant. Used for seed data, the saved workspace on startup and import files (via `restoreWorkspace`, §7).

## 5. Phaser ↔ React communication

Two channels with strictly different directions.

### 5.1 Store → Phaser (state down) — implemented in 1.5

`bridge/officeViewModel.ts` builds an `OfficeViewModel` from `WorkspaceState` (employees with seat, department colour, derived work status; selected employee). `OfficePage` rebuilds it on store changes but keeps the same object while nothing the office shows changed (`sameOfficeViewModel`), and `OfficeCanvas` pushes it with `handle.setViewModel`. The scene diffs: spawns, updates or removes employee sprites. It never reads a store.

### 5.2 Phaser → React (intents up) — implemented in 1.5

`bridge/gameEvents.ts` is the whole contract: `scene.ready`, `scene.error`, `player.moved` (on tile change only), `interaction.focus`, `interaction.hover`, `interaction.activate` (with `source: 'keyboard' | 'pointer'`), `camera.zoom`. Targets are typed (`employee`, `desk`, `room_entrance`, `object`) and carry IDs only. `OfficePage` decides what they mean: today, selection (`uiStore.selectEmployee`) and a details panel built from store data. Phase 1.6 attaches commands here.

### 5.3 Lifecycle

`OfficeCanvas` creates the game once per mount (lazy import, StrictMode-safe: a cancelled first mount never creates a game), destroys it on unmount, reads callbacks through refs so re-renders never recreate the scene, and owns focus: keys only drive the founder while the office element has focus. Verified in the browser: one canvas after repeated route changes, unchanged window-listener counts, no canvas after leaving.

### 5.4 What Phaser owns vs. what it must not own

| Phaser owns (ephemeral)             | Store owns (truth)                             |
| ----------------------------------- | ---------------------------------------------- |
| sprite x/y, facing, animation frame | employee status, current task, desk assignment |
| camera pan/zoom                     | selected employee                              |
| tweens, particles, hover state      | tasks, projects, notifications, activity       |

Reloading must reproduce the same office from the store alone (sprites snap to the place implied by status).

## 6. Application layer (implemented in Phase 1.1)

### One canonical state

All durable business data lives in a single `WorkspaceState` value inside one Zustand vanilla store (`stores/internal/workspaceStore.ts`). Separate stores per entity were rejected: a task change must update the task, the assignee's `currentTaskId`, the activity log and notifications together, and several stores would let subscribers observe the gap between those writes. The store contains data only — no actions.

- `stores/workspace.ts` — read-only API: `useWorkspace(selector)`, `getWorkspace()`, `subscribeWorkspace(listener)`.
- `stores/selectors.ts` — pure queries, including the derived values (`selectEmployeeStatus`, `selectProjectProgress`, `selectEmployeeSummaries`, `selectUnreadNotificationCount`). Derived values are never stored.
- `stores/uiStore.ts` — transient UI state (selected employee, active project). IDs only; the UI may write it directly.

### Commands: the only write path

A command handler is a pure function:

```ts
type CommandHandler<Input, Output> = (
  state: WorkspaceState,
  input: Input,
  context: { actor: Actor; clock: Clock; ids: IdGenerator },
) => Result<{ state: WorkspaceState; value: Output }, DomainError>;
```

`createCommands({ store, clock, ids })` binds the handlers to a store: read state → run handler → on success replace the state with **one** `setState`; on failure change nothing. `commands/index.ts` exports the instance wired to the real store, system clock and random IDs:

```ts
commands.createProject(actor, input)        commands.createTask(actor, input)
commands.updateProject(actor, input)        commands.updateTask(actor, input)
commands.deleteProject(actor, input)        commands.assignTask(actor, input)
commands.markNotificationRead(actor, input) commands.changeTaskStatus(actor, input)
commands.markAllNotificationsRead(actor)    commands.deleteTask(actor, input)
```

Every handler: checks the actor → validates input → validates relationships → applies domain rules → builds the next state through `commit()` (which also re-syncs `currentTaskId` and appends activity events and notifications) → returns a `Result`. The two notification-read commands deliberately record no activity.

Commands are refused with `workspace_unavailable` until the workspace has been loaded, and while an import or reset is replacing it (`isAvailable` in `createCommands`).

### Workspace lifecycle: the only other writer

`commands/workspaceLifecycle.ts` holds the operations that load or replace the **whole** workspace: startup hydration, import, reset and recovery. They are the only writer besides the business commands, and every workspace they install has either passed `restoreWorkspace` or is fresh seed data. They take no `Actor` and are not part of `Commands`, so an AI agent cannot reset or replace the company. Application status (`phase`, `operation`, save status) lives in a separate data-only store (`stores/internal/appStore.ts`), read through `stores/appStatus.ts`, never persisted.

Humans and future AI agents call the same functions with a different `Actor`. Nothing else can write: ESLint forbids importing `stores/internal/**` anywhere outside `commands/` and `stores/`, forbids `game/` from importing stores or commands at all, and forbids `domain/` from importing any other layer.

## 7. Services (future AI-ready seams)

### 7.1 Persistence (implemented in Phase 1.2)

```ts
interface StorageService {
  readonly kind: 'indexeddb' | 'memory';
  open(): Promise<void>;
  checkAvailability(): Promise<{ available: true } | { available: false; error: StorageError }>;
  load(): Promise<unknown>; // untrusted: always passed through restoreWorkspace
  save(
    snapshot: WorkspaceSnapshot,
    options: { expectedRevision: number | null | 'any'; clearBackups?: boolean },
  ): Promise<number>;
  clear(): Promise<void>;
  saveBackup(backup: BackupRecord): Promise<void>;
  listBackups(): Promise<BackupRecord[]>;
  close(): void;
}
```

Two implementations: `createIndexedDbStorage` (via `idb`) and `createMemoryStorage` (tests; proves the seam). Failures reject with a `StorageError` whose `kind` is `unavailable`, `open_failed`, `newer_version`, `blocked`, `read_failed`, `write_failed`, `quota_exceeded` or `conflict`. Only `services/storage/**` may import `idb` (lint-enforced).

**IndexedDB schema** — database `project-hq`, database version 1:

| Object store | Key                       | Contents                                                                                                                            |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `workspace`  | `id` (always `"current"`) | `{ id, format, schemaVersion, savedAt, revision, workspace: { departments, employees, projects, tasks, activity, notifications } }` |
| `backups`    | `id` (auto-increment)     | `{ id, createdAt, reason: 'pre-migration', payload }` — newest 3 kept                                                               |

The workspace is one record because it is one value in memory: one write is atomic and there is no cross-store consistency to manage. Entities are stored as lists so duplicates stay detectable on load. The office layout is not stored (it is code), nor is any UI or Phaser state.

**Two version numbers.** `DATABASE_VERSION` describes the object stores and changes through `DATABASE_UPGRADES` steps in `onupgradeneeded`; a throwing step aborts the upgrade and leaves the old database intact. `SNAPSHOT_SCHEMA_VERSION` describes the data shape and changes through pure `SnapshotMigration` functions (`domain/snapshot/migrations.ts`), applied one version at a time. The same snapshot schema and migrations serve the saved record and export files.

**Revisions.** Storage owns a `revision` counter; each save names the revision it expects to replace (`null` = nothing saved yet, `'any'` = import/reset). A mismatch rejects with `conflict` inside the same transaction and writes nothing, so a stale writer (e.g. another tab) can never overwrite newer data.

**The restore gate.** `restoreWorkspace(raw, layout)` (`domain/snapshot/restore.ts`) is the only way external data becomes state: envelope → schema version (newer versions rejected with an explanation) → migrations → structural decode (every field, with paths like `workspace.tasks[3].status`; unknown properties dropped) → `buildWorkspace` (every relationship and invariant). All or nothing; it never repairs data.

**Hydration lifecycle** (`AppPhase`):

```
initializing ──► ready { storage: 'persistent' }      saved data restored, or first run seeded and written
      │      ├──► recovery_required { reason, details } saved data exists but fails the gate — left untouched
      │      └──► error { kind, message }             storage itself unusable — nothing seeded or written
      │                 └─(continue without saving)─► ready { storage: 'memory' }
      └─ retry() from error / recovery_required
```

- First run: the seed is written (`expectedRevision: null`) _before_ the app goes live; if another tab seeded first, its copy is loaded instead.
- Older schema: the stored record is backed up, then the migrated workspace is saved; if either write fails the app stops in `error` rather than run on data that is not on disk.
- Loading never replaces saved data with seed data. Recovery offers: download the stored record as-is, import an export file, retry, or an explicitly confirmed reset — and, when the only problems have a deterministic lossless fix (e.g. a completed project with open tasks, saved before Phase 1.4), an explicitly confirmed **repair** that keeps the original as a `pre-repair` backup (TD-43).

**Automatic persistence** (`services/storage/autosave.ts`). The autosaver subscribes to the workspace store, which changes only on successful commands. It writes immediately — no timers — with three guarantees: single flight (never two writes at once, so they cannot finish out of order), latest wins (when a write finishes, the newest state is written once; intermediate states are skipped), and no redundant writes (immutable state → reference equality). After a failure the save status is `error`, the banner offers Retry, and the next change also retries.

**Import / export / reset.** Export writes `project-hq-workspace-YYYY-MM-DD.json` (UTC date) with `format`, `schemaVersion`, `exportedAt`, `generator`, `summary` and all entities, two-space indented. Import parses and passes the file through `restoreWorkspace` before touching anything, then pauses autosave (waiting for any write in flight), writes the new workspace, and only then installs it. Reset does the same with seed data and also deletes backups in the same transaction. If the write fails, memory and disk both keep the previous workspace. Commands are held off while either runs.

```ts
interface AgentService {
  readonly id: string;
  readonly capabilities: AgentCapabilities; // e.g. { canExecuteTasks: false }
  executeTask?(req: AgentTaskRequest, signal: AbortSignal): AsyncIterable<AgentEvent>;
}
```

Phase 1 ships `ManualAgentService` with `canExecuteTasks: false`. UI and commands consult `capabilities` and never display fabricated AI output. A later `LlmAgentService` plugs in via a provider registry; events it yields (`progress`, `artifact`, `blocked`, `completed`) are translated by commands into the same task/status/activity changes the human triggers today.

## 8. Isometric office rendering _(implemented in Phase 1.5)_

**Art direction (approved):** isometric 2.5D pixel art in the style of classic social-simulation games — diamond-tiled floors, thick colourful walls, open-roof cutaway, connected rooms, furniture and small expressive characters. The surrounding React UI stays a modern SaaS interface.

| Module                             | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/iso/isoMath.ts`              | Pure 2:1 projection (`tileToScreen`, `screenToTile`, `screenToTileIndex`, `tileDiamond`), depth (`tileDepth`, `footprintDepth` for multi-tile furniture).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `game/world/` (pure TS, no Phaser) | `walls.ts` derives wall segments from room edges and doors (`back` / `front` / `interior`). `collision.ts`: tile-space boxes for walls, blocking furniture, desks and seats; `moveWithCollision` resolves each axis separately (slides along walls), sub-steps long moves, and nudges up to 0.3 tile sideways past corners and into doorways. `movement.ts`: screen-relative controls (diagonals follow the tile axes), constant on-screen speed in 8 directions, 0.09 s ramp-up / 0.07 s stop, four-way sprite facing. `interaction.ts`: interactables (employees, vacant desks, doors, furniture with an `interaction`) and `nearestInteractable` (range + facing bonus). `camera.ts`: world bounds, viewport-centred camera bounds, integer zoom 1–3. All unit-tested. |
| `game/assets/`                     | Original procedural art: `pixelBuffer.ts` (pixel canvas with outline/mirror), `characters.ts` (founder and employees: front/back × idle 2f, walk 4f, sit, type 2f), `furnitureArt.ts` (18 furniture kinds from isometric boxes), `textures.ts` (floor + tall back walls baked into one texture; partition segments; sprite sheets and animations; status bubbles, prompt, marker). Textures are generated once when the scene starts; no image files.                                                                                                                                                                                                                                                                                                                     |
| `game/entities/`                   | `Founder` (tile-space position, eased velocity, collision, animation, continuous depth) and `EmployeeSprite` (seated at their desk; typing / status bubble from the view model; name tag; selection ring).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `game/systems/keyboardControls.ts` | Keys read from the focused office element only (never `window`); released on blur / hidden tab; ignores modifier shortcuts and keys aimed at buttons inside the office.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `game/scenes/OfficeScene.ts`       | Builds the world from `OFFICE_LAYOUT`, applies view models (diffing employee sprites), runs movement, proximity focus, pointer hover/click, the follow camera, and emits events.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `game/createGame.ts`               | Lazy entry point; returns a `GameHandle` (`setViewModel`, `select`, `zoomBy`, `setVirtualDirection`, `destroy`). Phaser keyboard capture is disabled.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**Layout as data.** `domain/seed/officeLayout.ts` holds rooms, doors, desks, waypoints and (since 1.5) **furniture** (kind, footprint, facing, blocking, optional interaction), all in tile coordinates and validated by `validateOfficeLayout` (no furniture on doorways, desks or seats; only seating may sit on a waypoint). Rendering, collision and interaction all derive from it; nothing hard-codes geometry.

**Depth.** Painter's order by `(col + row) * 10 + layer`: floor and tall back walls are one static image at the bottom; partitions (layer 2) and furniture (3) sort by their midpoint / footprint centre; people (5) by their feet; desk chairs (6) and seated people (7) last, so seated people are never hidden by their chair. Interior and front walls are low (14 px) so nobody is ever hidden behind a wall.

**Rules that keep it honest:** positions live in tile space and are projected only for drawing; collisions are tile-space boxes (no physics engine); integer zoom, `pixelArt`, `roundPixels`; the founder's position is transient game state (not persisted); reduced motion disables decorative tweens.

## 9. UI architecture

_Implemented in Phase 1.3; refined in Phase 1.5.1 (TD-51 – TD-54): Inter, one type and radius scale, workspace switcher in the sidebar, title-only top bar, full-bleed office with a contextual inspector, dashboard metric strip._

- **Primitives** (`src/components/`, no UI library): `Button`/`IconButton`, `Card`, `Badge`, `Field` (`Input`, `Textarea`, `Select` — native select), `Dialog`, `ConfirmDialog`, `DropdownMenu` (WAI-ARIA menu button), `Popover`, `Tooltip` (portal-positioned), `Tabs` (WAI-ARIA tabs), `Avatar`, `ProgressBar`, `StatusIndicator`, `Skeleton`, `Spinner`, `EmptyState`, `ErrorState`, `Page` (page frame), toasts (`toast/toastStore.ts` + `Toaster`), `RelativeTime`. Shared behaviour lives in `components/overlay.ts`: `useModalFocus` (focus in, Tab trap, Escape, scroll lock, focus return) and `useDismiss` (Escape / outside click).
- **Shell** (`src/app/shell/`): desktop sidebar (≥ `lg`, collapsible to an icon rail with tooltips, choice remembered), mobile drawer (< `lg`, modal), sticky top bar with breadcrumbs + page `<h1>`, notifications popover, theme toggle and workspace menu. A blocking overlay covers the shell while an import or reset runs.
- **Pages** (`src/features/*`): Dashboard, Virtual Office (frame for the Phaser canvas), Employees (read-only roster), Projects/Tasks/Activity (honest placeholders showing real counts), Settings (Appearance · Workspace data · Storage tabs; the tab is in the URL). Shared display mappings (status labels/tones, icons) are in `features/common/presentation.ts` — labels only, no rules.
- **Work management (Phase 1.4)**: `features/projects/` (list with search, status/priority filters and sorting in the URL; create/edit dialog; details page at `/projects/:id`; `ProjectActions` for the lifecycle) and `features/tasks/` (Kanban board with native drag and drop, `TaskStatusMenu`, `TaskFormDialog`, `AssignTaskDialog`, `AssigneePicker`, and `TaskDetailsDrawer` opened by `?task=<id>`). What is possible is asked of the domain's rule functions; what happens is decided by the commands (TD-40, TD-41, TD-42).
- **Data access**: pages subscribe to the immutable workspace once (`useWorkspace((s) => s)`) and derive views with `useMemo` over pure selectors (`selectDashboardMetrics`, `selectCurrentProjects`, `selectRecentActivity`, `selectDepartmentOverview`, …), so nothing derived is stored and no selector returns fresh objects to Zustand. The only business write in the UI is `markAllNotificationsRead`, through `commands`.
- **Boot**: `AppBoot` starts hydration; `BootGate` renders loading, storage-error or recovery screens until the phase is `ready` — the router and shell do not mount before then.
- **Accessibility**: skip link; one `<h1>` per page (in the top bar); landmarks (`nav[aria-label=Primary]`, `nav[aria-label=Breadcrumb]`, `main`); visible focus rings from a `:focus-visible` token; colour never the only signal (status dots always have text); live regions for toasts (errors assertive); reduced motion honoured globally.

## 10. Testing strategy

- **Unit (Vitest)**: domain rules (transitions, status derivation, progress), commands, snapshot decode/restore/migrations, autosave, workspace lifecycle, navigation grid/A* (1.6).
- **Storage**: one contract suite runs against both `StorageService` implementations; IndexedDB runs on `fake-indexeddb` (installed globally in `src/test/setup.ts`), including database upgrades, failed upgrades, newer versions, blocked upgrades and unavailability.
- **Component (Testing Library)**: dialogs/forms and state views for a handful of key components.
- **Manual/visual**: Phaser rendering verified in browser; scene logic kept thin by pushing decisions into pure functions (e.g. `statusToIntent`).
- Type checking and lint in CI script; no E2E in Phase 1 (optional Playwright smoke test later).

## 11. Error handling

- Global React error boundary around the app; separate boundary around the office view so a Phaser failure leaves the rest usable.
- Game init failures emit `scene.error` → office shows error state with retry.
- Save failures surface a persistent banner with Retry (data stays in memory). Startup failures show a storage-error screen (retry, or continue in a temporary in-memory workspace) or the recovery screen (download stored data, import, retry, confirmed reset). See §7.1.

## 12. Routing

`react-router` in data-router mode. `app/navigation.ts` is the single source of route paths and nav items; `app/routes.tsx` maps them to feature pages inside `AppShell`. Routes: `/` (dashboard), `/office`, `/projects`, `/employees`, `/tasks`, `/activity`, `/settings` (with `?tab=data|storage`), plus a not-found page and a route error element. Navigation is grouped into sections (Overview, Work, and Settings pinned at the bottom); the section name is used in breadcrumbs. Deploying to static hosting requires an SPA fallback to `index.html`.

## 13. Enforced boundaries

`eslint.config.js` encodes the dependency rule with `no-restricted-imports`: `domain/` may import nothing but itself; `game/` may not import React, stores, commands or UI; `bridge/` is framework-free; only `game/` may import Phaser, and UI reaches it solely through the lazy `@/game/createGame` entry point; only `services/storage/` may import `idb` or `fake-indexeddb`; only `commands/` may import the internal (writable) stores.

## 14. Theming

Dark (default) and light themes ship from Phase 1.3. Raw values are `--hq-*` custom properties scoped to `[data-theme]`; Tailwind v4 utilities (`bg-surface`, `text-muted`, `text-accent-strong`, `bg-secondary-soft`, `shadow-card`, …) map onto them via `@theme inline` in `styles/index.css`. Every text/background token pair meets WCAG AA (≥ 4.5:1) in both themes. Amber `accent` is a fill colour; text and icons in the accent hue use `accent-strong`, which is darker in the light theme.

The preference (`dark | light | system`) lives in `stores/preferencesStore.ts`, persisted to `localStorage` by `services/preferences.ts` — it is a per-browser interface preference, not workspace data, so it is never exported, imported or reset. `useApplyTheme` sets `<html data-theme>`; an inline script in `index.html` applies the saved theme before first paint. The Phaser office keeps its own palette regardless of theme.

## AI integration readiness (Phase 1.7)

The assessment of what is ready for real AI employees, the gaps, and the proposed integration architecture (agent runner outside React and Phaser, permissions checked in the command binding, an approval queue, execution, message and configuration records) are in [PHASE_1_7_REPORT.md §12](PHASE_1_7_REPORT.md#12-ai-integration-readiness). The invariant does not change: agents write only through commands, as an `agent` actor, and never touch stores or the scene.

## Access control and execution (Phase 1.8)

Every write still goes through a command. What changed is that every command is now **authorized** first, in `createCommands`' `bind()`:

```
caller (UI as founder · executor/gateway as an AI employee · anything else)
   │
   ▼
bind(actionType, handler)
   ├─ identity + standing    authorize(): user | agent with an active profile | system (no business actions)
   ├─ permission + scope     domain/rules/access.ts: grants on the employee's AccessProfile
   ├─ approval policy        agents only: fixed rules + "ask me first" grants → approval_required
   ▼
handler (pure, unchanged)  →  next WorkspaceState  →  store  →  autosave (schema v4)
```

AI employees act through the **executor** (`commands/execution.ts`), reached only via `gatewayFor(employeeId)`:

| Step               | What happens                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Request            | Authorized, then a **dry run** of the handler (nothing committed)                                                                                                     |
| Allowed            | The handler's state is committed with an `Execution` (succeeded)                                                                                                      |
| Refused or invalid | An `Execution` (denied or failed) is recorded; business data is untouched                                                                                             |
| Needs approval     | An `ApprovalRequest` (pending), an `Execution` (awaiting approval) and a notification to the founder; nothing applied                                                 |
| Founder approves   | Target content version, requester authorization and the handler are re-checked; the action is applied as the agent in the same commit, or the request is marked stale |
| Repeat request ID  | Returns the first result and changes nothing                                                                                                                          |
| Retry              | Explicit, failed executions only, through the whole pipeline again                                                                                                    |

Founder-only: managing access, deciding approvals, the founder's notifications, and workspace import, export and reset (lifecycle). Details and guarantees: [PHASE_1_8_REPORT.md](PHASE_1_8_REPORT.md).
