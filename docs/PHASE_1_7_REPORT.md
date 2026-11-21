# Phase 1.7 Report — Experience Polish, Operational Completeness and Production Readiness

**Status:** complete. Typecheck, ESLint, Prettier, all **760 tests** (45 new) and the production build pass. **24 of 24** scripted browser checks pass against real IndexedDB, and **56 route screenshots** (7 routes × 4 widths × 2 themes) show no horizontal overflow and no console errors. **No AI agent work has been started.**

This phase followed the audit: fix what was unfinished or unsafe first, then complete workflows that were half there. Nothing was redesigned. The Phase 1.5.2 visual system is unchanged apart from new components built from it.

## 1. Initial audit

The audit read the docs, every route, and the code behind them (commands, stores, persistence, bridge, scene). Findings that the UI suggested but the code did not support are marked **(UI ≠ code)**.

### Critical (data or trust at risk)

| #   | Finding                                                                                                                                                                                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Two open tabs could strand unsaved work.** After the second tab saved, every save in the first failed with "The saved workspace changed unexpectedly". Retry could never succeed, because the expected revision stayed stale, and the banner didn't say what was wrong or what to do. |
| C2  | **Nothing warned before closing a tab** while a save was in flight or had failed.                                                                                                                                                                                                       |
| C3  | **Notifications were not actionable (UI ≠ code).** Items couldn't be clicked, and the existing `markNotificationRead` command was never called from the UI.                                                                                                                             |

### Important

| #   | Finding                                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1  | **Meetings had no date, time, duration or project**, no in-progress state and no clash checks.                                                                              |
| I2  | **The office couldn't show meetings.** There was no presence concept, although meeting-seat waypoints existed in the layout.                                                |
| I3  | **Blocked reasons couldn't be entered (UI ≠ code).** `changeTaskStatus` accepts a reason, but no screen asked for one, and it lived only inside activity text.              |
| I4  | **Task filters** covered only search, project, department and assignee: no status, priority, deadline or overdue filter, and no quick views. Overdue wasn't shown anywhere. |
| I5  | **The dashboard metrics didn't link anywhere**, and there was no overdue, unassigned, availability or meetings figure.                                                      |
| I6  | **Activity** had no filters and showed only the latest 200 events, with no way to see older ones. Events couldn't reference a meeting.                                      |
| I7  | **Employee profiles** lacked past meeting notes and skills.                                                                                                                 |

### Nice to have (assessed; not changed)

| Finding                                        | Decision                                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 15 components subscribe to the whole workspace | At this data size, re-renders are cheap and correct (immutable state, memoised derivations). Revisit with real agent traffic. |
| One app chunk of 177 kB gzip                   | Deferred with measurements (TD-67).                                                                                           |
| On phones the inspector sits below the canvas  | Carried over; a bottom sheet is a separate design task.                                                                       |

### Future AI integration requirements

These are assessed in section 11.

## 2. Plan and dependencies

The meeting work, blocked reasons and activity references needed one schema change (**v3**), so the domain went first, then the UI that depends on it, then reliability, then verification. Each part was tested before moving on.

## 3. Implemented improvements

| Area          | Change                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| Reliability   | Explicit save-conflict resolution with a backup; unsaved-changes guard; downloadable browser backups (section 9) |
| Meetings      | Times, a lifecycle with Start, clash rules with reasons, project link, notes on profiles (section 4)             |
| Office        | Presence: people in a running meeting sit in the meeting room with a meeting bubble (section 4)                  |
| Tasks         | Status, priority and deadline filters, quick views, overdue labels, blocked reasons (section 5)                  |
| Dashboard     | Ten figures in two rows, all from one selector, nine of them links to filtered views (section 6)                 |
| Activity      | Filters (kind, person, project) in the URL, and "Show older" paging (section 7)                                  |
| Notifications | Each item marks itself read and opens what it's about (section 7)                                                |
| Profile       | Upcoming meetings with times, past meetings with notes, skills, "In a meeting" (section 8)                       |
| Tooling       | Browser verification scripts kept in the repo (TD-68)                                                            |

## 4. Meeting system

- **Scheduling dialog:**
  - Fields: title, agenda, **date**, **start time** (5-minute steps), **duration** (15 min to 4 h), optional **project**, and invitees.
  - Each invitee shows **live availability** ("Busy: in “Relaunch kick-off”"), computed by the same domain rule the command uses.
  - A time in the past is refused in the form. This is a UI policy, because the domain doesn't read the clock (TD-62).
