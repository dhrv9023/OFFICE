# Project HQ — Technical Decisions

Format: decision · context · alternatives · consequences. Status: **Approved** (plan approved with amendments; amended entries are marked).

## TD-01: Domain logic is pure TypeScript, separate from React and Phaser

**Context**: Phaser and React both want to own state; the product will later swap simulated behaviour for real AI.
**Decision**: All rules (task transitions, status derivation, progress) live in `src/domain/` with no framework imports.
**Alternatives**: Rules inside store actions or components.
**Consequences**: Trivial unit testing; reusable by a future backend; slight indirection cost.

## TD-02: Zustand is the single source of truth; Phaser is a view

**Decision**: Phaser receives immutable view models and emits intents. It stores only ephemeral rendering state.
**Alternatives**: Phaser registry/data manager as shared state; Phaser entities holding employee data.
**Consequences**: Reload and testing are deterministic; some mapping code (`StoreBridge`); no hidden state in the canvas.

## TD-03: Typed in-house event bus for Phaser → React

**Decision**: ~30-line typed emitter in `bridge/`, not a library and not Phaser's own `EventEmitter` exposed across layers.
**Alternatives**: `mitt`, `eventemitter3`, direct store imports inside Phaser.
**Consequences**: Zero dependency; game layer stays decoupled from stores; the union type documents the whole contract.

## TD-04: Store → Phaser through a bridge adapter, not direct imports

**Decision**: `StoreBridge` subscribes with selectors and calls `scene.applyViewModel`. Scene never imports `stores/`.
**Consequences**: Scene is testable/mountable in isolation; one place to optimise update frequency.

## TD-05: IndexedDB through the `idb` library _(amended on approval; implemented in Phase 1.2)_

**Decision**: Use `idb` (tiny promise wrapper) behind our own `StorageService` interface; versioned migrations; snapshot writes. Installed in Phase 1.2. "Debounced" writes were replaced by the single-flight autosaver of TD-32.
**Alternatives**: Hand-written wrapper (originally proposed; rejected — not worth owning), Dexie (heavier).
**Consequences**: One small dependency; the interface keeps the implementation replaceable (e.g. a remote backend later).

## TD-06: Tailwind CSS v4 via the Vite plugin, CSS-variable design tokens

**Decision**: Tailwind for styling, tokens (colours, department colours, radii) as CSS variables so dark mode and theming are cheap later.
**Alternatives**: Tailwind v3 + PostCSS; CSS modules.
**Consequences**: Minimal config; verify v4 compatibility at scaffold time and fall back to v3 if a blocker appears.

## TD-07: Isometric 2.5D pixel-art office; art behind a texture-provider seam _(amended on approval)_

**Context**: The approved visual reference is a classic isometric social-sim office (diamond floors, thick colourful walls, cutaway rooms, detailed furniture, small characters). A flat top-down map is explicitly rejected.
**Decision**: 2:1 isometric projection on a 64×32 tile grid. All positions are tile coordinates; projection, picking and depth come from pure functions in `game/iso/isoMath.ts`. Depth sorting by `(col + row)` with per-tile layers; grid-based collisions and A* in tile space; no physics engine. Scenes request textures by key from a provider, so Phase 1 can use procedurally drawn pixel art and later phases can drop in custom sprite sheets and tilesets without touching scenes.
**Alternatives**: Flat top-down (rejected), Phaser's isometric Tilemap + Tiled editor (viable later for authoring; adds a tool and file format before we have art), a 3D engine (overkill).
**Consequences**: More up-front structure (depth, multi-tile furniture, wall cutaways) than top-down. Procedural art will not match the reference's richness — the reference is the target for the later art pass, and its assets are not to be copied.

## TD-08: Lazy-load Phaser

**Context**: Phaser is ~1 MB minified.
**Decision**: Dynamic `import()` in `OfficeView`; the shell, forms and boards render without it.
**Consequences**: Faster first paint; need a loading state and an error state for chunk failure.

## TD-09: Task progress is user-driven; no simulated work

**Context**: Rule 12 forbids fake AI that pretends to be real.
**Decision**: Employee status is derived from real task state set by the user. Cosmetic idle wandering is allowed but never logged as activity and never labelled as work. `AgentService.capabilities.canExecuteTasks = false` in Phase 1.
**Consequences**: Honest UX; the office feels less "alive" until Phase 2, mitigated with ambient animation.

## TD-10: AgentService seam defined now, implemented later

**Decision**: Interface with capability flags and async-iterable event streams (supports streaming, cancellation via `AbortSignal`). Phase 1 ships only the no-op manual implementation.
**Alternatives**: Do nothing until Phase 2; define a promise-only API.
**Consequences**: Small upfront cost; avoids redesigning commands later. Risk of speculative design — kept deliberately minimal and revisited at Phase 2.

## TD-11: One canonical workspace state; commands as the only write path _(amended in Phase 1.1)_

