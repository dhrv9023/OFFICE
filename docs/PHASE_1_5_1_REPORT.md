# Phase 1.5.1 Report — Premium UI/UX Refinement

**Status:** complete. Typecheck, ESLint, Prettier, all **640 tests** and the production build pass. I captured before and after screenshots in headless Chrome at 1440, 1280, 768 and 390 px in both themes, with no horizontal overflow and no console errors. **Phase 1.6 has not been started.**

**Scope:**

- **Interface only:** no domain, command, store or persistence changes.
- **Office art untouched:** characters, movement, projection and navigation behaviour are unchanged. The one game-side addition is `setBackdrop`, so the empty space around the office follows the theme (TD-54).

## 1. Audit (before)

All "before" screenshots were taken from the Phase 1.5 build with live data, in [`screenshots/phase-1.5.1/before/`](screenshots/phase-1.5.1/before/).

| Area            | Problems found                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Typography**  | The font stack named Inter but never loaded it, so it fell back to the system font. There were 36 ad-hoc sizes (`text-[11px]`, `text-[13px]`, …), 11 of them below 12 px.                                                                                                                     |
| **Shape**       | Four different corner radii on similar elements; shadows on every card even in dark mode, where they are invisible.                                                                                                                                                                           |
| **Sidebar**     | The active item was stacked emphasis: an amber fill, a left rail bar and an amber icon. Section labels were uppercase and tracked. "AI workforce" was a generic subtitle. The collapse toggle had its own bordered footer row.                                                                |
| **Top bar**     | Breadcrumbs repeated the title on every page ("Project HQ › Overview › Virtual Office" above "Virtual Office"). The workspace menu duplicated the brand. The notification count was a loud amber circle.                                                                                      |
| **Office page** | The canvas sat in a padded card inside a padded page, under a second header that repeated the room. A "10 rooms" pill added nothing. The zoom buttons floated in a dark bubble that ignored the theme, and the controls pill was wordy. In the light theme a dark void surrounded the office. |
| **Right panel** | "Explore the office" was a floating card that used a third of the height and left empty space below. Nearby, selected and empty states looked the same.                                                                                                                                       |
| **Dashboard**   | Seven separate cards, each with a coloured icon tile: the generic "AI dashboard" pattern.                                                                                                                                                                                                     |
| **Badges**      | Outlined pills everywhere (status, priority, category), competing with content.                                                                                                                                                                                                               |

## 2. Design plan (as written before implementation)

1. **Tokens:** Inter, one type scale (nothing under 12 px), one radius scale, borders instead of shadows, quiet borderless badges.
2. **Sidebar:** the workspace switcher in the header, sentence-case section labels, a neutral active state with an amber icon, and the collapse toggle beside Settings.
3. **Top bar:** title only on top-level pages, the path back on nested pages, a dot for unread notifications.
4. **Office:** a full-bleed canvas, a location chip, one zoom control showing the level, a short hint while focused, and a backdrop that follows the theme.
5. **Inspector:** a full-height rail with distinct states (overview, nearby, employee, department, meeting room, object).
6. **Dashboard:** one metric strip.

## 3. What changed

### Design system (TD-51, TD-52)