- **Rules** (domain, `rules/meetings.ts`):
  - Valid calendar times, and durations in range.
  - 1–20 distinct existing invitees.
  - A room must be a meeting room; a project must exist and not be archived.
  - Clashes: two open meetings may not overlap in time if they share the room or a participant. Back-to-back is fine, and cancelling releases people. The error names the person and the meeting: "Sarah Chen is already in "Relaunch kick-off" at that time. Choose another time or other people."
  - Nobody can be in two running meetings.
- **Lifecycle:**
  - **Scheduled → In progress** (Start) **→ Held**.
  - Scheduled → Held (recorded afterwards).
  - Scheduled → Cancelled.
  - Held and cancelled meetings are closed, and a running meeting can't be cancelled.
  - **Nothing changes because a time passed** (TD-62).
- **Outcomes:** notes are written when marking a meeting held. They appear in the meeting room's Recent list, in each participant's profile under **Past meetings**, and in the activity entry ("…Notes were recorded.").
- **Presence in the office** (TD-63):
  - Starting a meeting seats its participants on the meeting-room chairs, with a meeting bubble instead of their work bubble. Holding the meeting returns them to their desks.
  - The founder can walk up and interact with them there.
  - It is derived only from the meeting record, and placement is instant (no walking yet).
- **Migration:** meetings from v2 have no time and show "No time set". Nothing is invented.

## 5. Task management

- **Filters**, composable and kept in the URL:
  - search, project, department, assignee (including Unassigned);
  - **status** (including "Open work"), **priority**, **deadline** (Overdue, Due within 7 days, No deadline).
  - Malformed URL values are ignored rather than hiding everything.
- **Quick views:** Unassigned, Blocked, Awaiting review, Overdue and Due this week, each with a live count and `aria-pressed`. They are filter combinations, not new pages.
- **Overdue:** shown on cards and in the drawer as an icon plus the text "Overdue · Due 18 Nov". Finished work is never overdue, and work due today isn't overdue (TD-65).
- **Blocked reasons:** moving a task to Blocked, by drag or menu, first checks the move with the domain rule, then asks for an optional reason. The reason is stored on the task, shown on the card ("Blocked: Waiting on staging credentials from IT") and in the drawer, and cleared when the task moves on.
- **One write path:** the board, the menu, the drawer, the employee profile and the office all call the same commands. The checks used to grey out options (`checkAssignment`, `checkStatusChange`) are the same functions the commands run.

## 6. Dashboard

The metric strip now has ten figures in two rows, all computed by `selectDashboardMetrics(state, today)`:

| Row       | Figures                                                                                    |
| --------- | ------------------------------------------------------------------------------------------ |
| Company   | Working (of N people), Available, Active projects, In progress, Completed                  |
| Attention | Awaiting review, Blocked, **Overdue**, **Unassigned**, **Meetings** (scheduled or running) |

Each figure is a link to its view, for example Overdue → `/tasks?due=overdue` and Unassigned → `/tasks?assignee=unassigned&status=open`. The link's accessible name reads "Overdue: 2. Past their deadline. Show them". The 7-cell filler workaround from 1.5.2 is gone, because 10 cells divide evenly into 2 and 5 columns.

## 7. Activity and notifications

**Activity:**

- **Filters:** kind (Tasks, Projects, People, Meetings), person and project, all in the URL. Filtering by a person also finds meetings they were invited to, by ID, so a renamed person keeps their history.
- **Paging:** 100 events at a time with **Show older**, instead of a hard cap of 200.
- **Meeting references:** meeting events now carry `meetingId` and, when linked, `projectId`.
- **History:** nothing is rewritten; descriptions are still rendered when written.

**Notifications:**

- Each item is a button. It marks only that notification read (`markNotificationRead`) and opens its subject: the task drawer, the project page, or the employee's department. A small "Open task" / "Open project" hint shows where it leads.
- **Mark all read** and the empty state are unchanged.
- No new notification types were added. Meetings, renames and blocked reasons produce activity entries and toasts, because they are the founder's own actions. There are no duplicates: notifications are created only inside commands, once per state change.

## 8. Employee profile

The office profile now shows:

