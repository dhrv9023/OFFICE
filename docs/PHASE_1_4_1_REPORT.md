# Phase 1.4.1 Report — Legacy Workspace Validation & Data Integrity

**Status:** complete. Typecheck, ESLint, Prettier, all 585 tests and the production build pass. I also tested in headless Chrome against real IndexedDB, including reloads and a full recovery. **Phase 1.5 has not been started:** there are no Phaser, office or animation changes.

## 1. Root cause

Every workspace that enters the app from outside the command path (the saved IndexedDB record at startup, or an import file) passes through one gate:

```
restoreWorkspace → decode → migrate → buildWorkspace → validateWorkspace
```

`validateWorkspace` checked references, desks, one active task per employee, `currentTaskId`, assignees, dependencies and cycles. It did not check the lifecycle rule added in Phase 1.4.

That rule was implemented only in `checkProjectStatusChange`, which runs when a **command** changes a status, not when data is loaded. Before Phase 1.4 any status could be set, so an older build could have saved a project that is **completed but still has open tasks**. Such a workspace loaded without complaint, in a state the current commands can no longer produce.

Only one rule needed this. The transition table describes **moves**, not **states**: any single status value is valid on its own, and an unknown status value was already rejected as a structural error. The one rule that applies to a project at rest is:

| Rule                                 | A state rule?                                               | Checked on load before | Now                                             |
| ------------------------------------ | ----------------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| Transition table                     | No (it is about moves)                                      | n/a                    | unchanged                                       |
| Completed project has no open tasks  | **Yes**                                                     | **No**                 | **Yes**                                         |
| Completed project takes no new tasks | Same rule seen from the task side                           | **No**                 | **Yes** (covered by the row above)              |
| Archived project is read-only        | No (it is about commands); archived with open work is valid | n/a                    | Still accepted, so valid history isn't rejected |
| Status must be a known value         | Structural                                                  | Yes                    | unchanged                                       |

## 2. Implementation

**Domain (authoritative, no duplicated rules)**

- `domain/rules/projectTransitions.ts` has a new `checkProjectState(project, tasks)`, the at-rest form of the rule, plus a shared `openTasks()` helper that `checkProjectStatusChange` now also uses.
- `domain/rules/workspaceIntegrity.ts`: `validateWorkspace` calls `checkProjectState` for every project. Load and import already go through this gate, so both are now covered. The error reuses the existing `conflict` / `project_open_tasks` type, with the message `Project "X" is marked completed but still has N open tasks.`
- `domain/snapshot/repair.ts` has a new `repairRecords`, the only repair: a completed project with open tasks becomes **active**. This is the domain's own reopen transition (completed → active). No task, history or other entity is touched.
- `domain/snapshot/restore.ts`:
  - The existing pipeline was split into `decodeSnapshot` and `build`, with no behaviour change.
  - New `planWorkspaceRepair` decodes the data, applies `repairRecords`, then runs the full gate. It succeeds only if the repair fixes **every** problem; if nothing needs repairing, or other problems remain, no repair is offered.

**Lifecycle (`commands/workspaceLifecycle.ts`)**

- **Startup:** if the restore gate rejects the saved record for consistency reasons, the lifecycle asks `planWorkspaceRepair` whether a lossless repair exists. Either way the phase becomes `recovery_required`, now carrying `repairs` (a list of descriptions, empty if none). The saved record is never touched.
- **New `repairWorkspace()`**, allowed only from `recovery_required` with repairs on offer. It:
  1. reloads the stored record and plans the repair again;
  2. writes the record **exactly as found** to the `backups` store (reason `pre-repair`);
  3. saves the repaired workspace **only if the stored revision is still the one it checked**, so a write from another tab in between makes it refuse with `conflict` and change nothing;
  4. makes the repaired workspace live only after the write succeeds.

  While it runs, `operation: 'repairing'` blocks commands.

