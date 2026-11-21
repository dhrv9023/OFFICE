# Phase 1.6 Report — Interactive Workforce Management

**Status:** complete. Typecheck, ESLint, Prettier, all **715 tests** (61 new) and the production build pass. 14 scripted browser checks against real IndexedDB pass at desktop and phone widths in both themes, with no console errors. **Phase 1.7 has not been started.**

The office is now a place to manage the company. Walk up to someone, press E, and you can see what they are doing, give them a new or existing task, reassign their work, rename them, plan a meeting with them, or open Talk. Every action runs an existing or new **command**, so the office, the dashboard and the management pages always show the same state.

## 1. What the inspection found

The UI suggested more than the code did. These gaps were fixed in this phase:

| Gap                                                                                                   | Effect                                                | Fix                                                                                       |
| ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `EmployeeSprite.update()` returned early when the status was unchanged and never touched the name tag | A rename would not have reached the office            | The sprite now refreshes its tag whenever the name in the view model changes              |
| Looks were hashed from the **display name** (sprite and portrait)                                     | A rename would have given the person a different face | Looks are keyed by the stable `avatarId` (TD-58); existing characters are pixel-identical |
| Tasks had no deadline                                                                                 | The brief's new-task form asks for one                | `Task.deadline`, validated like project deadlines (TD-59)                                 |
| No meeting model                                                                                      | The meeting room had nothing real to do               | A small persistent `Meeting` model and three commands (TD-60)                             |
| No messaging model                                                                                    | "Talk" could only be fake                             | Talk shows real history and an honest, disabled composer (TD-61)                          |

## 2. Architecture

The existing rules hold: React owns the UI, Zustand is the source of truth, domain rules are authoritative, commands are the only write path, and Phaser only reads a view model and emits typed events.

```
 Phaser scene ──(interaction.activate: employee / room / object)──▶ OfficePage
      ▲                                                              │ selection
      │ view model (name, avatarId, status, seat)                    ▼
 buildOfficeViewModel ◀── workspace store ◀── commands ◀── OfficeInspector
                                                │            (EmployeeProfile,
                                          domain rules         MeetingRoomPanel)
                                                │
                                          autosave → IndexedDB (schema v2)
```

**New domain pieces:**

- Commands `renameEmployee`, `scheduleMeeting`, `completeMeeting` and `cancelMeeting`, with `createTask` and `updateTask` extended to take a `deadline`.
- Rules: `validateEmployeeName`, `validateMeetingTitle`, `validateLongText` and `checkMeetingParticipants`. Workspace integrity now also checks meetings and stored names.
- Activity types `employee.renamed`, `meeting.scheduled`, `meeting.completed` and `meeting.cancelled`, plus the conflict reason `meeting_closed`.
- Schema **v2** with migration `migrateV1ToV2` (tasks get `deadline: null`, the workspace gets `meetings: []`). The existing pre-migration backup step runs first.

**New UI pieces:**

- `office/EmployeeProfile`, `office/MeetingRoomPanel` and the shared `office/inspectorParts`.
- `employees/RenameEmployeeDialog` and a shared `employees/WorkloadBar`.
- `tasks/AssignExistingTaskDialog`.
- `meetings/ScheduleMeetingDialog` and `meetings/CompleteMeetingDialog`.
- `TaskFormDialog` gains a preselected assignee and a Deadline field.

No business rule is duplicated in React or Phaser. Pickers ask the domain (`checkAssignment`) which options are possible and why not, and the commands make the final decision.

## 3. Employee interaction workflow

1. **Approach:** walk within 1.7 tiles of someone. An E prompt floats over them, their name tag appears, and the inspector shows a **Nearby** preview (`01`).
2. **Open:** press E or click them. The selection ring appears in the office and the inspector opens the **profile** (`02`):
   - **Identity:** portrait, name, role and department, status, and a Rename button.
   - **Current work:** what they are working on (or blocked on, or doing next) with its project and status, plus their workload bar.
   - **Manage:** Assign a new task, Assign an existing task (with the unassigned count), Talk, and Meet.
   - **Open tasks:** each one opens the task drawer and has a Reassign button. Links lead to their tasks on the board and their department.
   - **Upcoming meetings** they are invited to, and their **recent activity**.
3. **Overview (nothing selected):** short guidance ("walk up to someone and press E…"), the number of scheduled meetings, the team list, rooms and controls.

The panel reads only shared state, so it updates on every command made anywhere in the app.

## 4. Task assignment workflow

