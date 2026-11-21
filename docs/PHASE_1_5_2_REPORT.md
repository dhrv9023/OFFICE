# Phase 1.5.2 Report — Identity and Consistency Pass

**Status:** complete. Typecheck, ESLint, Prettier, all **654 tests** and the production build pass. A final refinement of the Employees page (section 3) followed review. I captured before and after screenshots in headless Chrome at 1440, 1280, 768 and 390 px in both themes, with no horizontal overflow and no console errors. **Phase 1.6 has not been started.**

**Scope:**

- **Interface and shared art only:** no domain, command, store or persistence changes.
- **Office behaviour untouched:** movement, projection, collision and interaction are unchanged. The character drawing code moved into a shared `src/art/` module so the interface can draw the same people (TD-55); the sprites it produces are identical.

## 1. Audit (before)

All "before" screenshots were taken from the Phase 1.5.1 build with the same workspace, in [`screenshots/phase-1.5.2/before/`](screenshots/phase-1.5.2/before/).

| Area           | Problems found                                                                                                                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **People**     | Everyone outside the office was a two-letter initials tile. The pixel characters in the office and the people in the interface looked unrelated.                                                |
| **Status**     | Colours disagreed: "Working" was green on the dashboard and employees page, while the board's "In progress" column was amber. "Blocked" was amber too, so blocked work looked like active work. |
| **Shapes**     | Departments and statuses were both small circles, so a pink department dot and a red status dot read alike.                                                                                     |
| **Priority**   | Priority was a tinted badge with the same shape and weight as status ("High" next to "Active"), so the two competed.                                                                            |
| **Pages**      | No page had a real title: the top bar held the only heading and the content started with a grey sentence. Page-level actions floated without an anchor.                                         |
| **Navigation** | Employees sat under "Work" with projects and tasks, although it is about the company, not the work.                                                                                             |
| **Shell**      | Nothing in the frame showed the team, or that the workspace is saved locally.                                                                                                                   |
| **Employees**  | Person cards nested inside department cards. Nothing showed how much work each person holds, or who is free to take more.                                                                       |

## 2. What changed

### Design tokens ("graphite", TD-52 extended)

- Neutrals are true graphite with a slight warmth, so the one brand colour, the amber of the office walls, reads as intentional.
- The frame is a darker canvas (the sidebar) holding one surface sheet where every page lives.
- Card, popover, sunken and hover surfaces are separate tokens, defined once per theme.

### People are the office characters (TD-55)

- `Avatar` draws each person's pixel portrait, cropped from the same frame that walks the office, with the shirt in their department colour. The founder (you) has their own portrait, used for "You" in activity.
- A head crop is used at small sizes and a head-and-shoulders bust at large sizes, both at whole-pixel multiples so they stay crisp.
- Portraits are used in the sidebar, dashboard, task cards, project rows, activity, the employees page and the office inspector.

### One status language (TD-56)

- Amber means active work, cyan awaiting review, red blocked, green done and grey idle or not started, on every page.
- **Marks:** status is a circle, a department a rounded square and priority signal bars, so they never read alike.

### Shell

- **Sidebar:** "Headquarters" (Dashboard, Virtual Office, Employees) and "Work" (Projects, Tasks, Activity).
- **Brand:** the mark is an isometric amber floor tile drawn on a pixel grid, with a "Saved locally" line under the workspace name.
- **Your team:** a strip of portraits with status dots above Settings ("2 of 5 working"), linking to Employees.
- **Top bar:** the page icon next to the title.

### Pages

