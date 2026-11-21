# Phase 1.3 Report — Application Shell and UI Primitives

**Status:** complete. Typecheck, ESLint, Prettier, all 479 tests and the production build pass (§8). I ran the app in headless Chrome at four widths in both themes; the screenshots are in §9.

**Scope delivered:**

- The application shell, design tokens and a light theme.
- 19 UI primitives.
- A dashboard built on real data, the Employees roster, and Settings (appearance, export/import/reset, storage status).
- Polished boot screens and structured placeholder pages.

No project or task workflows were started and no Phaser office work was done. The domain, commands, stores and IndexedDB layer were not rewritten. The only additions to them are four pure dashboard selectors (plus a `tasksCancelled` count) and one read-only lifecycle method, `previewImport`, described in §4.

## 1. Application structure

```
App ── useApplyTheme ── ErrorBoundary ── AppBoot ── BootGate
                                                     ├─ initializing        → LoadingScreen
                                                     ├─ error               → StorageErrorScreen
                                                     ├─ recovery_required   → RecoveryScreen
                                                     └─ ready               → RouterProvider
                                                                               └─ AppShell
                                                                                  ├─ DesktopSidebar (≥1024px, collapsible) / MobileNav drawer (<1024px)
                                                                                  ├─ TopBar: breadcrumbs, <h1>, notifications, theme, workspace menu
                                                                                  ├─ SaveStatusBanner
                                                                                  ├─ <main> → routed page (inside <Page>)
                                                                                  ├─ OperationOverlay (import / reset in progress)
                                                                                  └─ Toaster
```

| Route        | Page                                                          | Status                                                      |
| ------------ | ------------------------------------------------------------- | ----------------------------------------------------------- |
| `/`          | Dashboard                                                     | Implemented                                                 |
| `/office`    | Virtual Office: frame for the lazy Phaser canvas              | Frame only (canvas still shows the Phase 1.0 preview floor) |
| `/projects`  | Projects                                                      | Placeholder showing the real project count                  |
| `/employees` | Read-only roster by department, with an anchor per department | Implemented (read-only)                                     |
| `/tasks`     | Tasks                                                         | Placeholder showing the real task count                     |
| `/activity`  | Activity                                                      | Placeholder showing the real event count                    |
| `/settings`  | Appearance · Workspace data · Storage (`?tab=` in the URL)    | Implemented                                                 |

**Route changes:** the Office moved from `/` to `/office`, `/team` became `/employees`, and `/` is now the Dashboard (TD-12 updated).

**Navigation:**

- Grouped into **Overview** (Dashboard, Virtual Office) and **Work** (Projects, Employees, Tasks, Activity). Settings is pinned to the bottom of the sidebar.
- The active item gets an amber rail, a tinted background and an amber icon, plus `aria-current="page"`.
- The collapsed sidebar shows icons only, with tooltips; the labels stay available to screen readers.
- `findNavItem` in `app/navigation.ts` supplies each page's title and breadcrumb section.

## 2. Components created

Everything is in `src/components/` and built on Tailwind and native elements. No UI library was added (TD-35).