**Decision**: All durable business data is one immutable `WorkspaceState` in a single Zustand vanilla store. Command handlers are pure `(state, input, context) → Result<next state>` functions; a binder commits the next state with one `setState`. The store has no actions and is importable only by `commands/` (lint-enforced).
**Alternatives**: Separate stores for workspace, activity and notifications (originally proposed). Rejected: a single business change spans all three, and separate stores would expose intermediate states to subscribers and to persistence.
**Consequences**: Atomic commits; trivial testing (no store or mocks needed for handler logic); persistence in 1.2 can snapshot one value. Selectors that build arrays need `useShallow` at the call site.

## TD-12: Client-side routing with `react-router` _(amended on approval)_

**Decision**: `react-router` data router with one route per top-level view. Since Phase 1.3: `/` (dashboard), `/office`, `/projects`, `/employees`, `/tasks`, `/activity`, `/settings`. Paths live in `app/navigation.ts`.
**Alternatives**: No router (originally proposed), hand-rolled history handling.
**Consequences**: Deep links and back/forward work; one dependency; static hosting needs an SPA fallback.

## TD-13: Tooling and testing

**Decision**: Vite, TypeScript `strict`, ESLint + Prettier, Vitest (+ Testing Library for a few components), `npm run check` script. No E2E initially.
**Consequences**: Fast feedback; Phaser rendering tested manually, with logic pushed into pure testable functions.

## TD-14: Dependency budget

Runtime: `react`, `react-dom`, `phaser`, `zustand`, `lucide-react`. Styling: `tailwindcss` (+ Vite plugin). Dev: `typescript`, `vite`, `@vitejs/plugin-react`, `eslint` (+ TS plugin), `prettier`, `vitest`, `@testing-library/react`, `jsdom`.
Explicitly avoided: UI kits, router, form libraries, state-machine libraries, ID libraries (`crypto.randomUUID`), date libraries (`Intl`), event-bus libraries.

## TD-15: Identifiers and time _(amended in Phase 1.1)_

**Decision**: IDs are strings with a kind prefix that is part of the type (`task_…`, `emp_…`, `prj_…`), minted only by an injected `IdGenerator`. Timestamps are ISO-8601 UTC strings from an injected `Clock`. Seed IDs are human-readable constants (`emp_sarah_chen`).
**Consequences**: Mixing ID kinds is a compile error; tests are fully deterministic; IDs are self-describing in logs and storage.

## TD-16: Dark theme first, token-driven _(amended in Phase 1.3)_

**Decision**: Dark is the default; a light theme and "follow system" were added in Phase 1.3 as the user-requested settings. Colours are `--hq-*` custom properties scoped by `[data-theme]`, exposed to Tailwind v4 through `@theme inline`. Components use semantic utilities only (`bg-surface`, `text-muted`), never raw hex.
**Consequences**: A light theme is an additive CSS block; the Phaser palette is separate (`game/config.ts`) because the office keeps its own colours regardless of UI theme.

## TD-17: One validated command interface for humans and future agents

**Decision**: Commands take an `actor` and return a typed `Result`. They are the only code allowed to write to stores, and they always validate through `domain/rules`. AI agents (Phase 2) request transitions through these same commands; they never touch Zustand or bypass validation. Employee status is derived, never assigned.
**Consequences**: No second code path to secure later; activity log can attribute every change to its actor.

## TD-18: Layer boundaries enforced by lint

**Decision**: `no-restricted-imports` rules per folder (see ARCHITECTURE §13). Verified in Phase 1.0 by a probe file that imported Zustand from `domain/` and was rejected.
**Consequences**: Architectural drift fails `npm run check` instead of relying on review.

## TD-19: One active task per employee; blocked tasks do not occupy

**Decision**: An employee may hold many queued and blocked tasks but at most one _active_ task (in progress or in review). Starting or resuming a task is rejected while the assignee has another active one.
**Alternatives**: Unlimited parallel tasks (status derivation becomes ambiguous); treating blocked as occupying (would stop a queued task from ever being marked blocked while its assignee works on something else).
**Consequences**: Work status and the office animation have one unambiguous answer. Revisit if agents later need parallelism.

## TD-20: Work status is derived; presence is a separate, later axis

**Decision**: `idle | working | reviewing | blocked` is computed from tasks and never stored. Presence states (`in_meeting`, `on_break`) cannot be derived from tasks, so they are not faked: they are left out until Phase 1.6, where they become explicit state beside work status.
**Consequences**: The earlier single `EmployeeStatus` enum mixing both ideas is gone.

## TD-21: `currentTaskId` is stored but single-writer

**Context**: The employee model includes `currentTaskId`, which is derivable from tasks.
**Decision**: Keep the field, but write it only in `syncCurrentTasks`, which every task-changing command runs through `commit()`. `validateWorkspace` flags any mismatch.
**Consequences**: Cheap lookups for the UI and the office; no drift. If it ever proves troublesome it can become a pure selector without changing callers much.

## TD-22: Cancelled tasks are excluded from progress

**Decision**: progress = done ÷ (total − cancelled) × 100, rounded. No counted tasks → 0%.
**Alternatives**: Count cancelled as complete (inflates progress); count as outstanding (100% becomes unreachable).

