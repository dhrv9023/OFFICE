# Project HQ — Roadmap

## Phase 1 — Frontend foundation and simulated office (current)

Delivered in sub-phases. Each ends in a runnable, reviewable state.

### 1.0 Scaffold and tooling — ✅ complete

- Vite + React + TypeScript (strict), Tailwind CSS, ESLint, Prettier, Vitest.
- Folder structure per ARCHITECTURE.md; path aliases; CI-style `npm run check` (typecheck + lint + test).
- Routing, dark design tokens, lint-enforced layer boundaries, isometric maths + typed event bus, placeholder iso scene.
- **Exit**: blank shell runs, checks pass.

### 1.1 Domain and state — ✅ complete

See [PHASE_1_1_REPORT.md](PHASE_1_1_REPORT.md).

- Types, seed data (5 departments, 5 employees, office layout), rules (transitions, status derivation, progress).
- Zustand stores, commands, activity + notification generation.
- Unit tests for rules and commands.
- **Exit**: full workflow works headless in tests.

### 1.2 Persistence — ✅ complete

See [PHASE_1_2_REPORT.md](PHASE_1_2_REPORT.md).

- `StorageService` + IndexedDB implementation, schema versioning, single-flight autosave.
- Hydration with loading/error states; export / import / reset.
- **Exit**: reload restores workspace; corrupt data path tested.

### 1.3 Application shell and UI primitives — ✅ complete

See [PHASE_1_3_REPORT.md](PHASE_1_3_REPORT.md).

- Layout, top bar, panels/drawers, component library (Button, Dialog, Badge, EmptyState, ErrorState, Toast, …).
- First-run empty state, responsive behaviour.
- **Exit**: navigable shell with placeholder office region.

### 1.4 Projects and tasks UI — ✅ complete

See [PHASE_1_4_REPORT.md](PHASE_1_4_REPORT.md).

- Project create/edit/switch, progress.
- Task create/edit/assign dialog, board + list views, filters, status changes.
- **Exit**: complete data-management experience without the office.

### 1.4.1 Legacy workspace validation — ✅ complete

See [PHASE_1_4_1_REPORT.md](PHASE_1_4_1_REPORT.md). Saved and imported workspaces are checked against the current project rules; invalid data goes to recovery with an optional, confirmed repair.

### 1.5 Phaser isometric office — ✅ complete

See [PHASE_1_5_REPORT.md](PHASE_1_5_REPORT.md). Includes the playable founder (keyboard, camera, collision) and interaction foundations.

- Isometric 2.5D pixel-art office per the approved reference: diamond floors, thick walls, cutaway rooms.
- Layout data (rooms, walls, doors, furniture footprints, desks) in tile coordinates.
- Texture-provider seam with procedural pixel art; depth sorting; grid collisions; bounded integer-zoom camera.
- Store→Phaser view model, Phaser→React intents over the event bus; employee sprites, selection, tooltips.
- Phase 1 rooms: the five departments plus meeting and break rooms. Reception and Lounge follow once the pipeline is proven.
- **Exit**: office reflects store state; clicking employees opens profiles.

### 1.5.1 Premium UI/UX refinement — ✅ complete

See [PHASE_1_5_1_REPORT.md](PHASE_1_5_1_REPORT.md). Design tokens, Inter, redesigned shell, full-bleed office with a contextual inspector, metric strip.

### 1.5.2 Identity and consistency pass — ✅ complete

See [PHASE_1_5_2_REPORT.md](PHASE_1_5_2_REPORT.md). Pixel portraits drawn from the office characters (shared `src/art/`), one status language, page titles, team presence in the sidebar, workload-aware Employees page.

### 1.6 Interactive workforce management — ✅ complete

See [PHASE_1_6_REPORT.md](PHASE_1_6_REPORT.md). The office becomes a management surface: employee profiles with real actions (assign new or existing tasks, reassign, rename, talk, meet), employee renaming everywhere, task deadlines, a persistent meeting model and meeting-room planner, schema v2 with migration.

### Movement and animation (not yet scheduled)

Moved out of 1.6 when the phase was redefined. Unchanged scope:

- Navigation grid + A*, status→intent mapping, walking, working/blocked/notification animations, optional cosmetic idle wandering, reduced-motion handling.
- Presence (at desk, in a meeting) as explicit state, so invited employees can walk to the meeting room.
- **Exit**: assigning/moving tasks visibly changes the office; reload reproduces correct positions.

### 1.7 Experience polish, operational completeness and production readiness — ✅ complete

See [PHASE_1_7_REPORT.md](PHASE_1_7_REPORT.md). Audit-driven:

- **Meetings:** times, a lifecycle with start, clash rules, and presence in the office.
- **Tasks:** status, priority and deadline filters, quick views, overdue, and blocked reasons.
- **Dashboard:** actionable figures.
- **Activity and notifications:** activity filters and paging; notifications you can act on.
- **Reliability:** explicit save-conflict resolution with backups, and an unsaved-changes guard.
- **Accessibility:** contrast and keyboard review.
- **AI integration:** a readiness assessment.

### 1.8 AI safety, permissions and execution infrastructure — ✅ complete

See [PHASE_1_8_REPORT.md](PHASE_1_8_REPORT.md). The safety and execution layer, with no AI calls:

- **Permissions:** authorization in the command binding, per-employee access profiles (every profile starts disabled), and founder-only powers.
- **Approvals:** an approval policy and queue, stale-request detection.
- **Executions:** an execution registry with idempotency and explicit retries, identity-bound agent gateways.
- **Screens:** Approvals (with the execution log), employee access editing, and a Meetings page.
- **Data:** schema v4.

## Phase 2 — AI integration foundation

- Real `AgentService` implementations behind provider registry (bring-your-own API key, stored locally or via small proxy).
- Task execution lifecycle (queued → running → streaming → artifact → review), cancellation, retries, cost/usage tracking.
- Artifacts model (documents, code, designs) with viewers.
- Agent personas / system prompts per role; per-employee configuration.
- Employee-to-employee handoffs and dependencies between tasks.

## Phase 3 — Collaboration and orchestration

- Manager agent decomposes project briefs into tasks and assigns them (human approval gate).
- Inter-department workflows (Design → Frontend → QA), review loops, blocking and escalation.
- Meetings (visualised in the meeting room) producing decisions/summaries.
- Project timeline, Gantt-style view, reporting.

## Phase 4 — Department expansion

- Product Management, DevOps, Security, Marketing, Research.
- Department registry becomes data-driven; office layout editor; hiring/firing/customising employees.
- Tool access per department (repo, browser, CI, docs) with permission model.

## Phase 5 — Platform

- Optional backend: accounts, cloud sync, shared workspaces, multi-user.
- Plugin/extension API for custom departments and tools.
- Marketplace of employee templates; import/export of teams.
- Observability, audit log, safety and approval policies.

## Cross-cutting backlog

- Multi-tab consistency (BroadcastChannel / storage events).
- Custom sprite sheets and tilesets replacing procedural textures (art pass towards the reference); Reception and Lounge rooms; sound design.
- Internationalisation.
- E2E tests (Playwright).
- Theming (dark mode first).