- **Font:** Inter is now self-hosted (OFL, `@fontsource-variable/inter` 5.3.0, exact pin). Only the 48 kB Latin file is downloaded. Body text is 14 px with a 1.5 line height, and Inter's `cv11`, `ss01` and `ss03` features are on.
- **Type scale:** the standard Tailwind scale only. All 36 ad-hoc sizes were mapped onto it, and none are below 12 px.
- **Radius scale:** 4 px labels · 6 px controls · 8 px rows and panels · 10 px cards · 12 px dialogs, set once as tokens.
- **Borders and shadows:** in dark mode a 1 px edge only; in light mode a very soft shadow.
- **Badges:** borderless tinted labels with 4 px radius. Colour still carries meaning: status, priority, department.
- **Buttons:** 6 px radius, a quieter secondary style (hairline border that firms up on hover), a pressed state on primary, and 32 px icon buttons with 16 px icons everywhere.
- **New token:** `--hq-office-backdrop` per theme (#0d1018 dark, #dfe3ec light).

### Sidebar

- **Header:** a workspace switcher (logo, "My company", "Project HQ", ⇅) that opens the existing menu: Settings and Export.
- **Navigation:** sentence-case section labels; 32 px items with 16 px icons. Active items get a neutral highlight, medium weight and an amber, slightly heavier icon; there is no fill-plus-rail combination. Hover is a fainter version of the active background.
- **Footer:** Settings with the collapse toggle beside it in one row.
- **Collapsed:** a 60 px rail with icon tooltips, the logo as the menu trigger, and Settings and the toggle stacked.

### Top bar

- **Height:** 56 px.
- **Title:** top-level pages show only the title. Project details shows the way back ("Projects ›") before the title.
- **Actions:** notifications (a small amber dot when unread; the count stays in the accessible name and the panel) and the theme toggle.

### Virtual office

- **Full-bleed canvas:** no card, no page padding, no second header. At 1440 px the canvas grew from about 798 × 743 to **848 × 844** px of visible office.
- **Overlays**, all on theme tokens:
  - top-left, a location chip with the department-colour dot and room name;
  - top-right, one zoom control (− 2× +) that shows the current level;
  - bottom, a short hint while focused ("WASD or ↑↓←→ to walk · E to interact") or "Click the office to start walking" when not.
- **Focus ring:** shown only for keyboard focus.
- **Backdrop:** the space around the office follows the theme. The office art is unchanged.
- **Small screens:** the canvas stacks above the inspector at 62 % of the viewport height (at least 360 px) on tablet and phone, so it is never cramped.

### Contextual inspector

A full-height right rail (352 px) on desktop, below the canvas on smaller screens.

| State                                 | Content                                                                                                                                                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Overview** (nothing open)           | "You are in" (room and description), team with live status ("2 of 5 working"; each person is clickable and opens their profile, the same as walking up to them), rooms with department colours and "You are here", controls |
| **Nearby**                            | A preview at the top of the overview. For an employee: name, role · department and status. Otherwise an icon, name and room. Then "Press E or click to open."                                                               |
| **Employee**                          | Profile (avatar, name, role · department, description); status, open tasks and what they are working on; actions **Open current task**, **View their tasks** and **See the team**, all existing features                    |
| **Department room**                   | Description, people with status, number of open tasks, **Open the task board** (filtered by department)                                                                                                                     |
| **Meeting room** (entrance or screen) | Seats (counted from the layout) and description; it states plainly that meetings are not part of Project HQ yet                                                                                                             |
| **Other rooms and objects**           | Reception, break room, lounge; the project board (counts, **Open projects**), department boards (open tasks, **Open the task board**), coffee machine, arcade                                                               |

Every detail view has a **Back to overview** button, which also clears the selection in the office. No new capabilities were invented: every action links to an existing page, filter or task sheet.

### Dashboard and other pages

- **Dashboard:** the seven metric cards became **one metric strip** of hairline-divided cells. Each has a small status dot, the label, the value at 24 px and a hint; colour sits only on the dot. Seven cells at ≥1280 px wide, four on tablet, two on phones.
- **Other pages:** projects, tasks, employees and settings inherit the new tokens. Their badges are quieter, corners and type are consistent, and the shadows are gone.

## 4. Before and after

Files with the same name are in `before/` and `after/` under [`docs/screenshots/phase-1.5.1/`](screenshots/phase-1.5.1/):

| View                                            | Files                                                                         |
| ----------------------------------------------- | ----------------------------------------------------------------------------- |
| Office, employee selected, 1440 (dark / light)  | `dark-office-selected-1440.png`, `light-office-selected-1440.png`             |
| Office, nearby, at each width                   | `dark-office-nearby-1440 / 1280 / 768 / 390.png`                              |
| Office on a phone (dark / light)                | `dark-office-selected-390.png`, `light-office-selected-390.png`               |
| Collapsed sidebar                               | `dark-office-collapsed-1440.png`                                              |
| Dashboard, Projects, Tasks, Employees, Settings | `dark-dashboard-1440.png` … `dark-settings-1440.png`                          |
| Notifications                                   | `dark-notifications-1440.png`                                                 |
| Light-theme pages (after only)                  | `light-dashboard-1440.png`, `light-projects-1440.png`, `light-tasks-1440.png` |

## 5. Testing results

Run on 2026-11-20.

| Check                  | Result                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                                                               |
| `npm run lint`         | Passed, 0 problems                                                                                   |
| `npm run format:check` | Passed                                                                                               |
| `npm test`             | **640 of 640 passed, 45 files**                                                                      |
| `npm run build`        | Succeeded. App bundle 527 kB (158 kB gzip, unchanged); lazy game chunk unchanged; font 48 kB (Latin) |

**Test changes:**

- `OfficePage.test.tsx` was rewritten for the inspector (now 9 tests): overview content; nearby preview; employee profile with real actions; back to the overview clears the selection; selecting from the team list; department, meeting room and project board states.
- `App.test.tsx`: the breadcrumb test now checks title-only top-level pages, and project details showing "Projects ›" back.
- Dashboard, integration and project tests: the metric lookup follows the new strip markup. The assertions themselves are unchanged.

**Browser (headless Chrome, real IndexedDB, live data):**

- every page at 1440 px in dark and the main pages in light;
- the office at 4 widths in both themes, including walking to Sarah and pressing E;
- no horizontal overflow and no console errors;
- the office still behaves as before (walking, E interaction, zoom, focus isolation).

**One harness note:** my screenshot script originally walked for fixed times. The larger canvas renders slightly slower under software rendering, so a fixed time covered a little less ground. The script now walks until it reaches its target; the game's movement is unchanged.

## 6. Remaining issues

1. **The project avatar stack still overlaps initials slightly** at 28 px. It needs a dedicated small-avatar variant.
2. **Canvas name tags use the game's own text style** (bold system font at 3× resolution), not Inter, because the office art and text were deliberately left alone.
3. **The phone layout puts the inspector below the canvas.** A bottom sheet that overlays the canvas would save scrolling, but it's a bigger interaction change, left for later.
4. **The dashboard metric strip doesn't link anywhere:** each cell could link to its filtered list (for example Blocked → the task board filtered to blocked tasks), which needs a status filter on the board first.
5. **The light theme around the office is a flat grey.** A subtle tiled pattern could add depth, but was left out to keep the canvas calm.
6. **No automated visual-regression tests:** screenshots were reviewed by hand.

Phase 1.6 has not been started.