- identity and status;
- **In a meeting: <title>** while a meeting is running;
- current work, workload, actions and open tasks;
- **Meetings** (scheduled or running, with time and project);
- **Past meetings** with notes;
- **Skills**;
- recent activity, which now includes meetings they attended.

Renaming still works everywhere; IDs and appearance stay stable.

## 9. Reliability (TD-66)

| Situation                    | Before                                                                          | Now                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Another tab saved newer data | Endless "changed unexpectedly"; Retry could never work                          | The banner explains it and offers **Reload (use the other tab's version)** or **Keep this tab's version**. Keeping asks for confirmation, **backs up the other tab's record**, then saves. Retry still never overwrites. |
| Closing with unsaved changes | No warning                                                                      | A browser prompt appears while a save is in flight, has failed, or storage is unavailable. It never prompts when everything is saved, and its listener is removed on unmount.                                            |
| Backups                      | Made before migrations and repairs, but only reachable from the recovery screen | **Settings → Storage → Backups** lists them with a reason and time. **Download** gives the saved record itself, which can be imported again.                                                                             |
| Schema upgrade               | v1 → v2                                                                         | v2 → v3 added. Backup first, and nothing invented (TD-64)                                                                                                                                                                |

Unchanged safeguards: invalid data goes to recovery and is never replaced with the seed; writes are revision-checked and single-flight; repairs need confirmation.

## 10. Accessibility review

| Check                     | Result                                                                                                                                                                                                                                           |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Contrast                  | Every text token was measured against every surface in both themes: all ≥ 4.5:1 (lowest 4.62:1, amber on the light canvas). No changes needed.                                                                                                   |
| Colour independence       | Overdue has an icon and the word "Overdue"; blocked has a label and the reason; meeting status is written out; quick views use `aria-pressed`; statuses are always labelled.                                                                     |
| Keyboard                  | Verified in the browser: the first Tab stop is the skip link, and the dashboard figures are reachable by Tab. Notification items, quick views, metric cells and the new dialog controls are native buttons, links and inputs with visible focus. |
| Dialogs                   | All new dialogs (Block, Schedule, Mark as held, Keep this version) reuse the existing accessible Dialog and ConfirmDialog: focus trap, Escape, labelled titles, `role=alert` errors.                                                             |
| Forms                     | Field-level errors come from the domain's messages ("Choose a valid date and start time.", the clash explanation).                                                                                                                               |
| Reduced motion            | Unchanged: the existing `prefers-reduced-motion` handling covers the new components (no new animations).                                                                                                                                         |
| The office isn't required | Every action in the office also exists on regular pages: tasks on Tasks, renaming on Employees, activity on Activity. Meetings are the exception (see section 15).                                                                               |

## 11. Performance

Assessed by code inspection, measurement and the browser run:

- **Bundle:** the app chunk is 598 kB (177 kB gzip), up 23 kB / 7 kB for this phase. The Phaser chunk (330 kB gzip) loads only on the office route. Code splitting was deferred with reasons (TD-67).
- **Phaser:** a sprite is redrawn only when its seat changes; otherwise status and name updates are in place. The view model is pushed only when `sameOfficeViewModel` sees a visible change (now including presence and seat). The browser run checked that **only one canvas exists after leaving the office and coming back**.
- **Lists:** activity renders 100 events per page instead of 200. Filters are pure and memoised.
- **Listeners:** the new `beforeunload` listener is removed on unmount (tested). Popover and dialog listeners use the existing components.
- **IndexedDB:** unchanged single-flight writes. An overwrite reads the stored record once, for the backup.

## 12. AI integration readiness

### What is ready

| Requirement                         | State today                                                                                                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One validated write path            | ✅ Every change is a pure command `(state, input, context) → next state or DomainError`. Agents would call the same commands.                                    |
| Agents can't mutate stores directly | ✅ The writable store is lint-restricted to `commands/`; Phaser reads a view model only.                                                                         |
| Auditability                        | ✅ Every command takes an `Actor` (`user`, `agent(employeeId)`, `system`), and activity records `actorId`. An agent must be an existing employee (`checkActor`). |
| Domain validation                   | ✅ Rules are pure functions (assignment, transitions, dependencies, deadlines, meetings) that tests run after every command.                                     |
| Stable identity                     | ✅ Immutable IDs; display names can be renamed; appearance keyed by `avatarId`.                                                                                  |
| Separation from rendering           | ✅ Phaser never writes state; it emits typed intents.                                                                                                            |
| Persistence and recovery            | ✅ Versioned snapshots, migrations with backups, revision-checked saves, explicit conflict resolution.                                                           |

### Gaps (none implemented; no simulated agents)

| Need                         | Gap                                                        | Proposed shape                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roles and permissions        | Any agent that is an employee may run **every** command    | A permission table per role (e.g. department) and command, checked in `bind()` before the handler, with `permission_denied` as a domain error                                                                               |
| Human approval               | None                                                       | `PendingAction { id, actor, command, input, reason, status }`. Sensitive commands become proposals when the actor is an agent; the founder approves, which replays the command as the user and records both                 |
| Execution lifecycle          | Tasks have human statuses only                             | `Execution { taskId, employeeId, status: queued, running, awaiting_approval, succeeded, failed, cancelled, attempts, error, startedAt, finishedAt }`, separate from task status, so the task board stays the human contract |
| Tool permissions             | No tool concept                                            | `Tool { id, scope }` plus per-employee grants, checked by the executor, not by the model                                                                                                                                    |
| Context and memory           | Only the workspace                                         | Per-employee memory records (facts, summaries) in their own collection, size-capped, with provenance                                                                                                                        |
| Communication                | Talk shows history only (TD-61)                            | `Message { from, to, body, inReplyTo, deliveredAt }`, written by commands, consumed by the agent runner                                                                                                                     |
| Configuration                | Employees have role, skills and description only           | `AgentConfig { employeeId, provider, model, systemPrompt, temperature, tools, budget }` in its own collection, so employee records stay clean                                                                               |
| Cost and tokens              | None                                                       | A `Usage` entry per execution (input/output tokens, cost, provider), aggregated by selectors                                                                                                                                |
| Providers (local and hosted) | `ARCHITECTURE.md` reserves an `AgentService` seam; no code | A provider registry behind one interface (`complete(request, signal) → stream`), keys held outside the workspace (never in exports)                                                                                         |
| Failure and retry            | None                                                       | Executions record attempts and errors; retries are explicit (founder) or follow a policy (bounded); no silent loops                                                                                                         |

### Proposed integration architecture

```
            ┌──────────── UI (React) ────────────┐
 founder ──▶│ pages · office inspector · approvals│
            └───────────────┬────────────────────┘
                            │ commands (USER_ACTOR)
 agent runner ──────────────┤ commands (agent actor) ──▶ permission check ──▶ approval gate?
 (worker, not Phaser)       │                                                │ yes → PendingAction
   ▲ executions/messages    ▼                                                ▼ no
   │                  domain rules (pure) ──▶ next WorkspaceState ──▶ store ──▶ autosave
   │                                                │
   └── provider registry ◀── AgentConfig            └──▶ activity (actor) · usage · executions
```

The runner lives outside React and Phaser (a Web Worker or a small local service). It reads state through selectors and writes only through commands as an agent actor. Every outcome, including refusals and pending approvals, is recorded.

## 13. Architecture recommendations

1. **Phase 1.8, before any model call:** permissions in `bind()`, the `PendingAction` approval queue, and the `Execution`, `Message` and `AgentConfig` collections, as schema v4 with migration. All of it can be built and tested without AI.
2. **Narrower subscriptions** once agent traffic exists: replace whole-workspace `useWorkspace(state => state)` in long-lived components with selectors plus `useShallow`.
3. **Movement:** the seat decision (TD-63) is in place; walking needs the navigation grid and A* listed in the roadmap.
4. **Route splitting** when the app chunk passes 250 kB gzip (TD-67).

## 14. Tests and results

| Check                  | Result                                                    |
| ---------------------- | --------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                    |
| `npm run lint`         | Passed (now also lints `scripts/`)                        |
| `npm run format:check` | Passed                                                    |
| `npm test`             | **760 of 760 passed, 56 files** (715 → 760)               |
| `npm run build`        | Succeeded: app 598 kB (177 kB gzip), game chunk unchanged |

**New and updated tests:**

- **Meetings, domain (26):** times and durations; project linking; clashes for people and for the room; back-to-back; release on cancel; held keeps history; local-time arithmetic; lifecycle including closed states and "can't cancel while running"; never in two running meetings; presence.
- **Migrations:** v2 → v3 defaults, existing values kept, a real v2 record restored; v1 → v3 chains.
- **Deadlines:** rules, plus status, priority and deadline filters, composition and malformed URLs.
- **Blocked reasons:** stored, cleared, optional.
- **Dashboard selector:** with the new counts; dashboard figures and their links.
- **Activity filters:** kind, person (including meetings and a renamed person), project, composition.
- **Notifications:** click opens the task and marks only that item read; targets for each entity type.
- **Reliability:** after a conflict, retry never overwrites; keeping this version backs up the other first, then normal saving resumes; the unload guard prompts only while unsaved, and its listener is removed.
- **Office and bridge:** participants are seated only while the meeting runs, overflow participants stay at their desks, and the view model carries presence.
- **UI:** scheduling with time, project and a clash shown in the dialog; past-time refusal; Start moves people and the profile says so; quick views; blocked-reason dialog from the card menu.

**Browser** (`scripts/browser/phase-1-7.mjs`, headless Chrome 157, Vite dev server, real IndexedDB). All 24 checks pass ([`workflows/checks.txt`](screenshots/phase-1.7/workflows/checks.txt)):

1. A company is created through the commands.
2. A genuine **schema-v2 record written to IndexedDB upgrades to v3** on reload, with nothing lost.
3. That upgrade keeps the old record as a backup.
4. The dashboard counts 2 overdue tasks.
5. Overdue → filtered board.
6. Blocking with a reason from the card menu shows the reason on the card.
7. Walking to the meeting room and pressing E opens the planner.
8. A meeting is saved with date, time, duration, project and 3 participants.
9. A clash is refused, naming the person and the meeting.
10. **Start seats all 3 participants in the meeting room.**
11. The profile shows "In a meeting".
12. Holding the meeting stores the notes and everyone returns to their desk.
13. The participant's profile keeps the notes.
14. Activity can be filtered to meetings.
15. Clicking a notification marks it read and opens the task.
16. **With two real tabs**, the first explains the conflict.
17. Leaving with unsaved changes asks for confirmation.
18. Keeping this version saves it **and backs up the other tab's data**.
19. Backups are listed with a download.
20. The first Tab stop is the skip link.
21. Dashboard figures are reachable by keyboard.
22. **Only one office canvas after navigating away and back.**
23. No console errors.
24. No horizontal overflow.

`scripts/browser/pages.mjs` captured every route at 1440, 1280, 768 and 390 px in both themes, 56 screens, with no overflow and no console errors ([`pages/pages.txt`](screenshots/phase-1.7/pages/pages.txt)).

## 15. Screenshots

- **Workflows** ([`screenshots/phase-1.7/workflows/`](screenshots/phase-1.7/workflows/)):
  - dashboard (dark at 1440, 1280, 768 and 390; light at 1440);
  - overdue view, block-reason dialog, task board at 4 widths, blocked filter (light);
  - meeting schedule dialog, clash, **meeting in progress in the office**, profile in a meeting, meeting held, profile with meeting notes (and light at 390);
  - activity (meetings, person, 390);
  - notifications, and a notification opening its task;
  - **save-conflict banner and confirmation**, settings backups;
  - projects, employees and settings at 3 widths.
- **Every route** ([`screenshots/phase-1.7/pages/`](screenshots/phase-1.7/pages/)): `{dark,light}-{dashboard,office,projects,employees,tasks,activity,settings}-{1440,1280,768,390}.png`.

## 16. Remaining limitations

1. **No walking:** people move instantly between desk and meeting room (TD-63). Pathfinding is still "Movement and animation" in the roadmap.
2. **Meetings are managed only from the office** (the meeting room and the profile's Meet). There is no list page. Their activity is on the Activity page and their notes are in profiles, but keyboard-only users must reach the meeting room through the office inspector, which works by Tab but isn't a dedicated page. A Meetings section on a regular page would close this.
3. **No calendar view and no time-zone handling:** times are office-local by design (TD-62).
4. **Agents can run every command** until permissions exist (section 12).
5. **Reload is the only way to see another tab's changes.** A live multi-tab sync (BroadcastChannel) is in the backlog.
6. **Phone inspector below the canvas**, and route splitting deferred (TD-67).

## 17. Recommended next phase

**Phase 1.8, Agent foundation (no AI calls):** command permissions per actor, an approval queue, and execution, message and agent-configuration records (schema v4), plus a Meetings list page to close limitation 2. These make Phase 2 a matter of plugging a provider into a runner that already has permissions, approvals and an audit trail, rather than retrofitting them under live agents.