## TD-23: Done and cancelled are terminal and immutable

**Decision**: No transition leaves `done` or `cancelled`; closed tasks cannot be edited or reassigned (they can be deleted). Reopening would be a deliberate change to the transition table.
**Consequences**: Progress never silently regresses. Mistaken completion requires creating a follow-up task — acceptable for now, noted as a known limitation.

## TD-24: Review is mandatory before done

**Decision**: `in_progress → done` is not allowed; work passes through `in_review`.
**Consequences**: One extra step for the operator; a natural hook for future reviewer agents.

## TD-25: Dependencies gate starting; only done resolves them _(amended in Phase 1.2)_

**Decision**: Dependencies must be tasks of the same project and acyclic. They are checked when work _starts_ (todo/blocked → in_progress). A dependency is resolved only when **done**. A cancelled prerequisite keeps blocking: the start is rejected with `dependencies_incomplete`, which lists the cancelled IDs and says to remove or replace them. The **waiver is explicit**: the user edits the dependent task's dependencies (`updateTask`), which is recorded in the activity log. Cancelling a task with open dependents raises a warning notification. Deleting a task removes it from its dependents.
**Alternatives**: Cancelled counts as resolved (Phase 1.1; rejected on review — it silently treats called-off work as delivered); a separate stored waiver flag per dependency (more state, same effect as removing the dependency).
**Consequences**: Downstream work never starts on a prerequisite that was not delivered without a human decision; one extra step for the user.

## TD-26: Cross-department assignment needs an explicit flag

**Decision**: Assignment requires matching departments unless the caller passes `allowCrossDepartment: true`. The flag is per call and is not stored.

## TD-27: Activity is history; notifications are pointers

**Decision**: Activity events keep the IDs of entities even after deletion and carry a pre-rendered description. Notifications must point at something that exists, so deletes clear `relatedEntityId`. Marking notifications read records no activity. Both lists are capped (1,000 events, 200 notifications; oldest dropped).

## TD-28: Archived projects are read-only _(amended in Phase 1.4)_

**Decision**: Tasks of an archived project cannot be created, edited, assigned or moved (they can be deleted). Since Phase 1.4 the project's own details cannot be edited either: the only change an archived project accepts is a status change that restores it (TD-39).

## TD-29: The workspace is persisted as one versioned snapshot record

**Decision**: IndexedDB holds a single `workspace` record (key `current`) containing the whole workspace as entity lists, plus a `backups` store. The same snapshot format (and schema version) is used for export files.
**Alternatives**: One object store per entity (originally planned) — needs multi-store transactions and per-store diffing to stay consistent with the single in-memory value.
**Consequences**: Every save is one atomic put; rewrite cost is the whole workspace (small at Phase 1 scale; capped activity/notification lists).

## TD-30: Two independent version numbers

**Decision**: `DATABASE_VERSION` (object stores, `DATABASE_UPGRADES` in `onupgradeneeded`) is separate from `SNAPSHOT_SCHEMA_VERSION` (data shape, pure `SnapshotMigration` chain in `domain/snapshot`). Migrations are one step per version, never edited after release, and never guess: an unknown, newer or failed version is an error. Before a migrated record is saved, the original is kept as a `pre-migration` backup (newest 3 kept).
**Consequences**: Data migrations are pure and unit-testable without a browser and apply equally to imports.

## TD-31: Storage-owned revisions with optimistic concurrency

**Decision**: Every save names the revision it expects to replace and is refused with `conflict` (in the same transaction) if the stored revision differs. Import and reset use `'any'`.
**Consequences**: Stale writes — including a second tab — can never overwrite newer data; they surface as a save error. Full multi-tab sync is still deferred (R12).

## TD-32: Autosave is immediate, single-flight and latest-wins — no timers

**Decision**: The autosaver reacts to workspace changes (which only successful commands produce), writes at most one snapshot at a time, and after each write saves the newest state if it changed. Unchanged state is detected by reference.
**Alternatives**: Debounced timer (arbitrary delay, data loss window on close, harder to test).
**Consequences**: Bursts of commands collapse into at most two writes; writes cannot complete out of order. A failed write leaves the state dirty and is retried on the next change or on demand.

## TD-33: Startup never replaces saved data automatically

**Decision**: Saved data that fails `restoreWorkspace` puts the app in `recovery_required` and is left exactly as stored. Storage failure puts it in `error`; nothing is seeded or written. Seed data is used only when storage confirms nothing has been saved, or on an explicit, confirmed reset. Commands are rejected (`workspace_unavailable`) until the app is `ready`.
**Consequences**: A bug or corruption can never silently cost the user their company; the recovery screen gives export-as-is, import, retry and reset.

## TD-34: Whole-workspace operations are human-only and storage-first

**Decision**: Hydration, import, reset and recovery live in `commands/workspaceLifecycle.ts`, are the only writer besides business commands, take no `Actor`, and are not part of `Commands`. Import/reset write to storage first and install the new state only after the write succeeded; reset also clears backups in the same transaction. No pre-import backup is kept — the user is expected to export first.
**Consequences**: Agents cannot replace or erase the workspace; a failed import/reset changes nothing in memory or on disk.

