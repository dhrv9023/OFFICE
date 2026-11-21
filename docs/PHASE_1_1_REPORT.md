# Phase 1.1 Report — Domain, Stores and Commands

**Status:** complete. Typecheck, ESLint, Prettier, all 327 tests and the production build pass (results in §5).

**Scope delivered:** domain types, business rules, seed data, the canonical workspace store, the command layer and their tests. No persistence, no UI pages and no Phaser work were started. Phase 1.0 code was not restructured; the only edits to it were ESLint boundary rules, the Vitest environment setting and removing three `.gitkeep` placeholders.

## 1. Domain models created

All in `src/domain/types/`, framework-free, every field `readonly`.

| Model           | Fields                                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `Department`    | id, name, description, color, roomId                                                                              |
| `Employee`      | id, name, role, departmentId, description, skills, currentTaskId, deskId, avatarId, createdAt                     |
| `Project`       | id, name, description, category, objectives, requirements, priority, status, deadline, createdAt, updatedAt       |
| `Task`          | id, projectId, departmentId, assigneeId, title, description, priority, status, dependencies, createdAt, updatedAt |
| `ActivityEvent` | id, actorId, eventType, description, projectId, taskId, employeeId, timestamp                                     |
| `Notification`  | id, title, message, type, relatedEntityId, isRead, createdAt                                                      |

Supporting types:

- **`Actor`** — discriminated union: `user`, `agent` (with `employeeId`), `system`.
- **`Result<T, E>`** — `{ ok: true, value } | { ok: false, error }` with `ok()` / `err()` helpers.
- **`DomainError`** — union discriminated by `code`, ten variants: `validation`, `not_found`, `invalid_reference`, `duplicate_id`, `invalid_transition`, `assignment_rejected`, `dependency_cycle`, `dependencies_incomplete`, `conflict`, `invalid_actor`. Each carries a user-presentable `message` and variant-specific data (e.g. `from`/`to`, `cycle`, `blockedBy`).
- **IDs** — strings with a typed kind prefix (`task_…`, `emp_…`, `prj_…`), so different kinds cannot be confused at compile time. Minted only through the `IdGenerator` interface (`src/domain/ids.ts`); production implementation in `src/services/ids.ts`, deterministic sequential implementation for tests.
- **`Clock`** — injected time source (`src/domain/clock.ts`, production implementation in `src/services/clock.ts`).
- **`WorkspaceState`** — the whole durable business state as one immutable value.
- **`OfficeLayout`** — `Room`, `Door`, `Desk`, `Waypoint` in isometric tile coordinates.

### Seed data (`src/domain/seed/`)

- Five departments: Management, UI/UX Design, Frontend Development, Backend Development, Quality Assurance.
- Five employees: Alex Morgan (Project Manager), Sarah Chen (UI/UX Designer), Ryan Miller (Frontend Developer), Daniel Kim (Backend Developer), Emma Wilson (QA Engineer) — each with a department, skills, role description, avatar ID and unique desk.
- Office layout: 26 × 18 tiles, ten rooms (the five departments, Reception, Meeting Room, Break Room, Lounge and a central corridor), nine doors, five desks, ten waypoints. The rooms tile the whole floor with no gaps or overlaps.
- Deterministic: fixed IDs and a fixed timestamp; `createSeedWorkspace()` returns an equal value every call and passes the same integrity gate as any other data.

## 2. Business rules implemented

All in `src/domain/rules/`, pure functions with no framework imports.

### A. Task transitions (`taskTransitions.ts`)

| From        | Allowed to                            |
| ----------- | ------------------------------------- |
| todo        | in_progress, blocked, cancelled       |
| in_progress | in_review, blocked, todo, cancelled   |
| in_review   | done, in_progress, blocked, cancelled |
| blocked     | todo, in_progress, cancelled          |
| done        | —                                     |
| cancelled   | —                                     |

Anything not in the table is rejected with `invalid_transition`. Done and cancelled tasks cannot be reopened. Review is mandatory before done. Beyond the table, starting or resuming work requires an assignee, requires that the assignee has no other active task, and requires all dependencies to be resolved.

### B. Employee status (`employeeStatus.ts`)