- `services/storage/types.ts`: `BackupReason` gains `'pre-repair'`. There is no other storage change.

**UI (the smallest change):** `RecoveryScreen` (via `BootGate`) shows an **"A repair is available"** panel only when repairs exist. It lists each repair in plain words, says the data exactly as saved is backed up first, and suggests downloading a copy. Applying it takes two steps: **Repair…**, then **Apply repair and open** (or Cancel). The existing options are unchanged: download the saved data as-is, restore from an export file, try loading again, and a confirmed reset. It works in both themes (screenshots in §5).

## 3. Was a migration necessary?

**No.** The data **shape** did not change: the same fields, types and enums. Only the **meaning** of one combination became invalid. So:

- `SNAPSHOT_SCHEMA_VERSION` stays **1** and `DATABASE_VERSION` stays **1**; the two version numbers stay consistent.
- A version-bump migration was rejected because it would have changed user data automatically, on every affected workspace, without consent. The brief rules that out unless it can be justified.
- The repair is deterministic and lossless, but whether a "completed" project with open work should be reopened, or its tasks closed instead, is the user's call. So it is offered, never applied silently. The user can also reset, import, or download the data and fix it elsewhere.

## 4. How invalid historical data is handled

| Situation                                                                                   | Result                                                                     | Saved record                      | Repair offered                       |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| Valid pre-1.4 data (e.g. archived with open work, on hold, planning with done tasks)        | Loads normally; nothing is written                                         | Unchanged                         | —                                    |
| Completed project with unfinished tasks                                                     | `recovery_required` (`invalid_relationships`) with the per-project message | **Unchanged** until the user acts | Yes: reopen as active                |
| Unknown project status (e.g. `"paused"`)                                                    | `recovery_required` (`invalid_structure`)                                  | Unchanged                         | No                                   |
| Archived project whose data breaks another invariant (e.g. an active task with no assignee) | `recovery_required`                                                        | Unchanged                         | No (only lossless fixes are offered) |
| Lifecycle problem plus corruption (e.g. a missing department)                               | `recovery_required` listing both problems                                  | Unchanged                         | No (the repair must fix everything)  |
| Import file with any of the above                                                           | Rejected by the same gate; the current workspace is unchanged              | —                                 | — (import never repairs)             |

In every case:

- the record stays exactly as stored;
- **Download the saved data** exports it byte-for-byte;
- commands stay blocked;
- nothing is seeded, deleted or overwritten without an explicit, confirmed user action;
- a confirmed repair keeps the original as a `pre-repair` backup (the newest 3 backups are retained).

## 5. Tests added and results

Run on 2026-11-20.

| Check                  | Result                                                  |
| ---------------------- | ------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                  |
| `npm run lint`         | Passed, 0 problems                                      |
| `npm run format:check` | Passed                                                  |
| `npm test`             | **585 of 585 passed, 40 files** (24 new)                |
| `npm run build`        | Succeeded (app 504.79 kB, 152.48 kB gzip; +0.8 kB gzip) |

**New tests**

