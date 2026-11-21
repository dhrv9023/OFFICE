# Phase 1.4 Report — Projects and Tasks Management UI

**Status:** complete. Typecheck, ESLint, Prettier, all 561 tests and the production build pass (§7). The application was operated in headless Chrome against real IndexedDB at four widths in both themes (§8).

**Scope delivered:**

- Projects list, create/edit, details page and lifecycle.
- Task board with drag and drop, create/edit, details sheet, assignment, status changes, dependencies and deletion.
- An assignee picker driven by the domain's assignment rules.
- Dashboard and roster integration.

No Phaser or animation work was started.

**Business-logic changes** (all in the domain and command layer, with tests). Everything else is UI over the existing commands.

1. **Project lifecycle table (new).** Until now any project status could be set to any other. `domain/rules/projectTransitions.ts` now defines the legal moves. Completing a project requires every task to be done or cancelled, and a completed project accepts no new tasks until it is reopened (TD-39).
2. **Archived projects are fully read-only.** Their details could still be edited before; now only a restoring status change is accepted (TD-28 amended).
3. **New error types:** `invalid_project_transition`, plus the conflict reasons `project_open_tasks` and `project_completed`.

Four existing tests needed changes: one selector test that moved a project straight from planning to completed now goes through active; the others are additions.

## 1. Project management functionality

**List (`/projects`)**

