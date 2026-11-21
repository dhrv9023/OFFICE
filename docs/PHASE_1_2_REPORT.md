# Phase 1.2 Report — IndexedDB Persistence

**Status:** complete. Typecheck, ESLint, Prettier, all 435 tests and the production build pass (results in §8). The app was also run in headless Chrome against real IndexedDB (§8.4).

**Scope delivered:** a storage layer behind `StorageService`, automatic saving, the startup (hydration) lifecycle, versioned migrations, JSON export, validated import, reset, recovery handling, and the boot screens these need. No dashboard, project UI, employee UI or Phaser work was started.

**Changes to Phase 1.1 code:**

- The dependency rule changed as requested (§2).
- Commands can now be switched off until the workspace is loaded (`isAvailable` in `createCommands`).
- `uiStore` gained `reset()`.
- `DomainError` gained `workspace_unavailable` and a `cancelled` list on `dependencies_incomplete`.

No other business logic was rewritten.

## 1. Storage architecture

```
UI (boot screens, save banner) ──► commands/workspaceLifecycle ──► services/storage (StorageService)
                                       │        │                      ├─ indexedDbStorage (idb)
business commands ──► workspace store ─┘        │                      └─ memoryStorage (tests)
                          │                     └─► domain/snapshot (format, migrations, decode, restore)
                          └─► autosaver ──► StorageService
```

| Layer         | Files                                                                     | Responsibility                                                                                                                                |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Domain (pure) | `src/domain/snapshot/{format,migrations,decode,restore}.ts`               | Snapshot and export format, schema version, migrations, structural decoding, and the `restoreWorkspace` gate. No IndexedDB, no Zustand.       |
| Service       | `src/services/storage/{types,indexedDbStorage,memoryStorage,autosave}.ts` | Storing and loading snapshots, revisions, backups, error mapping, and the autosaver. Knows nothing about business rules or application state. |
| Application   | `src/commands/workspaceLifecycle.ts`, `src/commands/index.ts`             | Startup, import, export, reset, recovery. The only writer of the workspace store besides the business commands.                               |
| App status    | `src/stores/internal/appStore.ts`, `src/stores/appStatus.ts`              | `phase`, `operation`, save status. Runtime state only, never persisted.                                                                       |
| UI            | `src/app/AppBoot.tsx`, `src/app/boot/*`, `src/app/SaveStatusBanner.tsx`   | Loading, storage-error and recovery screens; the "not saved" banner.                                                                          |

Rules that hold:

- **Storage never writes to Zustand.** It returns data, and data from storage is untrusted until `restoreWorkspace` accepts it.
- **There is no second copy of persisted state.** The disk copy is a snapshot of the one canonical `WorkspaceState`.
- **The storage backend is replaceable.** Two implementations pass the same contract suite.
- **Only `services/storage/**` may import `idb` or `fake-indexeddb`.** This is lint-enforced. A probe of five violations was rejected by ESLint, and the probe files were deleted.

## 2. Cancelled dependencies (review requested in the brief)

**Old rule:** a cancelled prerequisite counted as resolved.

**New rule:** only **done** resolves a dependency. A cancelled prerequisite still blocks its dependents:

- Starting a dependent task is rejected with `dependencies_incomplete`.
- The error lists the cancelled IDs and says how to proceed: "…1 of them was cancelled: remove or replace that dependency to continue."
- **The waiver is explicit:** the user removes or replaces the dependency with `updateTask`. That edit appears in the activity log as a normal task update.
- When a task that others depend on is cancelled, the notification becomes a **warning** that names how many tasks are now stranded.

I did not add a stored waiver flag: it would be extra state with the same effect as removing the dependency.

Recorded as TD-25 (amended). PRODUCT_SPEC §5.4 and ARCHITECTURE §4 were updated to match.

## 3. IndexedDB schema

There is one database, `project-hq`, at database version 1.