| Component                        | Notes                                                                                                                                                                      |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Button`, `IconButton`           | Variants primary / secondary / ghost / danger; sizes sm and md; optional icon; `loading` shows a spinner and sets `aria-busy`. `IconButton` always has an accessible name. |
| `Card`, `CardHeader`, `CardBody` | `Card` is a `<section>`; headers take an `id` for `aria-labelledby`.                                                                                                       |
| `Badge`                          | Seven tones, each with text.                                                                                                                                               |
| `Input`, `Textarea`, `Select`    | Built on a `Field` wrapper that links the label, hint and error (`aria-describedby`, `aria-invalid`). `Select` is a styled native select.                                  |
| `Dialog`                         | Rendered in a portal. Focus moves in and is trapped, Escape and the backdrop close it, focus returns to the trigger, and page scroll is locked.                            |
| `ConfirmDialog`                  | Uses `role="alertdialog"`. **Cancel is focused first.** It cannot be dismissed while busy.                                                                                 |
| `DropdownMenu`                   | WAI-ARIA menu button: Enter, Space and the arrow keys open it; arrows, Home and End move; Escape returns focus; Tab closes.                                                |
| `Popover`                        | A non-modal panel that closes on Escape (returning focus) or an outside click. Used for notifications.                                                                     |
| `Tooltip`                        | Positioned in a portal so it is never clipped; shows on hover and focus; uses `aria-describedby`.                                                                          |
| `Tabs`                           | WAI-ARIA tabs with arrow, Home and End keys and roving `tabIndex`.                                                                                                         |
| `Avatar`                         | Initials tinted with the department colour (decorative).                                                                                                                   |
| `ProgressBar`                    | `role="progressbar"` with a value and value text.                                                                                                                          |
| `StatusIndicator`                | A dot plus a text label. It pulses for "Working"; the pulse is off under reduced motion.                                                                                   |
| `Skeleton`, `Spinner`            | Loading placeholders.                                                                                                                                                      |
| `EmptyState`, `ErrorState`       | Have a compact variant and a configurable heading level.                                                                                                                   |
| Toasts (`toast()`, `<Toaster>`)  | Two permanent live regions: polite, and assertive for errors. Auto-dismiss after 6 s, paused on hover or focus; errors stay until dismissed.                               |
| `Page`, `RelativeTime`           | `Page` gives every page the same frame. `RelativeTime` uses one shared 30-second clock.                                                                                    |

**Design tokens** (`styles/index.css`):

- Charcoal surfaces in five steps; amber `accent` with `accent-strong` for amber text and icons; cyan `secondary`.
- Status colours, overlay and two shadow levels, and animations for fade, pop, slide, toast and shimmer.
- Both themes define every token.

## 3. Dashboard functionality

Every figure is derived from the canonical workspace through pure selectors. The page subscribes to the whole immutable state once and derives its view with `useMemo` (TD-38).

| Area             | Source                                                                                                                                                                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 7 metrics        | `selectDashboardMetrics`: employees, projects, active projects, in progress, awaiting review, blocked, completed. Each hint line is also derived (for example "2 people working" or "of 5 tasks", where 5 excludes cancelled tasks). |
| Current projects | `selectCurrentProjects`: projects that are active, planning or on hold, with domain progress, a status badge, priority and deadline.                                                                                                 |
| Team             | `selectEmployeeSummaries`: derived work status (Working, In review, Blocked, Available) and the current task.                                                                                                                        |
| Recent activity  | `selectRecentActivity(6)`: the description, who did it (You / System / employee) and a relative time.                                                                                                                                |
| Notifications    | The newest 5, with type icon and unread state. The top-bar bell shows the unread count and offers "Mark all read" (the `markAllNotificationsRead` command).                                                                          |
| Departments      | `selectDepartmentOverview`: head count and open tasks; each tile links to `/employees#dept_…`.                                                                                                                                       |

**Empty states:** projects, activity and notifications each have one (a new workspace has all three empty). No numbers are hardcoded, and no activity or employees are faked.

## 4. Settings functionality

- **Appearance:** Dark, Light or System as radio cards with a live preview. The choice persists in `localStorage` and is applied before first paint by a small inline script in `index.html`. The top-bar toggle switches between dark and light.
- **Workspace data:**
  - **Export** downloads `project-hq-workspace-YYYY-MM-DD.json` (also available from the workspace menu).
  - **Import:** pick a file → size check (20 MB) → `workspaceLifecycle.previewImport` runs the full restore gate without writing anything.
    - If the file is invalid, an inline alert says why ("The file was not imported. … Your workspace has not been changed.") and lists the problems with their paths.
    - If it is valid, a confirmation dialog compares the current workspace with the file (employees, projects, tasks, activity, notifications) and notes if the file will be upgraded.
    - Only after "Replace workspace" does `importWorkspace` run; a toast reports the result.
  - **Reset** is in a "Danger zone" card and needs confirmation in a dialog that also offers "Export workspace" first.
