# Project HQ — Product Specification

## 1. Vision

Project HQ is an interactive virtual corporate office in which one human user manages a workforce of AI employees. The user creates a project; departments collaborate to complete it. The office is rendered as a 2D simulation: employees sit at desks, can be clicked and inspected, receive tasks, and move around the space.

Long-term goal: an **AI Workforce Operating System**.

## 2. Long-term departments

1. Management / Project Manager
2. Product Management
3. UI/UX Design
4. Frontend Development
5. Backend Development
6. DevOps
7. Quality Assurance
8. Security
9. Marketing
10. Research

## 3. Phase 1 scope (this spec)

Frontend foundation and simulated office experience. **No LLM integration and no fake AI.** Employees do not generate work. All task progress is driven by the human user; the office visualises state, it does not invent it.

### In scope

| #   | Capability                 | Notes                                                                                |
| --- | -------------------------- | ------------------------------------------------------------------------------------ |
| 1   | Interactive 2D office      | Phaser 3 scene, pan/zoom, click employees and rooms                                  |
| 2   | Five departments           | Management, Design, Frontend, Backend, QA                                            |
| 3   | Five employees             | One per department; fixed seed roster                                                |
| 4   | Employee profiles + status | Role, skills, current task, status, history                                          |
| 5   | Project creation           | Name, description, status; multiple projects, one active                             |
| 6   | Task creation + assignment | Title, description, priority, department, assignee, status                           |
| 7   | Movement + basic animation | Walk to desk / break area / meeting area; idle, walking, working, blocked indicators |
| 8   | Activity feed              | Append-only event log, filterable                                                    |
| 9   | Notifications              | In-app toasts + notification center with read/unread                                 |
| 10  | Local persistence          | IndexedDB; survives reload; export/reset                                             |
| 11  | Professional UI            | Responsive layout, loading / empty / error states                                    |

### Out of scope (Phase 1)

LLM calls, autonomous task execution, generated code/designs/documents, backend server, auth, multi-user, real-time collaboration, remaining five departments, custom employee creation, sound.

## 4. Users and core flows

Single persona: **the Operator** — one person managing a team.

1. **First run** → empty state → "Create your first project".
2. **Create project** → office appears with all five employees idle at desks.
3. **Create task** → pick department/assignee/priority → task lands in the board; assignee is notified, walks/animates "received task", feed logs it.
4. **Work a task** → Operator moves a task `Todo → In Progress → In Review → Done` (or `Blocked`). The assignee's status and office animation follow the task state.
5. **Inspect** → click an employee (in office or roster) → profile panel: status, current task, queue, recent activity.
6. **Monitor** → project progress bar, per-department load, activity feed, notification center.
7. **Return later** → everything restored from IndexedDB.

## 5. Functional requirements

### 5.1 Office

- Isometric 2.5D pixel-art office (see §9): rooms per department plus shared areas (meeting room, break room).
- Employee sprites with name label and status badge.
- Hover → highlight + tooltip; click → select (opens profile in React panel).
- Camera pan (drag) and zoom (wheel/pinch) with bounds; "reset view" control.
- Movement driven by _intents_ from application state (e.g. "go to desk", "go to meeting area"), pathing on a simple grid/waypoints.
- Animations: idle, walk (4 directions or flip), working (typing), blocked (indicator), notification pulse.
- Optional cosmetic idle wandering to the break area, clearly purely visual and never recorded as work.

### 5.2 Employees

- Fields: id, name, role, department, description, skills, current task, desk, avatar.
- Work status — `idle`, `working`, `reviewing`, `blocked` — is **derived** from assigned tasks, never set by hand or by Phaser.
- An employee has at most one active task (in progress or in review) and any number of queued or blocked ones.
- Presence (in a meeting, on a break) is a separate concept that cannot be derived from tasks; it arrives with movement in Phase 1.6.

### 5.3 Projects

- CRUD (create, rename/edit, archive, delete with confirmation).
- Status: `planning | active | on_hold | completed | archived`, changed only along the project lifecycle (activate, put on hold, resume, complete, reopen, archive, restore). Completing requires every task to be done or cancelled and is always the user's decision — never automatic. Archived projects are read-only until restored.
- Fields: name, description, category, objectives, requirements, priority, status, optional deadline.
- Progress = done tasks ÷ (all tasks − cancelled tasks); 0% when there are none.

### 5.4 Tasks

- CRUD, assignment/reassignment, status transitions validated by domain rules.
- Workflow: To do → In progress → In review → Done, with Blocked and Cancelled reachable from any open status. Done and Cancelled are final.
- Priority: `low | medium | high | critical`.
- Dependencies between tasks of the same project; a task cannot start until its dependencies are done. A cancelled prerequisite does not count as done: the dependent task stays unable to start until the user removes or replaces that dependency (explicit waiver). Circular dependencies are rejected.
- Views: Kanban board by status (drag and drop, plus a status menu on each card for keyboard and touch), task list on each project page, task details sheet; filters by search, project, department and assignee. A dedicated flat list view and a priority filter are deferred.
- Assigning to an employee outside the task's department is rejected unless explicitly confirmed (cross-department collaboration).