## TD-35: Own UI primitives, no component library

**Decision**: Build the primitives in `src/components/` on Tailwind and native elements (native `<select>`, radio inputs), following the WAI-ARIA patterns for dialog, menu button, tabs and tooltip, with focus handling shared in `components/overlay.ts`.
**Alternatives**: Radix / Headless UI / a full kit. Rejected for now under TD-14 (dependency budget); the set needed is small and fully tested.
**Consequences**: ~1 kLOC we own; behaviour is covered by component tests. Revisit if complex widgets (combobox, date picker) are needed.

## TD-36: Interface preferences live in localStorage, not the workspace

**Decision**: Theme and sidebar state are per-browser preferences stored by `services/preferences.ts` and held in `stores/preferencesStore.ts`. Every access tolerates blocked storage.
**Consequences**: Import, export and reset never touch them; they are not shared across devices.

## TD-37: Import is validated before the user confirms

**Decision**: `workspaceLifecycle.previewImport(json)` runs the same `restoreWorkspace` gate as import and returns a summary without writing anything. Settings shows errors (with details) immediately, or a confirmation comparing the current workspace with the file. `importWorkspace` validates again when confirmed.
**Consequences**: Users never confirm a file that will fail; the gate stays the single source of truth.

## TD-38: The dashboard derives everything per render of the workspace value

**Decision**: Pages subscribe to the whole immutable `WorkspaceState` and compute views with `useMemo` over pure selectors, instead of many fine-grained subscriptions returning new arrays.
**Consequences**: No stale or stored derived data and no `useShallow` pitfalls; the dashboard re-renders on any workspace change, which is cheap at Phase 1 scale. Revisit with memoised selectors if it shows up in profiling.

## TD-39: Project lifecycle has an explicit transition table

**Context**: Until Phase 1.4 any project status could be set to any other.
**Decision**: `domain/rules/projectTransitions.ts` lists the legal moves — planning → active · on_hold · archived; active → on_hold · completed · archived; on_hold → active · planning · archived; completed → active (reopen) · archived; archived → planning · active (restore). Completing requires every task of the project to be done or cancelled. A completed project accepts no new tasks until reopened. Projects are **never completed automatically**; finishing the last task only raises the existing "All tasks complete" notification. Rejections use the new `invalid_project_transition` error and the `project_open_tasks` / `project_completed` conflict reasons.
**Alternatives**: Keep free status changes (allowed nonsensical moves such as planning → completed); auto-complete on the last task (removes a human decision).
**Consequences** _(amended in Phase 1.4.1)_: The at-rest part of the rule (`checkProjectState`: a completed project has no open tasks) is part of `validateWorkspace`, so saved and imported data are held to it (TD-43).

## TD-40: The UI asks the domain what is possible, and the command decides

**Decision**: Affordances are computed with the same pure rule functions the commands run — `checkStatusChange` for every status-menu entry and Kanban column, `checkAssignment` / `checkUnassignment` for each person in the assignee picker, `checkProjectStatusChange` for lifecycle actions. Disabled options show the rule's own message. Every mutation still goes through `commands`, and a rejected command is shown verbatim (toast, or field error for `validation` errors). React components contain no business rules of their own.
**Consequences**: The UI cannot disagree with the commands, and messages are consistent everywhere. The only UI-side mirror is `taskLockReason` (archived project / closed task), which reproduces the commands' read-only guard for display; the command remains authoritative.

## TD-41: Native HTML5 drag and drop, plus a menu on every card

**Decision**: The Kanban board uses native `draggable` / drag events (no library). Dropping runs `changeTaskStatus`; the board never moves a card optimistically, so a rejected move leaves the card in place and shows the reason. Each card also has a status menu, which is the keyboard, screen-reader and touch path (HTML5 drag does not work on touch screens).
**Consequences**: Zero dependency cost; touch users move cards through the menu, not by dragging.

## TD-42: The open task lives in the URL

**Decision**: Task details open in a side sheet controlled by `?task=<id>`, mounted once in the shell, so any page can open a task and links/back button work.

## TD-43: Saved data is validated against current invariants; repair is explicit