- **Storage:** shows Ready or Temporary, then Saving… / "All changes saved automatically · last saved …" / a save error with a **Retry saving** button (`retrySave`). It refers only to "this browser, on this device" and never mentions IndexedDB.
- **During import and reset:** the controls are disabled and a blocking overlay covers the shell, while commands are already refused by the lifecycle.

## 5. Persistence integration

- The UI never touches IndexedDB. Settings and menus call `workspaceLifecycle` (export, previewImport, import, reset, retrySave), read status through `useAppStatus`, and change business data only through `commands`.
- **`previewImport` is the one lifecycle addition** (TD-37). It is pure and read-only and returns `{ summary, sourceVersion, migrated }` or the same `LifecycleError` that import would return. It has 2 tests, which check that nothing is written.
- **Startup states** are handled by `BootGate` (extracted from `AppBoot` so it can be tested):
  - `initializing` shows a branded loading screen with skeletons;
  - `error` shows retry or a temporary workspace;
  - `recovery_required` shows download as-is, restore from file, retry, or a confirmed reset.

  The shell and router mount only when the workspace is `ready`, so nothing can call a command earlier. Existing data is never replaced silently: everything from Phase 1.2 is unchanged.

- **Interface preferences** (theme, sidebar) are kept in `localStorage`, separate from workspace data, and are never exported or reset (TD-36).

## 6. Responsive testing

Headless Chrome, dev server, a real IndexedDB workspace filled through the real command API (including a deliberately long project name).

| Viewport           | Layout                                                                                                                                       |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 1440 × 900 | Full sidebar; metrics in 3 + 4 columns; projects (2/3) beside the team (1/3); departments in 5 columns.                                      |
| Laptop 1280 × 800  | Same as desktop; the sidebar can collapse to a 68 px rail.                                                                                   |
| Tablet 768 × 1024  | No sidebar; the menu button opens the drawer; metrics in 3 + 2 columns; cards stacked; departments in 3 columns.                             |
| Mobile 390 × 844   | Drawer navigation; breadcrumbs hidden and the title kept; workspace menu shows the avatar only; metrics in 2 columns (Employees full width). |

**Horizontal overflow** was checked automatically on 9 pages × 4 widths × 2 themes (72 combinations), measuring both the document and the scrolling `<main>`.

- **Found and fixed:** at 390 px the long project name widened the dashboard's implicit grid column, so the card overflowed. Fixed by giving the grid an explicit `grid-cols-1` (`minmax(0, 1fr)`); the same latent issue in the Employees grid was fixed too.
- **Final result:** no overflow in any of the 72 combinations.

**Other visual fixes made during review:**

- Light-theme avatar initials were too pale; they are now mixed toward the text colour.
- On mobile the three company metrics were stacked one per row; they now use 2 columns.
- With one person per department, Employees cards were mostly empty; departments now sit two per row on wide screens.
- The Tooltip wrapper used `display: contents`, which can't be measured, so the tooltip couldn't be positioned.
- The Toaster's live regions also used `display: contents`; they now use real boxes so assistive technology doesn't drop them.

## 7. Accessibility checks

- **Contrast (computed, WCAG 2.1):** every text token (text, muted, subtle, accent-strong, secondary, info, success, warning, danger) on every surface (canvas, surface, raised, hover) is at least **4.5:1** in both themes; the lowest is 4.54:1. Three tokens were adjusted to get there. Button text on amber is 9.0:1. The focus ring against the surface is 9.5:1 (dark) and 5.4:1 (light).
- **Keyboard (real browser):** Tab order from the top is Skip to content → Dashboard → Virtual Office → Projects → Employees → Tasks…, and every stop showed a visible focus ring. Escape closes the notifications popover and returns focus to the bell. The mobile drawer moves focus inside, traps Tab, and closes on Escape. Confirmation dialogs open with focus on Cancel.
- **Semantics (tested):**
  - one `<h1>` per page, in the top bar;
  - `nav` landmarks labelled Primary and Breadcrumb, with `aria-current` on the active link and crumb;
  - labelled cards (`aria-labelledby`) and metrics as `<dl>`;
  - progress bars with value text, status always shown as text, unread state announced as text;
  - toast live regions, form controls linked to their hints and errors;
  - labelled icon buttons, and a `<table>` with headers for the import comparison.