| File                                      | Tests | Covers                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/rules/projectTransitions.test.ts` | +6    | `checkProjectState` rejects a completed project with open tasks (exact message); accepts completed with only closed or no tasks, archived with open work, planning with done work, on hold with blocked work                                                                                            |
| `domain/snapshot/legacy.test.ts` (new)    | 6     | Gate rejects completed-with-open-task with the exact detail; still-valid historical states are accepted; an unknown status is structural; the repair plan reopens the project and leaves tasks, activity and employees identical; no repair when nothing needs it; no repair when other problems remain |
| `commands/workspaceLifecycle.test.ts`     | +10   | Each case below                                                                                                                                                                                                                                                                                         |
| `app/boot/boot.test.tsx`                  | +2    | Repair panel hidden without repairs; shown with the backup note; applies only after two-step confirmation, and Cancel does nothing                                                                                                                                                                      |

The ten lifecycle tests cover:

- a **valid pre-1.4 workspace** loads with no writes, and loads again after a reload;
- **completed project with an unfinished task** → `recovery_required` with details and the repair, commands blocked, no writes, no backups, record identical;
- **exporting the invalid data** returns the stored record exactly, and storage is unchanged;
- **repair** → `pre-repair` backup equal to the original, revision-guarded save, project active, the task kept, ready, and a **reload** of the repaired data;
- the **repair is refused** if the record changed meanwhile, and nothing changes;
- **archived project breaking another invariant** → recovery, no repair, `repairWorkspace` refused, record identical;
- **partially corrupted data** → both problems reported, no repair, no writes;
- **invalid lifecycle state** → structural recovery, record identical;
- **recovery via a valid import**;
- an **import file with the same problem** is rejected.

The existing 561 tests were unchanged apart from adding `repairs: []` / `repairWorkspace` to two test fakes. They all still pass, which shows the stricter gate rejects nothing that valid commands produce.

**Mutation check:** I broke each safeguard on purpose, one at a time. All six breaks were caught, and every file was restored.

| Deliberate break                                        | Tests that failed |
| ------------------------------------------------------- | ----------------- |
| Gate skips the project state rule                       | 6                 |
| Repair skips the backup                                 | 1                 |
| Repair ignores the revision guard                       | 2                 |
| Repair offered despite other problems                   | 2                 |
| Repair list never shown                                 | 3                 |
| Archived projects with open work rejected (over-strict) | 5                 |

**Browser test** (headless Chrome, dev server, real IndexedDB; the stored record was edited directly to simulate an older build)

1. A project archived with 2 open tasks (still valid) loaded normally after a reload; the record was unchanged at revision 3.
2. The record was set to `completed` with 2 open tasks and reloaded. The recovery screen appeared with the repair "Reopen "Website relaunch" as active (it is marked completed but has 2 open tasks)". The record was **byte-identical** and there were **no backups**.
3. **Download the saved data** produced a file whose `stored` field equals the IndexedDB record exactly (status `completed`).
4. **Repair…** then **Apply repair and open** opened the app. The record became revision 4, status `active`, with both tasks unchanged. The `backups` store held one `pre-repair` entry with status `completed` at revision 3.
5. After a reload the app opened normally, and the project card showed **Active**.

No console errors or warnings. Screenshots are in [`docs/screenshots/phase-1.4.1/`](screenshots/phase-1.4.1/):

- `dark-recovery-repair-offered.png`
- `light-recovery-repair-offered.png`
- `dark-recovery-repair-confirm.png`
- `dark-projects-after-repair.png`

## 6. Remaining limitations

1. **Backups have no UI.** The `pre-repair` (and `pre-migration`) backups can't be restored from inside the app yet. The user's safety copy is **Download the saved data**, offered next to the repair. Only the newest 3 backups are kept.
2. **Only one repair exists.** Other invariant violations (for example an active task without an assignee) still need a reset, an import, or editing the downloaded JSON. That is deliberate: those fixes would lose or invent information.
3. **Import never repairs.** An export file from an older build with the same problem is rejected with the explanation. The user can import it after loading and repairing it locally, or edit the file.
4. **The repair records no activity event.** The project's `updatedAt` changes and the backup keeps the original, but the activity log doesn't mention the repair. Adding one would need an ID source in the lifecycle.
5. **Future state rules must follow the same pattern:** any new rule about what is valid at rest has to be added to `validateWorkspace` in the same change (now recorded in TD-43), or this gap could reappear.

## 7. Confirmation

Phase 1.5 (Phaser isometric office) has **not** been started. The changes in this task are limited to:

- the project state rule and its use in `validateWorkspace`;
- the repair planner and lifecycle operation;
- the recovery-screen panel;
- tests and docs: TD-39 amended, TD-43 added, ARCHITECTURE §7.1, ROADMAP.