### 5.5 Activity feed

- Immutable events: project/task/employee actions with timestamp, actor (`user` or `system`), subject refs.
- Filter by project, department, employee, event type. Capped/paginated for performance.

### 5.6 Notifications

- Created by domain rules (task assigned, task blocked, task completed, project completed).
- Toast on creation, persistent in notification center, mark read / clear all.

### 5.7 Persistence

- All entities persisted in IndexedDB with a schema version; older data is migrated (after a backup), newer data is refused with an explanation.
- Every successful change is saved immediately; a failed save is shown with a retry and never silently dropped.
- Load on boot with explicit loading, storage-error and recovery states. Saved data that cannot be loaded is never replaced automatically.
- Export JSON (`project-hq-workspace-YYYY-MM-DD.json`), import JSON (fully validated, all-or-nothing), reset workspace (with confirmation).

### 5.8 Interface

- Layout: top bar (project switcher, notifications), left (roster / navigation), centre (office), right (contextual inspector), bottom or side drawer (activity feed, task board).
- Responsive: on narrow screens panels become drawers/tabs over the office view.
- Accessible: keyboard operable panels, focus management in dialogs, sufficient contrast, reduced-motion respect.
- Every list/async view has loading, empty and error states.

## 6. Non-functional requirements

- **Performance**: 60 fps office on mid-range laptop; initial JS shell small, Phaser lazy-loaded.
- **Resilience**: corrupt/old persisted data must not brick the app (migration or safe reset path).
- **Extensibility**: future AI integration through service interfaces without modifying UI components or Phaser scenes.
- **Honesty**: UI never claims an employee is "thinking" or "generating". Status wording reflects real state.
- **Privacy**: all data stays local in Phase 1.

## 7. Seed roster (Phase 1)

| Department | Employee role      |
| ---------- | ------------------ |
| Management | Project Manager    |
| Design     | UI/UX Designer     |
| Frontend   | Frontend Developer |
| Backend    | Backend Developer  |
| QA         | QA Engineer        |

(Names, avatars and skills are defined in a seed data module, not in components.)

## 8. Success criteria for Phase 1

- A new user can create a project, create and assign tasks, move them through statuses, and see the office react — with no console errors.
- Reloading the page restores the full workspace.
- Domain logic has unit tests; Phaser can be removed from the build and the domain/stores still run.
- Swapping the stub `AgentService` for a real one would require no change in UI components or the Phaser layer.

## 9. Visual direction (approved)

The office is an **isometric 2.5D pixel-art** environment in the tradition of classic social-simulation games — not a flat top-down map and not a generic corporate dashboard.

- Diamond-shaped tiled flooring; thick, colourful walls; open-roof cutaway building.
- Multiple connected rooms with detailed furniture: desks, computers, chairs, plants.
- Small expressive human characters.
- Warm, welcoming and visually rich.

Eventual rooms: Reception, Management, UI/UX Design, Frontend Development, Backend Development, Quality Assurance, Meeting Room, Break Room, Lounge.

The application chrome around the office uses a dark theme (light theme possible later through the same tokens). Phase 1 uses original, procedurally drawn pixel art; custom sprite sheets and tilesets replace it in a later art pass.

## 10. Agent readiness

The human controls every task transition in Phase 1. Future AI agents will request transitions through the same validated commands the UI uses; they never modify application state directly, and employee status is always derived from valid task state.

## Addendum (Phase 1.8): AI access, approvals and meetings

- **AI access:**
  - Each employee has an access profile: Disabled (the default), Active or Suspended, plus permissions with a scope (their own work, their department, or anything) and an optional "ask me first".
  - Only the founder edits access, from the Employees page or an employee's office profile.
- **Approvals:**
  - Some actions an AI employee requests always need the founder: deleting, renaming, completing or archiving a project, and taking over someone else's work.
  - They wait on the **Approvals** page with the reason and the proposed change. The founder approves (the action is applied, as the employee) or rejects (nothing happens).
  - A request whose target changed is marked out of date and never applied.
- **Execution log:** every action an AI employee requests is recorded with its outcome and the reason for any refusal.
- **Meetings page:** upcoming, held and cancelled meetings, with search, dates, details, notes, editing and the full lifecycle. It shares data and rules with the office's meeting room.
- **Honesty:** no AI is connected in Phase 1. These screens are empty in normal use. They exist so that, when agents arrive, they act only within limits the founder sets.