| Object store | Key                       | Record                                                                                                                                                                  |
| ------------ | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspace`  | `id` (always `"current"`) | `{ id, format: "project-hq-workspace", schemaVersion, savedAt, revision, workspace: { departments[], employees[], projects[], tasks[], activity[], notifications[] } }` |
| `backups`    | `id` (auto-increment)     | `{ id, createdAt, reason: "pre-migration", payload }` (the newest 3 are kept)                                                                                           |

**Why one record:** the workspace is one immutable value in memory, so each save is a single atomic `put`. With one store per entity, a save would need a multi-store transaction and a diff. Entities are stored as lists rather than maps so that duplicate IDs can still be detected on load.

**What is not stored:** the office layout (it is code), UI selections, app status and anything from Phaser.

**`revision`** is owned by storage and goes up by one on every save (§5).

## 4. Migration strategy

There are two independent version numbers:

1. **`DATABASE_VERSION`** — the structure of the object stores. Each version has one step in `DATABASE_UPGRADES`, run inside `onupgradeneeded`. Steps only add or transform. If a step throws, the browser aborts the whole upgrade and the old database stays intact; this is tested.
2. **`SNAPSHOT_SCHEMA_VERSION`** — the shape of the data. Migrations are pure `(unknown) => unknown` functions keyed by the version they upgrade _from_. They are applied one step at a time, and a released migration is never edited. Saved records and import files use the same migrations.

`migrateWorkspace` never guesses:

- A version that is not a whole number of at least 1 is refused as `unsupported_version`.
- A version newer than the app is refused as `unsupported_version`, with the message "…only understands versions up to N. Update Project HQ and try again."
- A missing step or a step that throws produces `migration_failed`, and the input is left unchanged.

When the saved record is older than the app:

1. The record is copied into `backups` as `pre-migration`.
2. The migrated workspace, which has passed the full gate, is saved.
3. If either write fails, the app stops in `error` and does not run on data that is not on disk.

Version 1 is the first schema, so `SNAPSHOT_MIGRATIONS` is empty. The migration machinery is tested with made-up v1→v2→v3 configurations.

## 5. Hydration lifecycle

```
initializing ──► ready { storage: 'persistent' }
      │      ├──► recovery_required { reason, message, details }   saved data fails the gate; left untouched
      │      └──► error { kind, message }                          storage unusable; nothing seeded or written
      │                 └── continue without saving ──► ready { storage: 'memory' }
      └── retry() from error or recovery_required