- An employee has **at most one active task** (in progress or in review). Queued and blocked tasks do not occupy them.
- Derived work status: `working` (active task in progress), `reviewing` (active task in review), `blocked` (no active task, at least one blocked), otherwise `idle`.
- **Presence** (`in_meeting`, `on_break`) is not derivable from tasks and is not faked. It is left out of this milestone and will be a separate explicit state alongside work status.
- `Employee.currentTaskId` is written only by `syncCurrentTasks`, which every task-changing command runs, and is checked by `validateWorkspace`.

### C. Project progress (`projectProgress.ts`)

`percent = round(done ÷ (total − cancelled) × 100)`. Cancelled tasks are excluded from both sides: called-off work is neither progress nor outstanding. A project with no counted tasks (none, or all cancelled) is 0%.

### D. Validation

- **Fields** (`validation.ts`): project names (1–100 chars), task titles (1–140), descriptions (≤ 4,000), string lists, enumerations, deadlines (`YYYY-MM-DD`, real calendar day). Validators accept `unknown`, trim, and drop properties they do not know.
- **Assignments** (`assignment.ts`): employee must be in the task's department unless `allowCrossDepartment: true` is passed; closed tasks cannot be assigned; an active task can only be handed to a free employee; an active task cannot be unassigned.
- **Dependencies** (`dependencies.ts`): must be distinct existing tasks in the same project, not the task itself, and must not form a cycle. Resolved when done or cancelled.
- **Whole-workspace integrity** (`workspaceIntegrity.ts`): `buildWorkspace` and `validateWorkspace` detect duplicate IDs, bad department/project/employee/desk/room references, shared desks, more than one active task per employee, a stale `currentTaskId`, active tasks without assignees, cross-project or circular dependencies, and notifications pointing at nothing.
- **Office layout** (`officeLayout.ts`): rooms inside the office and non-overlapping, doors joining adjacent tiles of the rooms they name, desks and seats inside their rooms, no two things on one tile.

## 3. Store architecture

**One canonical state.** I checked whether separate stores could become inconsistent, and they could: a single task change must update the task, the assignee's `currentTaskId`, the activity log and the notifications. With separate stores, subscribers (and later persistence) could observe the state between those writes. So all durable data is one `WorkspaceState` in one Zustand vanilla store.

| File                                    | Role                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `src/stores/internal/workspaceStore.ts` | The writable store. Data only, no actions. Importable only by `commands/` (lint-enforced).             |
| `src/stores/workspace.ts`               | Read-only access: `useWorkspace(selector)`, `getWorkspace()`, `subscribeWorkspace()`.                  |
| `src/stores/selectors.ts`               | Pure queries and derived values: lists, project progress, employee status and summaries, unread count. |
| `src/stores/uiStore.ts`                 | Transient UI state (selected employee, active project). IDs only; not business state.                  |

Derived employee status and project progress are not stored anywhere; they are computed by selectors from the canonical state.

## 4. Commands implemented

`src/commands/handlers/` — one file per command (the two notification commands share one).

| Command                    | Activity event(s)                                 | Notification                                                |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------- |
| `createProject`            | project.created                                   | Project created                                             |
| `updateProject`            | project.updated and/or project.status_changed     | on status change only                                       |
| `deleteProject`            | project.deleted                                   | Project deleted                                             |
| `createTask`               | task.created (+ task.assigned if assigned)        | Task assigned, if assigned                                  |
| `updateTask`               | task.updated                                      | —                                                           |
| `assignTask`               | task.assigned / task.reassigned / task.unassigned | on assign and reassign                                      |
| `changeTaskStatus`         | task.status_changed                               | review, blocked, done, cancelled; plus "All tasks complete" |
| `deleteTask`               | task.deleted                                      | —                                                           |
| `markNotificationRead`     | —                                                 | —                                                           |
| `markAllNotificationsRead` | —                                                 | —                                                           |

How they work:

- Each handler is a pure function `(state, input, { actor, clock, ids }) → Result<{ state, value }>`.
- `createCommands` binds handlers to a store: on success the complete next state is committed with a single `setState`; on rejection nothing changes.
- Every handler checks the actor, validates input, validates relationships, applies domain rules, and builds the next state through one shared `commit()` function.
- `commands/index.ts` exports the instance wired to the real store. UI code and future AI agents call the same functions; only the `Actor` differs.
- Deletes are safe: deleting a project removes its tasks; deleting a task removes it from other tasks' dependencies; in both cases affected employees are freed and notifications lose their link. Activity history is kept.