- **`Page` frame:** every page now has one real `h1`, a live supporting line (the dashboard says "2 of 5 people are working and 2 projects are active. 1 task is blocked.") and its actions aligned with the title.
- **`Card`:** one container, never nested; things inside it are separated with hairlines.
- **Dashboard:** project rows show priority bars and a status label; the team list shows each person's current task; there is a "Visit the office" action.
- **Employees:** a "Right now" summary with a stacked status bar and counts, open and unassigned totals, and a card per person. Each card shows the portrait, department, status, what they are working on (or the most urgent blocked or to-do task), a workload bar and their skills. The view logic is in `features/employees/workforce.ts`.
- **Tasks, projects, activity, settings:** the same frame, quieter badges, portraits on cards and rows.
- **Dialogs, popovers, menus and toasts** use the shared surface, radius and overlay tokens.

### Fixes made while reviewing the after screenshots

1. **Task board alignment:** the columns snap to the start of the scroller, which had no scroll padding, so on load the browser scrolled the board about 31 px and the first column sat left of the page content. Fixed with scroll padding that matches the page gutters (`KanbanBoard.tsx`).
2. **Dashboard metric grid on tablet and phone:** seven cells in a 2- or 4-column grid left a bare hairline-coloured slot. The last cell now spans the leftover columns below `xl` (`DashboardPage.tsx`).

## 3. Employees page refinement

Requested after reviewing the first 1.5.2 build. It refines the existing design rather than replacing it: portraits, department colours, the workforce overview, the sidebar and the component system are unchanged. Before and after screenshots of this step are in [`screenshots/phase-1.5.2/refinement/`](screenshots/phase-1.5.2/refinement/) (16 each: dark and light, 1440 / 1280 / 768 / 390, viewport and full page).

| Issue                              | Before                                                                                                                                                | Change                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Truncated names**                | At 1280 px "Alex Morgan" became "Alex Mor…": the name shared its line with the status pill.                                                           | The department now has the card's top line to itself, and the status pill sits under the role. The name gets the full width beside the avatar and wraps instead of truncating (checked with a 37-character name).                                                                                  |
| **Secondary text**                 | Task project and status, workload labels and skills were 12 px muted text. Skills were cut off ("Stakeholder comm…").                                 | All are 14 px now. The task title can use two lines, and the project line and skills wrap instead of truncating. The focus label ("Working on", "Blocked on") is semibold. The full skill list is also available on hover.                                                                         |
| **Avatar breathing room**          | 16 px gap, 20 px card padding, identity block top-aligned.                                                                                            | 20 px gap, 24 px padding, the name is one step larger (18 px), and the identity block is centred on the 72 px portrait.                                                                                                                                                                            |
| **Consistent card layout**         | The last row stretched its cards wider than the rows above. Sections inside cards in the same row started at different heights.                       | Equal columns at every width (1 / 2 / 3). Each card is a CSS subgrid over five shared row tracks, so department, identity, current work, workload and skills line up across a row, whatever each card contains.                                                                                    |
| **Departments of different sizes** | The people column had a fixed width that more than one face plus its count would overflow. Rows aligned only because every department had one person. | Rows share the list's columns through a subgrid from `lg` up. Up to four faces are shown, then "+n". An empty department says "No one yet". Below `lg` each row stacks (name, description, then people and the tasks link), so descriptions are no longer squeezed into a narrow column at 768 px. |
| **Workforce overview size**        | About 170 px tall, with a 24 px headline above the bar.                                                                                               | About 125 px tall: "Right now · 2 of 5 working" on one line, then the bar and legend. The figures are "Assigned tasks" and "Unassigned". When tasks are unassigned, "Unassigned" links to the task board filtered to them (`?assignee=unassigned`, an existing filter).                            |
| **Use of space at 1280 / 1440**    | 3 columns, but uneven: 3 narrow cards, then 2 wide ones.                                                                                              | 3 equal columns at both widths. With 5 people the second row has an empty third slot. I kept that rather than widening two cards, because equal cards are what keeps them consistent as the team grows. Nothing was added to fill the space.                                                       |

**Stress check (not kept):** I temporarily added four people to UI/UX Design in the browser's memory, one of them with a 37-character name, and rendered the page at 1280 and 1440. The long name wrapped and its row grew evenly. The department row showed 4 faces plus "+1" and stayed aligned. The original workspace was restored afterwards. These people are not in the app, the seed or the screenshots in `docs/`.