- Cards show:
  - name (the whole card links to the project) and description;
  - status, priority, category, and deadline (with an **Overdue** badge when it has passed and the project isn't completed or archived);
  - progress bar and percentage;
  - task count and completed count;
  - avatars of everyone assigned work;
  - creation date.
- Search covers name and description. There are status and priority filters and six sort orders: recently updated, newest, name, deadline, progress and priority. All of them live in the URL.
- When filters are active, a "Showing N of M" line and a Clear button appear.
- Empty states for "No projects yet" (with a create button) and "No projects match".

**Create and edit**

- A dialog with name, description, category, priority, optional deadline, and objectives and requirements entered one per line.
- Input is validated only by the domain. Field errors (for example "Project name is required.") appear under the field, and any other error appears as an alert inside the form. Saving an edit that changes nothing just closes the dialog.
- After creating a project you land on its new page.

**Details (`/projects/:id`)**

- The top bar shows the project name with breadcrumbs (Project HQ › Work › Projects › name).
- Overview: badges, description, created and updated dates, and lifecycle actions.
- Tasks: each row has department, assignee, priority, a "waiting on N" indicator, an inline status menu, and opens the task sheet.
- Recent activity for the project.
- Progress: percentage, bar, the cancelled-tasks note, and a count per status.
- Team: assignees with their derived work status and number of tasks here.
- Departments involved, with done/total for each.
- Objectives and requirements.
- Notices for archived projects ("read-only, restore to…") and completed projects ("reopen to add work").
- A friendly page if the project doesn't exist.

**Lifecycle (`ProjectActions`)**

- The primary button is the natural next step: **Activate project** (from Planning), **Mark as completed** (Active), **Resume project** (On hold), **Restore to planning** (Archived).
- The **More** menu lists the remaining legal moves, Edit details, and Delete project.
- Every option is checked with `checkProjectStatusChange`. A blocked one is shown disabled with the reason, for example `"Website relaunch" still has 3 open tasks…`.
- Completing and archiving ask for confirmation; deleting asks with a danger-styled dialog.
- Nothing completes automatically: finishing the last task only raises the existing "All tasks complete" notification.

## 2. Task management functionality

**Create and edit (`TaskFormDialog`)**

- Fields: title, description, project (only projects that accept tasks), department, priority, assignee (create only, via the picker in §4), and dependencies (tick other tasks of the same project, each shown with its status).
- Editing covers title, description, priority, department and dependencies. If changing the department would leave the current assignee outside it, the form offers to keep them anyway (the explicit cross-department flag).
- All relationships (department, assignee, dependencies, cycles, archived or completed projects) are validated by `createTask` / `updateTask`, and their errors are shown in the form.

**Details sheet (`TaskDetailsDrawer`)**

- Opened by `?task=<id>` from the board, a project page or another task's dependency list, so it can be linked to and closed with Back.
- Shows: project link, title, full description, assignee (role, department, and whether they're from another department), department, priority, created and updated dates, and the status menu.
- **Dependencies:**
  - each one with its status and a link to open it;
  - a summary line ("All dependencies are done." or "Waiting on 1 of 2."), plus the cancelled-dependency explanation when it applies;
  - "N open tasks wait on this one".
- **History:** the task's activity events.
- **Actions:** Assign/Reassign, Edit, Delete (with confirmation). A closed task, or a task in an archived project, shows why it can't be changed and disables Edit and Assign.

**Operations, each going through its command**

| Operation                                                                                              | Command            |
| ------------------------------------------------------------------------------------------------------ | ------------------ |
| Create task                                                                                            | `createTask`       |
| Edit title, description, priority, department; manage dependencies (including waiving a cancelled one) | `updateTask`       |
| Assign, reassign, unassign                                                                             | `assignTask`       |
| Change status (board, card menu, project page or sheet)                                                | `changeTaskStatus` |
| Delete task                                                                                            | `deleteTask`       |

No component writes to Zustand.

## 3. Kanban implementation

- **Columns:** six, one per domain status (To do, In progress, In review, Blocked, Done, Cancelled), each with a count and colour.
- **Cards show:** project, title (opens the sheet), priority, department, assignee or "Unassigned", a dependency indicator (`done/total`, amber while waiting, with screen-reader text such as "Waiting on 1 of 2 dependencies"), and a status menu.
- **Drag and drop** uses the native HTML5 API, with no new dependency (TD-41):
  - While a card is dragged, every column is checked with the domain's `checkStatusChange`. Allowed columns get a dashed amber border, turning solid when the card is over them. Blocked columns dim, and hovering one shows the rule's message.
  - A drop calls `changeTaskStatus`. The board never moves a card optimistically: if the command refuses, the store is unchanged, so **the card stays where it was**. A toast explains, for example: `Couldn't move "Design the homepage" to Done — That move is not allowed: A task cannot move from "In progress" to "Done".`
  - Repeated failed moves replace one toast rather than stacking (a new `key` option on toasts).
  - Successful moves are announced in a polite live region.
  - Done and cancelled cards are not draggable.
- **Accessible alternative:** every card's status menu lists the legal next statuses with disabled reasons. It is the keyboard, screen-reader and touch path (HTML5 drag does not work on touch screens).
- **Filters:** search (title, description, project), project, department, and assignee (including Unassigned), all in the URL.
- **Layout:** columns are 17.5 rem wide and the board scrolls sideways inside its own focusable region (snap scrolling on mobile).
- **Workflow rules enforced** (all by the domain):
  - In progress cannot jump to Done; review is mandatory.
  - Done and cancelled are final.
  - Unresolved dependencies, including cancelled ones, prevent starting.
  - One active task per employee.
  - An assignee is required for active statuses.
  - Archived projects are read-only.

## 4. Employee assignment system

`AssigneePicker` is used both when creating a task and in the Assign/Reassign dialog.

- **Each person shows:** avatar in the department colour, name, role, department, derived work status (Working / In review / Blocked / Available), number of open tasks, and their current task.
- **Department first:** people in the task's department are listed. Others appear only after ticking **"Allow someone from another department"**, which is the domain's explicit `allowCrossDepartment` flag.
- **Eligibility comes from the domain.** Each option is checked with `checkAssignment`; ineligible people are disabled and show the rule's message, for example "Ryan Miller is already working on "Busy work"." when the task is active.
  - A busy person can still take a _queued_ task, because that doesn't make them active.
  - "Unassigned" is disabled for an active task, with the reason from `checkUnassignment`.
- The same employee presentation (avatar, role, status, open-task count) appears on the dashboard, the project Team card, the task sheet, the Employees roster (which now shows open-task counts) and the board cards.

## 5. Domain command integration

- **Mutations:** only through `commands`, called with `USER_ACTOR`. The UI imports no store writer; the existing lint rules enforce this, and `npm run lint` passes.
- **Affordances:** computed with the same pure functions the commands run — `checkStatusChange`, `checkAssignment`, `checkUnassignment`, `checkProjectStatusChange`, `unresolvedDependencies`, `cancelledDependencies`, and the `TASK_TRANSITIONS` / `PROJECT_TRANSITIONS` tables (TD-40). React has no copies of these rules. The one display mirror is `taskLockReason` (archived project or closed task), and the command remains authoritative.
- **Errors:** `features/common/commandFeedback.ts` maps each `DomainError` to a short heading and always shows the domain's own message, as a toast or inline. `validation` errors are placed under the matching field.
- **New pure selectors:** `selectProjectSummaries`, `selectProjectActivity`, `selectTaskActivity`, `selectDependents`, `selectOpenTaskCounts`.
- **New view helpers (filtering and sorting only, no rules):** `filterProjects` and `filterTasks`.

## 6. Dashboard integration

- **Nothing duplicated:** the dashboard and every page read the same canonical store through selectors, so each successful command updates them on the next render.
- **Verified by a test that operates only through the UI:**
  - create project → Projects count 1;
  - activate → Active projects 1;
  - create two assigned tasks → task totals;
  - move one through review to done → Completed 1 and project progress 50%;
  - block the other → Blocked 1 and that employee shown as Blocked.
- **Activity and notifications** come from the existing command architecture. The same test asserts the exact sequences:
  - activity: `project.created`, `project.status_changed`, `task.created`, `task.assigned` ×2, `task.status_changed` ×4;
  - notifications: Project created, Project status changed, Task assigned ×2, Ready for review, Task completed, Task blocked.

  No activity is fabricated.

- Dashboard project rows now link to their project pages.

## 7. Tests executed and actual results

Run on 2026-11-17, after the final code and documentation changes.

| Check            | Command                | Result                                   |
| ---------------- | ---------------------- | ---------------------------------------- |
| TypeScript       | `npm run typecheck`    | Passed, no errors                        |
| ESLint           | `npm run lint`         | Passed, 0 problems                       |
| Prettier         | `npm run format:check` | Passed                                   |
| Vitest           | `npm test`             | **561 of 561 passed, 39 files, ≈12.9 s** |
| Production build | `npm run build`        | Succeeded, no warnings                   |

**New and changed tests (82 new)**

| File                                             | Tests   | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/rules/projectTransitions.test.ts` (new)  | 27      | All 25 status pairs checked against an independently written list; the planning → completed message; completion only when every task is closed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `commands/projects.test.ts`                      | +6 (24) | Activation with its activity and notification; invalid transitions change nothing; completion blocked by open tasks and never automatic; no new tasks in a completed project until reopened; restoring from archive; archived projects read-only until restored                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `features/projects/ProjectsPage.test.tsx` (new)  | 12      | Empty state; **creation through the form** (every field, including line-separated lists) and navigation to the new page; field-level validation; card contents (status, priority, progress 50%, task counts, people, date); **filtering** by search, status and priority, sorting, clearing and no-match state; **activation** with the dashboard count; only legal moves offered, blocked ones explained; on hold and resume; **editing**; **archive with confirmation, then read-only** (Add task disabled, task moves unavailable) and restore; deletion; missing project                                                                                                                                                                                                                                                                                                                                |
| `features/tasks/TasksPage.test.tsx` (new)        | 21      | Six columns and full card contents; **drag and drop** through to → in progress → in review → done; **invalid drop** refused, card stays, message shown; closed cards not draggable; **dependency restriction** (cancelled dependency disables start with the waiver message, drag refused); **one active task per employee**; menu moves; board filters; empty state; **creation** with department, assignee, priority and dependencies; department-only assignees unless cross-department is allowed; title validation; creation impossible without a project that accepts tasks; **details** (every field, project link, history, opening a dependency); **editing**; removing a cancelled dependency (the waiver) then starting; **assign and reassign** with employee `currentTaskId` updates; busy person allowed for a queued task but blocked for an active one; **deletion**; closed task read-only |
| `features/integration.test.tsx` (new)            | 2       | The whole flow through the UI only → dashboard metrics, employee status, progress, exact activity and notification sequences; **persistence after refresh** (a fresh lifecycle and store read the same IndexedDB and get an identical workspace)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `features/projects/projectFilters.test.ts` (new) | 9       | URL parsing, search, status and priority filters, all six sorts                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `features/tasks/taskFilters.test.ts` (new)       | 4       | URL parsing, search over title, description and project, project/department/assignee/unassigned filters, ordering                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `stores/selectors.test.ts`                       | +1 (10) | The five new selectors                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Layout cannot be meaningfully tested in jsdom; mobile and desktop layouts were checked in the real browser (§8).

**Mutation check:** I broke ten Phase 1.4 rules one at a time. Nine were caught, and every file was restored.

| Deliberate break                                  | Tests that failed |
| ------------------------------------------------- | ----------------- |
| Allow planning → completed                        | 3                 |
| Allow completing with open tasks                  | 3                 |
| Allow tasks in a completed project                | 1                 |
| Allow editing an archived project                 | 1                 |
| Kanban drop does nothing                          | 3                 |
| Status menu skips the domain checks               | 2                 |
| Create form drops dependencies                    | 1                 |
| Archive without confirmation                      | 1                 |
| Priority filter ignored                           | 2                 |
| Assignee picker ignores the cross-department flag | 0                 |

The last break doesn't change behaviour, so no test can catch it: people from other departments are only listed once the cross-department box is ticked, and at that point the flag is already true.

## 8. Browser testing results

Headless Chrome against the Vite dev server with real IndexedDB, driven over the DevTools protocol.

**Flow 1: real UI interaction** (typed input, real clicks; drags dispatched as DOM drag events, see §9 item 1)

1. Empty projects page.
2. Submitting an empty name showed "Project name is required." under the field.
3. Created "Website relaunch" (description, priority, objectives) and landed on `/projects/prj_…` with the right title.
4. **Activate project** made the project Active.
5. Added two tasks through the dialog, the second depending on the first, choosing the department and assignee with real clicks.
6. On the board:
   - dragging "Build" to In progress was **refused** (dependency) and the card stayed in To do;
   - dragging "Design" from To do to Done was **refused** ("cannot move from To do to Done");
   - Design then moved through In progress → In review → Done;
   - Build then moved to In progress, which was now allowed.
7. The task sheet opened at `?task=…` and showed "All dependencies are done."
8. The reassign picker showed "Unassigned" disabled with its reason.
9. **After a reload:** the dashboard showed 1 project, 1 active, 1 in progress and 1 completed, and the board kept the same columns.

No console errors or warnings.

**Flow 2: layout**

- A realistic workspace (4 projects in different states, 8 tasks covering every status, dependencies, an unassigned task and a cancelled task) was checked on 6 pages (dashboard, projects, project details, board, task sheet, employees) × 4 widths (1440, 1280, 768, 390) × 2 themes.
- **No horizontal overflow** anywhere; the board scrolls only inside its own region.

**Fixes made from the screenshots**

- Failed-move toasts stacked up; they now replace each other.
- Lifecycle actions squeezed the project description; the actions column is now narrower.
- Task and project filters took four rows on mobile; they now use a two-column grid.
- The avatar stack clipped initials; the overlap is reduced.

**Screenshots** in [`docs/screenshots/phase-1.4/`](screenshots/phase-1.4/):

- Board: `dark-board-*`, `light-board-*`, `dark-board-drag-indicators.png`
- Projects list and details: `dark-projects-*`, `dark-project-details-*`, `dark-project-lifecycle-menu.png`
- Dialogs and sheets: `dark-new-task-dialog.png`, `dark-task-drawer-desktop.png`, `dark-task-drawer-mobile-390.png`

All at 1440, 1280, 768 and 390 where applicable.

## 9. Known issues

1. **Touch devices can't drag cards.** HTML5 drag and drop does not work on touch screens, so mobile users change status with the card menu. Browser drag testing dispatched DOM drag events rather than using the operating system's drag gesture.
2. **The board scrolls sideways on every screen size.** Six 17.5 rem columns don't fit even at 1440 px; the last column peeks in to signal more. There is no column collapsing yet.
3. **There is no flat task list view or priority filter on the board.** The project page has a per-project task list. Both are recorded as deferred in PRODUCT_SPEC.
4. **The project rules aren't checked when loading data.** Workspaces saved before 1.4 (for example a completed project with open tasks) still load; the rules apply to the next change (TD-39).
5. **The UI duplicates one rule for display:** `taskLockReason` mirrors the commands' archived/closed guard for messages. If that guard changes, both need updating; the command stays authoritative.
6. **Overdue uses the browser's local date.** The domain itself still doesn't check deadlines against today.
7. **The active-project switcher (`uiStore.activeProjectId`) is still unused.** Board filtering by project in the URL serves that purpose for now.
8. **Error toasts don't auto-dismiss** (a Phase 1.3 choice); move errors now replace each other, but other errors still stack.
9. **Bundle size:** the app bundle is 501.8 kB (151.7 kB gzip), up 14 kB gzip. Route-level code splitting is not done yet.
10. **Activity and notification limits:** the lists keep their caps (1,000 / 200), and the notification panel still marks everything read at once (Phase 1.7).

## 10. Recommendations for Phase 1.5 (isometric office)

1. **Feed the office from the selectors that now exist.** `selectEmployeeSummaries` (work status, current task), `selectOpenTaskCounts` and department colours give each sprite its state without new business logic. Map work status to office intent (at desk / in review / blocked) in a pure `statusToIntent` function as planned.
2. **Reuse the task sheet:** clicking an employee in the office can open their current task with `?task=<id>`, or a new employee sheet using the same pattern (`?employee=<id>`), so office interactions and React stay one system.
3. **Keep the office read-only for business data in 1.5.** Any office-driven action (for example dragging an employee to a task) should call the same commands and `reportCommand` for feedback.
4. **Before the office grows the bundle:** split the work-management routes with `React.lazy`, alongside the already lazy Phaser chunk.
5. **Add a Playwright smoke test** for the create → assign → drag → reload flow, now that the core workflow is stable.