**Deviation from the brief:** the two notification-read commands do not record an activity event or raise a notification. Reading a notification is not company activity, and logging it would flood the feed. Say the word if you want it logged.

## 5. Tests executed and actual results

Run on 2026-11-16 after the final code and documentation changes.

| Check            | Command                | Result                                  |
| ---------------- | ---------------------- | --------------------------------------- |
| TypeScript       | `npm run typecheck`    | Passed, no errors                       |
| ESLint           | `npm run lint`         | Passed, 0 errors, 0 warnings            |
| Prettier         | `npm run format:check` | Passed                                  |
| Vitest           | `npm test`             | **327 of 327 passed, 23 files, 1.27 s** |
| Production build | `npm run build`        | Succeeded                               |

Tests per file:

| Area        | File                                                            | Tests |
| ----------- | --------------------------------------------------------------- | ----- |
| Domain      | `rules/taskTransitions.test.ts`                                 | 51    |
| Domain      | `rules/validation.test.ts`                                      | 44    |
| Domain      | `rules/workspaceIntegrity.test.ts`                              | 24    |
| Domain      | `rules/employeeStatus.test.ts`                                  | 16    |
| Domain      | `rules/dependencies.test.ts`                                    | 16    |
| Domain      | `rules/assignment.test.ts`                                      | 14    |
| Domain      | `seed/seed.test.ts`                                             | 11    |
| Domain      | `rules/officeLayout.test.ts`                                    | 10    |
| Domain      | `rules/projectProgress.test.ts`                                 | 9     |
| Domain      | `ids.test.ts`                                                   | 2     |
| Commands    | `tasks.test.ts` (create, update)                                | 22    |
| Commands    | `projects.test.ts` (create, update)                             | 18    |
| Commands    | `changeTaskStatus.test.ts`                                      | 15    |
| Commands    | `deletes.test.ts`                                               | 12    |
| Commands    | `assignTask.test.ts` (assign, reassign, unassign)               | 9     |
| Commands    | `createCommands.test.ts` (atomicity, actors, retention)         | 9     |
| Commands    | `notifications.test.ts`                                         | 6     |
| Integration | `workflow.integration.test.ts`                                  | 4     |
| Stores      | `selectors.test.ts`                                             | 8     |
| Stores      | `workspaceStore.test.ts` (real Zustand store, wiring, UI store) | 6     |
| Phase 1.0   | `App.test.tsx`, `eventBus.test.ts`, `isoMath.test.ts`           | 21    |

What the tests establish:

- **Transition table:** all 36 status pairs are checked against an independently written list — 14 allowed, 22 rejected.
- **Integration workflow:** the ten requested steps (create project → design task → assign to Sarah → in_progress → in_review → done → progress, status, activity, notifications) run as one test asserting the exact six activity entries and five notifications. Two more tests cover a three-department dependency chain and invalid workflows.
- **Consistency:** every command test asserts all workspace invariants after it runs, and the test store deep-freezes state so any mutation would throw.
- **Atomicity:** against the real Zustand store, subscribers are notified exactly once per successful command, never see an inconsistent state, and are not notified on rejection.
- **Every command rejects an invalid actor** without changing state.

**Mutation check.** Because everything passed on the first run, I deliberately broke eight rules one at a time to confirm the tests notice. All eight were caught, and the files were restored:

| Deliberate break                           | Tests that failed |
| ------------------------------------------ | ----------------- |
| Allow in_progress → done                   | 3                 |
| Allow reopening a done task                | 5                 |
| Count cancelled tasks in progress          | 5                 |
| Skip the `currentTaskId` sync              | 16                |
| Ignore department mismatch                 | 5                 |
| Ignore dependency cycles                   | 3                 |
| Leave dangling dependencies on task delete | 1                 |
| Commit on a rejected command               | 8                 |

This was a manual spot check, not an automated mutation-testing tool.

**Boundary rules.** Five deliberate violations were written to probe files and all five were rejected by ESLint: `features/` importing the writable store, `domain/` importing Zustand, `domain/` importing commands, `game/` importing commands, `game/` importing stores. The probe files were deleted.