```

- **`initialize()`** is idempotent, so React StrictMode's double effect call starts it only once. It opens storage, then loads.
- **First run** (storage confirms nothing is saved): the seed is written with `expectedRevision: null` _before_ the app goes live. If another tab seeded at the same moment, the write conflicts and that tab's copy is loaded instead.
- **Saved data:** the record goes through `restoreWorkspace`, which checks the envelope, then the version, then runs migrations, then checks structure, then relationships. The app becomes `ready` only if every check passes.
- **Commands are blocked** with `workspace_unavailable` until the phase is `ready`, and again while an import or reset is running.
- **Loading UI:** `AppBoot` renders a loading screen while initialising. The router and app shell mount only when the workspace is ready, so the user never sees an empty or half-loaded company.

## 6. Automatic persistence

`createAutosaver` subscribes to the workspace store. That store changes only when a command succeeds, so rejected commands, UI state and Phaser never cause a write.

| Guarantee           | How                                                                                                                                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No timers           | A write starts as soon as the state changes.                                                                                                                                                                      |
| Single flight       | A `draining` flag makes sure only one write runs at a time, so writes can never finish out of order. The tests measure at most 1 concurrent save.                                                                 |
| Latest wins         | Each write takes the state as it is when the write starts. Changes made during a write are collapsed: when the write finishes, one more write saves the newest state, and intermediate states are skipped.        |
| No redundant writes | State is immutable, so an unchanged state is detected by comparing references.                                                                                                                                    |
| No stale overwrite  | Every save passes the revision it expects to replace. If the stored revision is different (for example, another tab saved), storage refuses the write inside the same transaction and the error is shown instead. |
| Failure handling    | The save status becomes `error`, the banner says "Your latest changes have not been saved" and offers Retry, and the state stays dirty so the next change also retries.                                           |

## 7. Import, export, reset and recovery

**Export** (`exportWorkspace`):

- Filename: `project-hq-workspace-YYYY-MM-DD.json`.
- Contents: `format`, `schemaVersion`, `exportedAt`, `generator`, `summary` (counts) and every entity.
- Two-space indented with a trailing newline, so it is readable by hand.
- Contains no UI, layout or Phaser state; this is checked in the tests.

**Import** (`importWorkspace(json)`):

1. Parse the JSON, then run the same `restoreWorkspace` gate used at startup. Errors are typed as `invalid_json`, `malformed`, `unsupported_version`, `migration_failed`, `invalid_structure` or `invalid_relationships`. Each has a user-facing message and up to 25 detail lines with paths.
2. A rejected file changes nothing: the workspace object, the stored record and the save count are all unchanged.
3. For a valid file: pause autosave and wait for any write in progress, write the new workspace to storage, and only then install it in the store and clear UI selections.
4. If the write fails, the previous workspace stays in both memory and storage, and autosave resumes.

**Reset** (`resetWorkspace`) is the same storage-first replacement using seed data. It also deletes backups in the same transaction. Asking the user to confirm is the caller's job: the recovery screen uses a two-step "Start fresh…" then "Erase and start fresh". The Phase 1.3 settings UI must do the same.

**Recovery and error handling:**

| Situation                                                     | Result                                                                                                                                                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| IndexedDB missing or disabled                                 | `error: unavailable`. The screen offers _Try again_ or _Continue without saving_, which gives a temporary in-memory workspace with a persistent banner.                                |
| Database from a newer app                                     | `error: newer_version`                                                                                                                                                                 |
| Upgrade blocked by another tab                                | `error: blocked`, with a message asking the user to close other tabs                                                                                                                   |
| Read failure                                                  | `error: read_failed`. Nothing is seeded, and Retry loads the data once storage works again (tested).                                                                                   |
| Quota exceeded or write failure while saving                  | Save status `error` and the banner with Retry. The data stays in memory.                                                                                                               |
| Invalid, malformed, future-version or unmigratable saved data | `recovery_required`. The record is **left exactly as stored**. The screen offers: download the saved data as-is, restore from an export file, try loading again, or a confirmed reset. |
| Corrupt import file                                           | Rejected with the reason and details; nothing changes.                                                                                                                                 |

## 8. Tests executed and actual results

Run on 2026-11-17, after the final code and documentation changes.

| Check            | Command                | Result                                  |
| ---------------- | ---------------------- | --------------------------------------- |
| TypeScript       | `npm run typecheck`    | Passed, no errors                       |
| ESLint           | `npm run lint`         | Passed, 0 problems                      |
| Prettier         | `npm run format:check` | Passed                                  |
| Vitest           | `npm test`             | **435 of 435 passed, 28 files, ≈5.0 s** |
| Production build | `npm run build`        | Succeeded                               |

### 8.1 New and changed test files

| File                                   | Tests | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `commands/workspaceLifecycle.test.ts`  | 37    | The startup gate, first-run seed, idempotent init, restore after restart, first-run race between tabs, four recovery reasons with data untouched, recovery export, import and reset from recovery, migration with backup, failed backup, failed migration, storage unavailable, read failure with no seeding, memory mode, autosave status and retry, export, valid import, five corrupt-import kinds with nothing changed, newer-version message, failed import write, commands held during import, import racing an in-flight autosave, reset, failed reset, and the **full workflow across reloads on IndexedDB** |
| `domain/snapshot/snapshot.test.ts`     | 30    | Export contents, readability, absence of UI state, filename, exact round trips, malformed envelopes, future versions, structural errors with paths, the details cap, relationship errors (missing references, duplicate IDs, cycles, stale `currentTaskId`), unknown properties dropped, migrate-then-validate, invalid JSON, and every `migrateWorkspace` branch                                                                                                                                                                                                                                                    |
| `services/storage/storage.test.ts`     | 23    | A contract suite run against **both** implementations (create, save/load, revisions, conflicts, `'any'`, backup trimming and clearing, clear, no shared references), plus IndexedDB-only cases: reload, structure upgrade v1→v2 keeping data, failed upgrade leaving the database intact, newer database version, IndexedDB unavailable and later available, blocked upgrade, and quota and error mapping                                                                                                                                                                                                            |
| `services/storage/autosave.test.ts`    | 8     | No write without a change, sequential saves with revisions, no redundant writes, single flight with latest wins (held write, 3 changes → 2 writes, max concurrency 1), failure then retry, retry on the next change, refusal to overwrite another tab's data, pause waiting for the write in flight, and resume                                                                                                                                                                                                                                                                                                      |
| `app/boot/boot.test.tsx`               | 7     | Loading announcement, storage-error actions, recovery screen text, download, rejected import shown with details, two-step reset confirmation and cancel, and retry                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `domain/rules/taskTransitions.test.ts` | 51    | Changed: a cancelled dependency now blocks starting, and the error carries the waiver hint                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `domain/rules/dependencies.test.ts`    | 17    | Changed: `unresolvedDependencies` now includes cancelled tasks; new tests for `cancelledDependencies` and `openDependents`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `commands/changeTaskStatus.test.ts`    | 16    | Changed: a cancelled dependency blocks, the warning notification is raised, and the waiver via `updateTask` lets the task start                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `stores/workspaceStore.test.ts`        | 7     | Changed: the exported `commands` are refused before `initialize()` and work after it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

All other files are unchanged from Phase 1.1 and still pass. IndexedDB tests run on `fake-indexeddb`, which `src/test/setup.ts` installs for every test file.

**Full workflow test:** Create project → Create task → Assign Sarah → Start the task → Save → New storage connection, stores and lifecycle (the reload) → Restore. After the restore, the test checks:

- the whole workspace is deep-equal to the state before the reload;
- the assignee and status;
- `currentTaskId`;
- the derived status `working`;
- 0% progress;
- the four activity events in order;
- the notification count.

The test then continues to `done` and reloads a third time, which shows 100% progress.

### 8.2 Mutation check

I deliberately broke ten rules, one at a time, to confirm the tests notice. All ten were caught, and every file was restored.

| Deliberate break                                    | Tests that failed |
| --------------------------------------------------- | ----------------- |
| Storage accepts writes at any revision              | 3                 |
| Autosaver loses its single-flight guard             | 2                 |
| Autosaver drops the dirty check                     | 3 (+42 not run)   |
| Unusable saved data is replaced with the seed       | 6                 |
| Import installs the state before the write succeeds | 2                 |
| Pre-migration backup skipped                        | 2                 |
| Relationship validation skipped on restore          | 4                 |
| Future schema versions accepted                     | 6                 |
| Cancelled dependency treated as resolved again      | 3                 |
| Commands ignore the availability gate               | 8                 |

My first attempt at the last break only renamed a type field. That has no effect at runtime, so nothing failed. I replaced it with a real break of the gate check, and that was caught.

This was a manual spot check, not an automated mutation-testing tool.

### 8.3 Bugs found by the new tests

- When a database upgrade step failed, `idb`'s upgrade-transaction promise rejected with nothing handling it, which produced an unhandled rejection. Fixed in `indexedDbStorage.ts`.
- Two problems were in the tests themselves, not in the code, and were fixed.

### 8.4 Running the real app (headless Chrome, real IndexedDB, dev server)

These checks were driven over the Chrome DevTools protocol. No console errors were seen.

1. First boot: the loading screen gives way to the app shell, and the stored record is at revision 1 with 5 employees.
2. Reload: the record is still at revision 1, so nothing was re-seeded or rewritten.
3. The stored `schemaVersion` was edited to 99, then the page was reloaded. The recovery screen appeared with "This data uses schema version 99, but this version of Project HQ only understands versions up to 1. Update Project HQ and try again.", and the record was unchanged.
4. Clicking _Start fresh…_ then _Erase and start fresh_ brought the app to ready, with the record at revision 2 and schema version 1.

The import and export screens were not clicked through in the browser. Export and import have no UI outside the recovery screen until Phase 1.3; they are covered by the tests above.

**Build output:** app 380.96 kB (120.22 kB gzip), Phaser chunk 1,195.82 kB (319.16 kB gzip; unchanged), CSS 14.71 kB. The app grew by about 52 kB raw (16 kB gzip) since 1.1, because the commands, stores, `idb` and the boot UI are now part of the bundle.

**Dependencies added:** `idb` ^8.0.4 (runtime, TD-05) and `fake-indexeddb` ^6.2.8 (dev). `npm audit` still reports 7 moderate advisories, all in dev tooling, unchanged.

**Tooling:** `.claude` was added to `.prettierignore`. It holds local editor-assistant settings, and checking its formatting was failing `format:check`.

## 9. Known limitations

1. **Write protection is by lint, not at runtime.** This is unchanged from 1.1.
2. **There is no multi-tab sync.** A second tab's stale write is refused as a `conflict`, so data is never lost. But the losing tab only shows a save error that says to reload; it does not update itself.
3. **Save errors are not retried automatically.** Retry happens on the next change or when the user clicks Retry.
4. **The recovery download cannot be imported directly.** It contains the raw stored record wrapped in `project-hq-recovery` so that nothing is altered. Repairing it is manual.
5. **No backup is taken before an import or reset.** The confirmation step and export are the safeguard. Pre-migration backups are kept (newest 3), but there is no UI yet to restore one.
6. **Each save writes the whole workspace.** This is fine at Phase 1 scale with the activity and notification caps, but would need incremental storage at a much larger size.
7. **The export filename uses the UTC date.** Near midnight it can differ from the user's local date.
8. **Migrated snapshots are stamped with the app's schema constant.** Only tests use a configuration where the target version differs from that constant.
9. **Storage being evicted under browser storage pressure is not handled** (no `navigator.storage.persist()` request).
10. **"Continue without saving" cannot switch back to persistent mode** without a reload.
11. **Import, export and reset have no UI outside the recovery screen yet.** That is Phase 1.3/1.4 work.

## 10. Recommendations for Phase 1.3

1. Add a settings or workspace menu with **Export**, **Import** (with a summary preview and confirmation) and **Reset** (two-step confirmation, with export suggested first), calling `workspaceLifecycle`.
2. Build `Toast`, `Dialog` and `ConfirmDialog` primitives. Use them for import results, save errors and the reset confirmation, and move the save banner onto the shared components.
3. Show a quiet save indicator in the top bar (Saving… / Saved / Not saved) from `useAppStatus((s) => s.save)`.
4. Show a clear "Reload to continue" action when a save fails with `conflict`, and consider a `BroadcastChannel` notice that the workspace is open in another tab.
5. Consider calling `navigator.storage.persist()` after the first meaningful change, and showing storage usage in settings.
6. Keep the boot screens on the same layout primitives as the new shell so loading and error states match the app.