- **Motion:** every animation and transition is reduced to near zero under `prefers-reduced-motion`.
- **Not done:** no screen-reader session (NVDA, VoiceOver) and no automated axe audit. Both are noted in §10.

## 8. Actual test results

Run on 2026-11-17, after the final code and documentation changes.

| Check            | Command                | Result                                  |
| ---------------- | ---------------------- | --------------------------------------- |
| TypeScript       | `npm run typecheck`    | Passed, no errors                       |
| ESLint           | `npm run lint`         | Passed, 0 problems                      |
| Prettier         | `npm run format:check` | Passed                                  |
| Vitest           | `npm test`             | **479 of 479 passed, 33 files, ≈8.9 s** |
| Production build | `npm run build`        | Succeeded                               |

**New and changed tests:**

| File                                        | Tests   | Covers                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/App.test.tsx` (rewritten)              | 17      | Links to every section; each of the 7 routes renders its `<h1>`; only the current route is highlighted; the highlight and title follow navigation; breadcrumbs; sidebar collapse is accessible and remembered; mobile drawer opens and closes on Escape and after a link, returning focus; theme toggle persists; workspace menu keyboard support; not-found page |
| `features/dashboard/DashboardPage.test.tsx` | 6       | Real counts on a fresh workspace; empty states; seed team and departments; **live updates as commands run** (in progress → review → done, progress at 50%); blocked and active counts; mark all read                                                                                                                                                              |
| `features/settings/SettingsPage.test.tsx`   | 10      | Theme radios and persistence; tab keyboard navigation and URL; export filename and contents; invalid import explained and nothing changed; problem details listed; import confirmation with comparison and Cancel focused, cancel changes nothing; confirmed import replaces the workspace; reset cancel and confirm; storage status                              |
| `app/BootGate.test.tsx`                     | 4       | Loading, ready, recovery and error screens; the app is never rendered before `ready`; retry and continue-without-saving are wired                                                                                                                                                                                                                                 |
| `components/components.test.tsx`            | 7       | Dialog focus trap, Escape and focus return; ConfirmDialog safe focus and busy lock; Tabs pattern; field labelling; progress and status text; Tooltip; Toaster live regions, auto-dismiss and persistent errors                                                                                                                                                    |
| `services/preferences.test.ts`              | 4       | Defaults, round trip, unknown values, blocked storage, resolving "system"                                                                                                                                                                                                                                                                                         |
| `stores/selectors.test.ts`                  | +1 (9)  | The four dashboard selectors on a mixed workspace (including a cancelled task excluded from progress)                                                                                                                                                                                                                                                             |
| `commands/workspaceLifecycle.test.ts`       | +2 (39) | `previewImport` summarises without writing, and reports the same errors as import                                                                                                                                                                                                                                                                                 |

**Mutation check:** I broke seven UI rules, one at a time. Six were caught, and every file was restored.

| Deliberate break                        | Tests that failed |
| --------------------------------------- | ----------------- |
| Blocked metric counts in-review tasks   | 2                 |
| Theme choice not persisted              | 2                 |
| Import skips the confirmation step      | 2                 |
| Dashboard stops following the store     | 2                 |
| Boot gate renders the app while loading | 1                 |
| Dialog ignores Escape                   | 3                 |
| Active-route matching changed (`end`)   | 0                 |

The last one was not a test gap: React Router never treats `/` as a prefix of other paths, so the `end` prop changed nothing. The mutated code behaved exactly like the original, and the prop was redundant, so it was removed.

**Browser flows run against real IndexedDB:**

1. Export downloaded a file containing 1 project and showed a toast.
2. The reset dialog opened with focus on Cancel; confirming the reset left 0 projects.
3. The exported file was imported through the real file input (`DOM.setFileInputFiles`), the confirmation dialog was accepted, and the project came back.
4. An invalid file showed the inline error.
5. After a reload, the dashboard still showed 1 project.

No console errors or warnings occurred in any browser session.

**Build output:**

- App: 443.94 kB (137.36 kB gzip). It was 380.96 kB (120.22 kB gzip), so the shell, primitives and pages added about 17 kB gzip.
- CSS: 39.79 kB (8.26 kB gzip).
- Phaser chunk: unchanged at 1,195.82 kB (319.16 kB gzip) and still lazy-loaded.

**No dependencies were added.**

## 9. Screenshots

All are in [`docs/screenshots/phase-1.3/`](screenshots/phase-1.3/) and were taken from a populated workspace unless noted.

- Dashboard, dark: `dark-dashboard-desktop-1440.png`, `dark-dashboard-desktop-1440-lower.png`, `dark-dashboard-laptop-1280.png`, `dark-dashboard-tablet-768.png`, `dark-dashboard-mobile-390.png`, `dark-dashboard-mobile-390-scrolled.png`
- Dashboard, light: `light-dashboard-desktop-1440.png`, `light-dashboard-laptop-1280.png`, `light-dashboard-tablet-768.png`, `light-dashboard-mobile-390.png`
- Navigation: `dark-mobile-navigation.png` (drawer), `dark-collapsed-sidebar-tooltip.png`
- Overlays: `dark-notifications-popover.png`, `dark-import-confirmation.png`, `dark-import-error.png`, `dark-reset-confirmation.png`
- Pages: `dark-employees-desktop.png`, `dark-office-desktop.png`, `dark-projects-placeholder-desktop.png`, `dark-settings-data-desktop.png`, `dark-settings-appearance-mobile.png`

## 10. Known limitations

1. **No screen-reader or axe audit.** Accessibility was checked with tests, computed contrast and keyboard runs in Chrome only.
2. **The Office page still renders the Phase 1.0 preview floor** inside the new frame. Its canvas stays dark in the light theme by design (the office keeps its own palette).
3. **Projects, Tasks and Activity are placeholders**, although they show real counts. Dashboard project rows are not links yet, because there is no project detail page.
4. **New projects start in Planning**, and there is no UI yet to activate them, so "Active projects" stays at 0 until Phase 1.4. This is correct behaviour, but it can surprise.
5. **Notifications can only be marked read all at once;** marking a single one (and the full notification centre) is Phase 1.7.
6. **Toasts sit above open dialogs** and can be dismissed with the mouse, but they are outside the dialog's focus trap.
7. **Relative times update every 30 s** and use the browser locale; dates follow the browser's language, but the interface text is English only.
8. **The page `<h1>` lives in the top bar.** This keeps one heading per page, but pages cannot set a custom title yet; it comes from the navigation config.
9. **"My company" and "Operator" in the workspace menu are fixed labels.** There is no workspace naming or accounts (out of scope).
10. **Inter is not bundled.** The font stack falls back to system UI fonts, which is a deliberate trade-off to avoid a font dependency.
11. **Department colours now exist in three places:** seed data, CSS tokens, and light-theme variants. The UI uses the seed hex for avatars and dots and mixes it toward the text colour.

## 11. Recommendations for Phase 1.4

1. **Project UI:**
   - create and edit with `Input`, `Textarea`, `Select` and `Dialog`, using `updateProject` for status changes (including Planning → Active);
   - make dashboard project rows link to a project detail route (for example `/projects/:id`), with breadcrumbs going one level deeper.
2. **Task UI:**
   - a board and list on `/tasks` using `Tabs`; an assign dialog that surfaces `assignment_rejected` messages and offers the explicit cross-department option;
   - status changes with the domain's error messages, including the dependency-waiver hint, shown inline or as toasts.
3. **Shared form helpers:** map `DomainError` validation fields onto `Field` errors in one helper rather than in each form.
4. **Project switcher:** use `uiStore.activeProjectId` in the top bar as a switcher. Keep filters in the URL, as Settings does with its tab.
5. **Quality:**
   - add `@axe-core` checks to the component tests, or a Playwright smoke test, before the interface grows;
   - keep running the overflow script on new pages.
6. **Selectors:** consider memoising selectors per project if the task board makes the whole-state subscription noticeable.