**Context**: Phase 1.4 added a project rule that only ran inside commands, so workspaces saved earlier could load in a state the commands can no longer produce (a completed project with open tasks).
**Decision**: Rules that describe a valid state (not a valid move) live in the domain as state checks and are called by `validateWorkspace`, which the restore gate already runs for every load and import. Violations stop startup in `recovery_required` with the record untouched. When the only problems are ones with a deterministic, lossless fix, the recovery screen offers it: `repairRecords` reopens such projects (completed → active, the domain's own reopen transition). The repair runs only on the user's confirmation, stores the original record as a `pre-repair` backup first, writes with the revision guard, and goes live only after the write. No schema migration: the data shape did not change, so `SNAPSHOT_SCHEMA_VERSION` stays 1.
**Alternatives**: A version-bump migration that silently reopens projects (changes user data without consent); rejecting with no repair (forces a reset or hand-editing JSON).
**Consequences**: Valid historical data loads unchanged; invalid data is never lost. Any future state invariant must be added to `validateWorkspace` in the same change.

## TD-44: Screen-relative controls with tile-axis diagonals

**Decision**: Up/Down/Left/Right move up/down/left/right on screen; the four diagonals follow the floor's tile axes (the slopes walls and corridors run along), not 45°. Speed is constant on screen (150 px/s) in all eight directions, with a 0.09 s ramp up and 0.07 s stop.
**Alternatives**: Keys mapped to tile axes (Up = north-west — unintuitive); 45° screen diagonals (holding two keys zig-zags into corridor walls).
**Consequences**: Walking a corridor is one key pair held down; tested for equal speed in every direction and measured in Chrome (148–165 px/s).

## TD-45: Continuous tile-space movement with box collision and corner assist

**Decision**: The founder has a fractional tile position and a 0.4-tile square footprint. Walls (thin strips on tile edges), blocking furniture, desks and seats are tile-space boxes. Each axis resolves separately (sliding along walls), long steps are sub-stepped, and when walking straight into a corner or just beside a doorway the founder is nudged sideways by up to 0.3 tile. No physics engine; collision geometry is built from layout data, never from art.
**Consequences**: No snagging on corners or doorframes; a randomised 6,000-move walk never ends inside anything and explores widely.

## TD-46: Cut-away walls

**Decision**: Only the outer north and west walls are tall (84 px, windows, baked into the static floor texture). Interior partitions and front walls are low (14 px) and depth-sorted per edge.
**Consequences**: Characters are never hidden by walls; rooms stay readable from any position. Walls are partitions visually, not floor-to-ceiling.

## TD-47: Original procedural pixel art, generated at start-up

**Decision**: All art is drawn in code: characters as pixel buffers with outlines (front/back, mirrored for left/right), furniture from isometric boxes, the floor and back walls baked into one texture. No image files, no third-party assets.
**Consequences**: Zero licensing risk and no asset loading; consistent style; texture keys are stable, so sprite sheets can replace generators later without touching scenes.

## TD-48: Office keyboard input is bound to a focusable element

**Decision**: Phaser's global keyboard is disabled. The scene reads keys from the focusable office element only, releases them on blur and hidden tabs, and ignores keys aimed at buttons inside the office and modifier shortcuts.
**Consequences**: Typing anywhere in the app never moves the founder; the user clicks (or tabs to) the office to play.

## TD-49: Furniture is layout data in the domain

**Decision**: `OfficeLayout.furniture` (kind, footprint, facing, blocking, interaction) sits beside rooms, doors and desks, validated by `validateOfficeLayout`.
**Consequences**: Rendering, collision and interaction share one source; Phase 1.6 employee navigation can use the same data.

## TD-50: Development-only debug handle

**Decision**: In development builds `window.__projectHqOffice.state()` returns the founder's position, zoom and FPS for browser tests. It is compiled out of production builds (verified).

## TD-51: Inter, self-hosted

**Decision**: Use Inter (variable, OFL) via `@fontsource-variable/inter` 5.3.0, bundled with the app (only the 48 kB Latin file is downloaded; other subsets load by unicode-range if needed). No external font requests.
**Alternatives**: System font stack (inconsistent across platforms; the earlier stack named Inter but never loaded it); Google Fonts link (third-party request).
**Consequences**: One small, exact-pinned dependency; consistent typography everywhere.

## TD-52: One type scale, one radius scale, borders over shadows

**Decision**: Text uses Tailwind's scale only — nothing below 12 px; body 14 px. Radii: 4 (labels) · 6 (controls) · 8 (rows, panels) · 10 (cards) · 12 (dialogs), set as theme tokens. Dark surfaces are separated by borders, not shadows. Badges are quiet tinted labels without outlines. Colour is reserved for meaning (status, department, the amber accent).
**Consequences**: No ad-hoc sizes (36 removed); every component inherits the same rhythm.

## TD-53: The office page is full-bleed with a contextual inspector

**Decision**: The office canvas fills the content area with no card or page padding; overlays (location, zoom, controls hint) sit on it. A full-height inspector rail replaces the floating panel and switches between overview, nearby preview and detail views (employee, department, meeting room, room, object). It shows live data and only actions the app already supports. Top-level pages show only a title (breadcrumbs only on nested pages); the workspace switcher lives in the sidebar header.
**Consequences**: The office gets most of the screen; the inspector is the natural home for Phase 1.6 actions.

## TD-54: The space around the office follows the theme

**Decision**: The game handle gains `setBackdrop(color)`; the backdrop around the office follows the light/dark theme. The office art itself does not change with the theme (TD-16 still holds for the art).

## TD-55: Portraits are the office characters, from one shared art module

**Decision**: The character drawing code moved from `game/` to a framework-free `src/art/` layer (`characters`, `pixelBuffer`, `portrait`), used by both Phaser (sprite textures) and React (avatars). A portrait is a square crop of the same front-facing idle frame (`head` 16 px for small sizes, `bust` 24 px for large), emitted as one SVG path per colour, so it renders without a canvas and is cached per person and crop. ESLint keeps `art/` free of framework and cross-layer imports.
**Alternatives**: Initials avatars (generic, and disconnected from the office); rendering sprites to data URLs through a canvas (needs a canvas, untestable in jsdom).
**Consequences**: The person in the sidebar, the task card and the office is visibly the same character, shirt in their department colour. Tests check that portraits match the sprite pixel for pixel.

## TD-56: One status language

**Decision**: Status colour means the same thing everywhere: amber for active work (working, in progress, active project), cyan for awaiting review, red for blocked, green for done, grey for idle, to do, planning and archived. Status is drawn as a circle, a department as a rounded square, and priority as signal bars, so the three never read alike. Colour is always paired with a text label. The mapping lives in `features/common/presentation.ts`.
**Consequences**: Badges, dots, the kanban columns, the dashboard and the team presence strip agree with each other; adding a status means adding one row.

## TD-57: Renaming an employee is a command; history keeps the old name

**Decision**: `renameEmployee` changes only `Employee.name`: trimmed, 1–80 characters, any characters except control characters (so spaces, hyphens, apostrophes, accents and non-Latin scripts are fine). The ID, desk, avatar key and every task reference are untouched, so the new name appears wherever the employee is shown, because every view reads it from state. An `employee.renamed` event is logged. Activity and notification text is rendered at write time, so earlier entries keep the name they were written with.
**Consequences**: No migration of references; historical accuracy preserved; integrity checks reject a blank or untrimmed stored name.

## TD-58: A character's look is keyed by `avatarId`, not by name

**Decision**: `employeeLook` (office sprite) and `employeePortrait` (interface avatar) hash `lookSeed(avatarId)` instead of the display name. Seed keys are `avatar_first_last`, which `lookSeed` reads back as "First Last", exactly the string the original looks were hashed from, so every existing character is pixel-identical (pinned by a test). The office view model carries `avatarId`; the sprite updates its name tag when the name changes.
**Alternatives**: Keep hashing the name (a rename would change someone's face); store explicit look parameters on the employee (a schema change for no user-visible gain now).

## TD-59: Schema version 2: task deadlines and meetings

**Decision**: Tasks gain an optional `deadline` (`YYYY-MM-DD` or null, same validation as projects), set through `createTask`/`updateTask`. The workspace gains a `meetings` collection. `SNAPSHOT_SCHEMA_VERSION` is 2, and migration 1 → 2 adds `deadline: null` to every task and `meetings: []`. Older saves and exports are upgraded with the existing pre-migration backup; tests that faked a v2 now fake "current + 1".
**Consequences**: A Phase 1.5 database opens unchanged in content (verified in the browser against a real v1 IndexedDB record).

## TD-60: Meetings are records the founder keeps

**Decision**: `Meeting { title, agenda, roomId, participantIds, status: scheduled | completed | cancelled, notes }` with `scheduleMeeting`, `completeMeeting` (founder-written notes) and `cancelMeeting`. Rules: the room must be a meeting room; 1–20 distinct existing employees; held/cancelled meetings are closed. Each command logs activity. Nothing is simulated: employees do not walk to the room or speak, and there is no meeting time yet (presence and movement are future work).

## TD-61: "Talk" without a messaging model

**Decision**: The Talk view shows the real activity record between the founder and the employee, plus a disabled composer that says plainly that messaging arrives with AI agents. No message entity, no stored drafts, no generated replies. A message model belongs with the agent backend (Phase 2), where messages have a consumer.

## TD-62: Meeting times are local wall-clock values; nothing starts by itself

**Decision**: A meeting stores `startsAt` as a local `YYYY-MM-DDTHH:mm` with no time zone, and `durationMinutes` (15–480, 5-minute steps). The domain compares meetings only with each other, never with the system clock. Lifecycle: `scheduled → in_progress → completed`, `scheduled → completed` (recorded afterwards), and `scheduled → cancelled`. Held and cancelled meetings are closed. A meeting is never started or completed because its time passed; the founder does both. Clash rule: two open meetings clash if they overlap in time and share the room or a participant. Back-to-back meetings don't clash, and cancelling releases everyone. "Not in the past" is a UI policy, since it needs the clock; the domain stays clock-free.
**Alternatives**: UTC instants (they shift when the device moves time zones, which is wrong for an office calendar); auto-completing on time (invents events).

## TD-63: Presence is derived from running meetings; seats are resolved in the bridge

**Decision**: `deriveEmployeePresence` returns `at_desk` or `in_meeting`, from meetings with status `in_progress` only. The office view model gives in-meeting people a meeting-room chair (chairs in id order, assigned in invitation order; anyone beyond the chairs keeps their desk) and a meeting bubble. The scene replaces a sprite when its seat changes. Moving between seats is instant: walking needs pathfinding (the navigation grid, waypoints and A* listed under "Movement and animation").
**Consequences**: The office shows what the data says, never a guess. Movement can later animate between the seats this function already decides.

## TD-64: Schema version 3

**Decision**: Meetings gain `startsAt`, `durationMinutes` and `projectId`. Activity events gain `meetingId`. Tasks gain `blockedReason`, set when a task is blocked with a reason and cleared when it moves on. Migration 2 → 3 adds nulls and invents nothing: older meetings show "No time set", and older blocked reasons stay in the activity text. Verified on a real stored v2 record in the browser, with the pre-migration backup.

## TD-65: Deadline rules take "today" from the caller

**Decision**: `isOverdue` and `isDueWithin` (domain) compare calendar days and take `today` as a parameter. The UI passes the user's local day. Filters, cards, the drawer and the dashboard selector all use these same functions. Finished or cancelled work is never overdue, and work due today is not overdue. Overdue is shown with an icon and the word "Overdue", not colour alone.

## TD-66: Save conflicts are resolved by an explicit choice, with a backup

**Decision**: When another tab saved newer data, saving stops (as before) and the banner explains it. It offers **Reload**, which uses the other tab's version, or **Keep this tab's version**, which asks for confirmation, stores the newer saved record as a `pre-overwrite` backup, then writes with `expectedRevision: 'any'`. Retry never overwrites. A `beforeunload` prompt appears only while a save is in flight, has failed, or storage is unavailable. Settings → Storage lists browser backups as downloads that can be imported again.
**Alternatives**: Last write wins (silent data loss); automatic merge (no safe merge exists for whole-workspace snapshots).

## TD-67: Route-level code splitting deferred

**Decision**: Not done in Phase 1.7. The game engine (Phaser, 330 kB gzip) already loads lazily, and the app chunk is 177 kB gzip, most of it React, the router and libraries. Lazy routes would make every page render asynchronously and require reworking about 40 synchronous page tests, for a modest saving. Revisit when the app chunk passes 250 kB gzip or first load is measured as slow.

## TD-68: Browser verification scripts live in the repository

**Decision**: `scripts/browser/` holds the CDP driver (`cdp.mjs`), a read-only every-route capture (`pages.mjs`) and the phase scenario (`phase-1-7.mjs`). They use Node's built-in WebSocket and headless Chrome, with no new dependencies, and are linted as plain Node scripts. Earlier harnesses lived in temporary folders and were lost.

## TD-69: Authorization lives in the command binding

**Decision**: `bind()` in `createCommands` authorizes every call before its handler runs. The order is:

1. Actor identity, then standing (an agent's access profile must be `active`).
2. The permission each action needs, on the resource it names, at a covering scope.
3. The approval policy.

The founder (`user`) has full authority and never needs approval. **System processes take no business actions.** An agent calling a command that needs approval gets `approval_required` and nothing changes. Handlers are unchanged and stay authoritative for business rules. The policy (`domain/rules/access.ts`) is pure and only decides who may act; it does not re-check business validity.
**Alternatives**: Checks in React (not security); a separate service layer in front of the commands (a second path that could be skipped).
**Consequences**: The UI, the office, the executor and any direct caller go through the same gate.

## TD-70: Access profiles: one per employee, grants with scopes, every profile starts disabled

**Decision**: `AccessProfile { employeeId, status: disabled | active | suspended, grants[] }`. Each `Grant` has a `permission` (one per thing the commands can do), a `scope` (`own`, `department`, or `any`, limited per permission) and `requiresApproval`. The default grants depend on the role: the project manager organises work, and specialists move their own work forward. No default grant can delete, rename, archive or complete. **Founder-only permissions** (`access.manage`, `approval.decide`, `notification.manage`) can never be granted; validation refuses them. The employee ID is the agent's identity, so a rename never changes it.

## TD-71: Approval policy: fixed rules plus "ask me first"

**Decision**: A small set of actions always needs the founder when an agent asks: deleting a project or task, renaming someone, completing or archiving a project, and taking work away from another employee. The founder can also mark any grant "ask me first". The founder is the only approver; agents can withdraw their own requests.

## TD-72: The execution registry records outcomes, keyed by idempotency

**Decision**: Every request through the executor produces one `Execution`: `succeeded`, `failed`, `denied`, `awaiting_approval`, then `rejected` or `cancelled`. Execution is synchronous and local, so "requested, authorized, running" happen inside one commit and only the outcome is stored. Requests carry a caller-chosen `requestId`; the same employee and key never runs twice (an identical repeat returns the first result, and a different action under that key is refused). Retrying is explicit: `retry(executionId, newRequestId)` works only for `failed` executions, links `retryOf`, and goes through the whole pipeline again. The registry holds action inputs as the app produced them; there are no credentials in the domain to store. It is capped at 1000 records.
**Founder actions** done in the UI are not execution records: they are the authority, and the activity log records them. The registry is about what AI employees asked to do.

## TD-73: Approval integrity: content versions, re-authorization and a dry run at decision time

**Decision**:

- **At request time:** the action is validated by a dry run of its handler (nothing committed) and frozen as `{type, input}`, together with the target's **content version**, a 53-bit hash of the entity's JSON.
- **At approval time,** in one commit:
  1. the target must have the same version (any change, even within the same millisecond, makes the request **stale**);
  2. the requester must still be authorized;
  3. the handler must still succeed.
- **Outcome:** only then is the action applied, as the requesting agent, together with the approval record. A failure at any step marks the request stale with the reason and applies nothing.
- **Closed requests:** decided requests are closed, so approving twice is refused.

A timestamp-based version was tried first. A flaky UI test exposed that two edits within one millisecond went undetected, so versions are content-based (tested).

## TD-74: Schema version 4

**Decision**: The workspace gains `accessProfiles`, `approvals` and `executions`. Migration 3 → 4 gives every employee a **disabled** profile with role defaults (timestamp: the employee's own `createdAt`, so it is deterministic) and empty histories. Integrity checks cover one valid profile per employee, valid grants, pending approvals pointing at a living requester and execution, and unique request keys. Verified on a real stored v3 record in the browser, with the pre-migration backup.

## TD-75: Agents receive an identity-bound gateway, nothing more

**Decision**: `gatewayFor(employeeId)` returns a frozen object with `request`, `retry` (own executions only) and `cancel` (own requests only), bound to that employee by the application. A runner holding a gateway cannot claim another identity, and has no access to the raw commands or to workspace import, export and reset (which remain founder UI functions in the lifecycle). An "external integration" actor kind is not added until something uses it.
**Limitation**: This is a local, single-user app. Code running in the page could still construct a founder actor. The boundary is meaningful for agent runners that are only ever given a gateway (and, later, for a server that holds the founder's session).

## Risk register

Added with the isometric direction: **R15** depth-sorting artefacts with multi-tile furniture and walls (mitigate: front-most-tile rule, per-tile layers, wall cutaways); **R16** procedural pixel art falling well short of the reference (mitigate: texture-provider seam, dedicated art pass); **R17** blurry pixels at fractional zoom/DPR (mitigate: integer zoom, `pixelArt`, whole-pixel positions).

| #   | Risk                                                                          | Likelihood | Impact | Mitigation                                                                                     |
| --- | ----------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------- |
| R1  | Phaser becomes a hidden second source of truth                                | Medium     | High   | TD-02/04: view-model-only input, intents-only output; code review rule                         |
| R2  | React StrictMode double-mounting creates duplicate/leaking Phaser instances   | High       | Medium | Idempotent create/destroy in effect cleanup; test mount/unmount cycles                         |
| R3  | Canvas resize/DPR/layout bugs in responsive panels                            | High       | Medium | `ResizeObserver` + Phaser Scale manager; test at several viewport sizes                        |
| R4  | Visuals look amateurish without art assets                                    | Medium     | Medium | Strong palette, lighting/shadow tricks, consistent grid; isolate asset layer for later upgrade |
| R5  | Pathfinding/movement jitter, employees overlapping or getting stuck           | Medium     | Medium | Grid A*, reserved desk cells, snap-on-arrival, fallback teleport on timeout                    |
| R6  | Store↔Phaser update storms cause jank                                         | Low        | Medium | Selector-based subscription, diff in scene, batch commands                                     |
| R7  | IndexedDB failures (private mode, quota, blocked upgrades) or corrupt data    | Medium     | High   | Mitigated in 1.2: error/recovery states, memory fallback, restore gate, backups, export-as-is  |
| R8  | Schema churn between phases breaks stored data                                | Medium     | Medium | `schemaVersion` + migrations from day one                                                      |
| R9  | Over-engineering the AI seam before requirements are known                    | Medium     | Low    | Keep `AgentService` minimal; revisit in Phase 2                                                |
| R10 | Office feels "dead" with no autonomous behaviour (and fake work is forbidden) | Medium     | Medium | Ambient cosmetic animation, clear status visuals, honest UX copy                               |
| R11 | Tailwind v4 / Phaser version quirks with Vite                                 | Low        | Low    | Pin versions at scaffold; fall back to Tailwind v3 if needed                                   |
| R12 | Multiple tabs overwrite each other's data                                     | Low        | Medium | Deferred; document, later use BroadcastChannel / storage lock                                  |
| R13 | Accessibility gap: a canvas is opaque to screen readers                       | Medium     | Medium | All office actions reachable via React roster/panels; canvas treated as enhancement            |
| R14 | Bundle size (Phaser) harms load                                               | Medium     | Low    | Lazy chunk, manual chunking, size budget check                                                 |

## Resolved on approval

1. IndexedDB → `idb` behind `StorageService` (TD-05).
2. Tailwind v4 with the Vite plugin; v3 only on a concrete incompatibility (TD-06). None found in Phase 1.0.
3. Human drives task transitions now; agents later use the same validated commands (TD-17).
4. Visual style → isometric 2.5D pixel art (TD-07).
5. Working dark theme in Phase 1, light-ready tokens (TD-16).