| Action                              | How                                                                                                                                                                                                                             | Rules applied (by the domain)                                                                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **New task** (`03`, `04`)           | The existing task form, titled "New task for Sarah Chen", with her department and her as assignee preselected. Fields: title, description, project, department, priority, **deadline**, assignee, dependencies.                 | `createTask`: open project (not archived or completed), valid fields, dependencies in the same project with no cycles, department match unless cross-department help is ticked |
| **Existing unassigned task** (`05`) | A list of open tasks with no owner, their own department first. Tasks they cannot take are disabled, with the domain's reason ("… is not in the department that owns this task."). Cross-department help is an explicit opt-in. | `assignTask` + `checkAssignment`                                                                                                                                               |
| **Reassign**                        | The existing assign dialog from the profile's task list. If the new person is busy, the option is disabled with the real reason ("Ryan Miller is already working on …").                                                        | `assignTask` (closed tasks, department and busy rules)                                                                                                                         |

Each success logs `task.created` / `task.assigned` / `task.reassigned` and sends the usual notification ("Sarah Chen was assigned …"), and a confirmation toast appears. A rejection shows the command's message inside the dialog.

## 5. Employee rename

- **Where:** the pencil button in the office profile, and on every card on the Employees page.
- **Dialog** (`06`): the current name with portrait and role, a New name field with a live count ("12 / 80 characters"), Save changes and Cancel.
- **Validation** (in the domain):
  - The name is trimmed.
  - Empty or whitespace-only names are rejected with "Name is required.".
  - The maximum is 80 characters ("Name must be 80 characters or fewer.").
  - Line breaks are rejected ("Name must be on a single line.").
  - Hyphens, apostrophes, accents and non-Latin names are accepted.
  - An unchanged name just closes the dialog.
- **What changes:** only `name`. The ID, desk, avatar, tasks and current task stay the same. An `employee.renamed` event ("Sarah Chen was renamed to Sarah Okafor.") is logged and autosaved.
- **Where the new name appears:**
  - The office name tag and prompt (`07`), the profile, the team list and the sidebar.
  - The Employees page (`09`).
  - Task cards and the task drawer (`10`), and the assignee pickers.
  - The project team, and new activity entries and notifications.
- **History:** earlier activity and notifications keep the name they were written with, because text is rendered at write time (TD-57). The face doesn't change, because looks are keyed by `avatarId` (TD-58).

## 6. Meeting room

Walk to the meeting room door (or the meeting screen) and press E (`11`). The panel shows:

- the room (5 seats, a screen);
- **Schedule a meeting** (`12`): title, optional agenda, and invitees chosen by face with their current status ("Invite everyone" is available). It needs at least one person;
- **Upcoming** meetings (`13`): agenda, participants, and **Mark as held**, which records the founder's notes, or **Cancel**, after confirmation;
- **Recent** held or cancelled meetings, with their notes.

The profile's **Meet** button opens the same dialog with that person already invited.

**Not implemented, on purpose:** employees do not walk to the room, there is no meeting time or calendar, and nobody contributes to the notes except the founder. These need presence and movement (now "Movement and animation" in the roadmap) and agents (Phase 3).

## 7. Talk

**Talk** opens a view (`08`) with the real record of your work together (assignments, status changes, the rename) and a plainly worded note: the employee "is not connected to an AI agent yet, so they cannot read or answer messages. Nothing here is simulated." The composer and Send button are disabled. No message model was added, because there is nothing yet that would read the messages (TD-61).

## 8. Activity and notifications

| Event                                                  | Activity                                | Notification                                                |
| ------------------------------------------------------ | --------------------------------------- | ----------------------------------------------------------- |
| Task created / assigned / reassigned (from the office) | existing `task.*` events                | existing "Task assigned" / "Task reassigned"                |
| Employee renamed                                       | `employee.renamed` (employee reference) | none: a rename is your own action and is confirmed by toast |
| Meeting scheduled / held / cancelled                   | `meeting.*` with participants named     | none, for the same reason                                   |

## 9. Tests

There are 61 new tests (654 → 715).