**Build output:** app 328.93 kB (103.96 kB gzip), Phaser chunk 1,195.82 kB (319.16 kB gzip), CSS 12.03 kB. The app bundle is the same size as in Phase 1.0 because no UI imports the commands or stores yet, so they are not in the bundle. The dev server was not re-run this phase; nothing user-visible changed.

## 6. Architectural decisions

Recorded in full in [TECHNICAL_DECISIONS.md](TECHNICAL_DECISIONS.md) (TD-11 and TD-15 amended; TD-19 to TD-28 new). In short:

1. **One canonical state, pure command handlers** (TD-11). Replaces the earlier plan of separate workspace, activity and notification stores.
2. **Typed prefixed IDs, injected ID generator and clock** (TD-15).
3. **One active task per employee; blocked tasks do not occupy** (TD-19).
4. **Work status is derived; presence is a separate later axis** (TD-20).
5. **`currentTaskId` stored but single-writer** (TD-21). The field is derivable, so storing it is a small duplication; it is kept because the model asks for it, and made safe by having one writer and an invariant check.
6. **Cancelled tasks excluded from progress** (TD-22).
7. **Done and cancelled are terminal and immutable** (TD-23); **review is mandatory** (TD-24).
8. **Dependencies gate starting; cancellation resolves them** (TD-25).
9. **Cross-department assignment needs an explicit flag** (TD-26).
10. **Activity keeps history after deletes; notifications are detached; read-marking is not logged; both lists are capped** at 1,000 events and 200 notifications (TD-27).
11. **Archived projects are read-only** (TD-28).

ESLint boundaries were extended: only `commands/` may import the writable store; `commands/` may not import React, Phaser or UI; `domain/` may not import any other layer by any path.

## 7. Known issues

1. **Write protection is by lint, not by runtime.** A file that ignores the lint rule could import the internal store and call `setState`. `npm run check` catches it.
2. **No authorisation model.** Any valid actor may run any command. Agents are checked only for being real employees. Per-actor permissions belong with AI integration.
3. **A completed task cannot be reopened**, even if it was completed by mistake. The workaround is a follow-up task. This is the intended rule (TD-23) but will be felt in the UI.
4. **Dependencies are only enforced when work starts.** Adding an unfinished dependency to a task already in progress does not pause it.
5. **Cross-department permission is not stored.** `validateWorkspace` therefore cannot tell an allowed cross-department assignment from a mistaken one in loaded data, and accepts both.
6. **Projects have no transition rules** and are not completed automatically: when the last task finishes there is an "All tasks complete" notification, but the project's status stays as it is until someone changes it.
7. **Retention caps drop the oldest activity and notifications silently.**
8. **Department colours exist twice** — in seed data and in the CSS design tokens — and must be kept in step by hand.
9. **Departments and employees are fixed seed data.** There are no commands to add or edit them (not in scope).
10. **Deadlines are not checked against today's date**; a past deadline is accepted.
11. **Selectors scan all tasks** on each call and return new arrays. Fine at this scale; React call sites will need `useShallow`.
12. **`npm audit` still reports 7 moderate advisories**, all in dev tooling, unchanged from Phase 1.0.

## 8. Recommended next steps for Phase 1.2 (IndexedDB persistence)

1. Install `idb` and define `StorageService` in `src/services/storage/` (`load`, `save`, `clear`, `exportJson`, `importJson`), with an in-memory implementation for tests.
2. Define the persisted format: `{ schemaVersion, savedAt, workspace }`, and a `migrations` list starting at version 1.
3. Hydrate on boot: load → migrate → convert to records → `buildWorkspace` (the integrity gate already exists) → replace the store state. Add a store entry point for hydration that only the persistence module may call.
4. Decide what happens when loaded data fails the gate: keep the raw data for export, show an error state, offer reset. Departments, employees and the layout should be re-seeded or reconciled if the seed changes between versions.
5. Save on change: subscribe to the workspace store, debounce, write one snapshot. One state value means one write.
6. Add boot states to the app shell: loading, ready, storage error (with retry and "continue without saving").
7. Add export, import and reset commands or service calls, with import going through the same gate.
8. Tests: round-trip, migration from an older version, corrupt data, storage unavailable, debounce behaviour.
9. Consider whether multi-tab use needs a guard now (a simple "another tab is open" warning) or can stay deferred.