**Other pages:** I recaptured every page after the refinement and reviewed them against the same patterns: the page frame, one card level, the status language, portraits, and 14 px secondary text in content. No changes were needed. The main `after/` set in section 4 was replaced with these final captures.

**Files:** `features/employees/EmployeesPage.tsx`, and a new `EmployeesPage.test.tsx` (4 tests: full names with no truncation, subgrid card structure, the Unassigned link appearing only when needed, and department rows).

## 4. Before and after

Files with the same name are in `before/` and `after/` under [`docs/screenshots/phase-1.5.2/`](screenshots/phase-1.5.2/). There are 51 screenshots in each set.

| View                                     | Files                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Every page at each width (dark)          | `dark-{dashboard,projects,project,tasks,employees,activity,settings}-{1440,1280,768,390}.png`    |
| Office, nearby, at each width            | `dark-office-nearby-{1440,1280,768,390}.png`, `light-office-nearby-1440.png`                     |
| Office, employee selected (dark / light) | `{dark,light}-office-selected-{1440,390}.png`                                                    |
| Light theme pages                        | `light-{dashboard,projects,project,tasks,activity,settings,employees}-1440.png`                  |
| Employees, full page                     | `{dark,light}-employees-1440-full.png`                                                           |
| Notifications, dialog, collapsed sidebar | `{dark,light}-notifications-1440.png`, `{dark,light}-dialog-1440.png`, `dark-collapsed-1440.png` |

## 5. Testing results

Run on 2026-11-21.

| Check                  | Result                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                                                            |
| `npm run lint`         | Passed, 0 problems                                                                                |
| `npm run format:check` | Passed                                                                                            |
| `npm test`             | **654 of 654 passed, 48 files**                                                                   |
| `npm run build`        | Succeeded. App bundle 547 kB (164 kB gzip, up from 527 / 158 kB); CSS 57 kB; game chunk unchanged |

**New tests (14):**

- `art/portrait.test.ts`: run-merged path encoding, cropping, a pixel-for-pixel match with the office sprite, department colours and caching.
- `features/employees/workforce.test.ts`: task ordering in the workload bar, the current task, the most urgent blocked or to-do task, the empty case and status counts.
- `features/employees/EmployeesPage.test.tsx`: see section 3.

`App.test.tsx` and `ProjectsPage.test.tsx` were updated for the new page headings and navigation; their assertions about behaviour are unchanged.

**Browser (headless Chrome 157, Vite dev server, real IndexedDB):**

- The workspace was built through the app's own commands: 3 projects and 7 tasks covering every status.
- Every page at 4 widths in dark and at 1440 in light, plus notifications, the new-project dialog and the collapsed sidebar.
- The office at 4 widths: walking the founder down the corridor into UI/UX Design until Sarah is nearby, then pressing E to open her profile.
- No horizontal overflow and no console errors on any screen.

**Harness note:** the screenshot scripts from earlier phases were in a temporary folder that has since been cleared, so I wrote a new one. It walks in short steps and stops when the inspector shows Sarah as nearby, rather than walking for a fixed time, because frame rate varies under software rendering.

## 6. Remaining issues

1. **Portraits at 24 px are small:** the head crop reads well at 32 px and up; in dense rows (task cards, activity) the face is only just recognisable. A slightly larger row avatar could help.
2. **The bundle grew by about 20 kB** (6 kB gzip), mostly from portraits and the employees page. It is still one app chunk; route-level splitting belongs in the 1.7 performance pass.
3. **The Employees grid can end with an empty slot** (5 people in 3 columns). This is deliberate, as explained in section 3.
4. **Carried over from 1.5.1:** canvas name tags still use the game's own font; on phones the inspector sits below the canvas rather than in a bottom sheet; the dashboard metrics don't link to filtered lists; there are no automated visual-regression tests.