| Area                  | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rename (domain)**   | Success; ID and everything else preserved; trimming; empty, whitespace-only and tab/newline-only names rejected; exactly 80 characters accepted and 81 rejected; line breaks rejected; legitimate names (O'Brien-Smith, José María, 李伟, …) accepted; no-change; unknown employee; the activity event; earlier activity and notifications unchanged; task references kept and new events use the new name                                                                                                                                                                               |
| **Meetings (domain)** | Schedule, plus validation (no participants, duplicates, unknown employee, missing title, non-meeting room); held with notes; cancelled; closed meetings; unknown meeting                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Deadlines**         | Default none; stored; invalid days rejected; changed and cleared through `updateTask`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Persistence**       | v1 → v2 migration (adds fields, keeps existing ones, rejects non-objects); **a real v1 record restores with nothing lost**; rename + deadline + meeting **survive a reload through IndexedDB**, with history intact; integrity checks for meetings and names                                                                                                                                                                                                                                                                                                                             |
| **Appearance**        | Every seed character keeps its seed; avatar keys other than `avatar_…` are used as is; the look doesn't depend on the name                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **Office bridge**     | A rename produces a new view model with the same ID, seat and avatar key; the interaction prompt is labelled with the new name                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **Proximity**         | The employee range boundary (inside and outside `EMPLOYEE_RANGE`); the meeting room offered at its door                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Office UI**         | The profile shows real actions. **New task** with the employee preselected, plus the resulting task, activity and notification, and the profile updating. Validation shown for a blank title. **Existing task** with the disabled cross-department option and its reason. **Reassign**, with the busy reason shown and the success logged. **Rename** (blank and too-long errors, trimming, ID kept, heading and the Phaser view model updated). **Talk** with nothing simulated. **Meeting room**: schedule (with the "invite at least one" error), mark as held with notes, and cancel |
| **Employees page**    | Rename from a card; the new name appears on the Employees page, the task board and the project page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Existing tests updated: the actor test now covers all 14 commands; the migration tests are relative to the current schema version; the export-format and summary tests include meetings; the profile test asserts the new actions.

## 10. Browser verification

Headless Chrome 157 drove the Vite dev server with the **real IndexedDB**, walking the founder by position using the development handle (TD-50). The profile started with a workspace saved by the Phase 1.5 build (schema v1), so the **v1 → v2 migration ran on real stored data**. Its existing tasks and meetings loaded, with `deadline` added.

All 14 checks passed with 0 console errors:

- approach shows Sarah as nearby;
- E opens the profile;
- a task is created with her as assignee and a deadline;
- the profile updates;
- the existing-task dialog explains restrictions;
- a whitespace-only name is rejected;
- the rename keeps the ID and trims;
- Talk is honest;
- the new name is on the Employees page **after reload**;
- the new name is on the task board;
- activity has the rename and keeps old entries;
- approaching the meeting door offers it;
- E opens the planner;
- the meeting persists with three participants.

The dashboard, projects, employees and settings pages were also captured after the changes, with no horizontal overflow at any width.

## 11. Screenshots

All in [`screenshots/phase-1.6/`](screenshots/phase-1.6/):

| File                                                                                              | Shows                                                                |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `01-approach-employee-1440`                                                                       | Walking up to Sarah: prompt, name tag and Nearby preview             |
| `02-employee-profile-1440`                                                                        | Her profile after pressing E                                         |
| `03-assign-new-task-dialog-1440` / `04-after-assignment-1440`                                     | Assigning a task from the office, and the profile afterwards         |
| `05-assign-existing-task-1440`                                                                    | Picking an unassigned task                                           |
| `06-rename-dialog-1440`                                                                           | Renaming                                                             |
| `07-renamed-in-office-1440`                                                                       | "Sarah Okafor" on the office name tag and in the profile (same face) |
| `08-talk-1440`                                                                                    | Talk                                                                 |
| `09-renamed-on-employees-page-1440` / `10-renamed-on-task-board-1440`                             | The new name after a reload                                          |
| `11-approach-meeting-room-1440` / `12-schedule-meeting-dialog-1440` / `13-meeting-scheduled-1440` | The meeting room                                                     |
| `14-employee-profile-light-1440`                                                                  | Light theme                                                          |
| `15-employee-profile-390` / `17-assign-new-task-390`                                              | Phone                                                                |
| `18-regression-*-1440`                                                                            | Dashboard, Projects, Employees and Settings after the changes        |

## 12. Known limitations

1. **No movement or presence:** employees stay at their desks; invited people don't walk to the meeting room. That work is now listed as "Movement and animation" in the roadmap.
2. **Meetings have no date or time;** "scheduled" means planned. A calendar needs a time model and a clock policy.
3. **Talk does not send messages.** That is deliberate until agents exist.
4. **On phones the inspector sits below the canvas,** so the profile needs scrolling (carried over from 1.5.1).
5. **Bundle:** the app chunk grew to 575 kB (170 kB gzip, from 547 / 164) for the new dialogs and panels. Route-level splitting is planned for the 1.7 performance pass.
6. **New tasks default to the first open project alphabetically.** There is no "current project" concept to preselect instead.

## 13. Ready for AI-agent integration

- **Actors:** every new command takes an `Actor`. An agent (`{ kind: 'agent', employeeId }`) can already be refused or allowed per command, and activity records who acted.
- **Assignment** goes only through `createTask` / `assignTask` with domain checks, so an agent cannot bypass the rules.
- **Meetings** have participants and founder notes. An agent backend can attach transcripts or decisions to the same record.
- **The Talk view** is the place for an agent conversation. A message model, with delivery state and a consumer, belongs with that backend.
- **Stable identity:** employees can be renamed without breaking references, and their look is tied to `avatarId`, which suits persona configuration later.
