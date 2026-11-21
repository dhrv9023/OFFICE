# Phase 1.5 Report — Isometric Virtual Office & Playable Founder

**Status:** complete. Typecheck, ESLint, Prettier, all **638 tests** and the production build pass. I played the office in headless Chrome against real IndexedDB: walking, collisions, interactions, typing isolation and route changes, at 4 viewport sizes in both themes (§9). **Phase 1.6 has not been started.**

**Implementation plan (followed in this order):**

1. Furniture as layout data.
2. Pure world logic (walls, collision, movement, interaction, camera) with tests.
3. Procedural pixel art.
4. Entities and scene.
5. The bridge and React integration.
6. Browser play-testing and fixes.
7. Docs.

Each subsystem was tested before the next was started.

## 1. Architecture overview

```
React (OfficePage)                         bridge/                         game/ (Phaser, lazy chunk)
 useWorkspace + uiStore ──► buildOfficeViewModel ──► handle.setViewModel ──► OfficeScene.applyViewModel (diff sprites)
 InteractionPanel ◄──────── GameEvents bus ◄────────────────────────────────── player.moved, interaction.focus/hover/activate, camera.zoom
 OfficeCanvas (focusable element) ──── keys ─────────────────────────────────► keyboardControls (element-bound, never window)
                                                                               world/ (pure TS): walls, collision, movement, interaction, camera
```

- **Zustand is still the only source of truth.** The scene receives a view model built by a pure function, and reports interactions as typed events; it never imports stores or commands (lint-enforced) and never touches IndexedDB.
- **The founder's position is transient game state.** It lives in the scene and is not persisted (TD-02, §5.4).
- **The game is created once per visit to the page.** View-model and selection changes are pushed into the running scene; React re-renders never recreate it. Callbacks are read through refs, and identical view models are deduplicated (`sameOfficeViewModel`), so changes the office doesn't show don't reach Phaser.
- **Phaser remains lazily loaded.** `createGame` is the only game module the UI imports, dynamically.
- **The domain gains one thing:** `OfficeLayout.furniture`. The 26 × 18 layout, its 10 rooms (9 named rooms plus the corridor), its doors and its desks are unchanged (TD-49).

## 2. Office rendering implementation

- **Floor and back walls:**
  - each room is floored in its own colour (department rooms echo their department colour), with checker, wood-plank and carpet patterns, a door threshold strip and faint room-name labels;
  - the tall amber outer walls on the north and west edges, with navy trim and windows, are baked with the floor into **one static texture** (one draw, never re-sorted).
- **Cut-away walls (TD-46):**
  - derived from layout data (`deriveWalls`): every edge between rooms or onto the outside, except at doors;
  - interior partitions and the front outer walls are drawn as low (14 px) amber-capped walls, one depth-sorted image per edge, so nobody is ever hidden behind a wall.
- **Furniture:** 59 pieces of 18 kinds, including boards, bookshelves, workstations, chairs, sofas, armchairs, server racks, the reception desk, the meeting table and screen, coffee machine, fridge, counter, tables, an arcade machine, beanbag, water coolers and plants. Multi-tile pieces (2×1, 1×2, 3×1, 2×2) with facings are supported. Employee desks and chairs come from the existing desk data.
- **Depth sorting:** painter's order by `(col + row) × 10 + layer`. Partitions sort by edge midpoint, furniture by footprint centre (`footprintDepth`), people by their feet (continuously while walking), and desk chairs and seated people last. Tests cover the founder being behind or in front of a 2×2 table on each side, and ordering while moving.
- **Employees:** seated at their desks from the view model, in their department colour.
  - _Working_ ones type (2-frame animation) with a green "…" bubble.
  - _In review_ shows a magnifier bubble, _blocked_ an amber "!" bubble.
  - Hovering or focusing shows a name tag; selecting shows an amber ring.

## 3. Player movement implementation

- **Controls:** arrow keys and WASD (by key position, so they work on any keyboard layout).
- **Screen-relative directions (TD-44):** Up walks up the screen. Diagonals follow the floor's tile axes, so holding Up+Right walks straight along a corridor rather than zig-zagging into its wall.
- **Speed:** constant on screen in **all eight directions**, 150 px/s, so diagonals are never faster (unit-tested).
- **Feel:** a 0.09 s ramp up and 0.07 s stop, quick enough to feel responsive without twitching. Long frames are clamped to 50 ms, so a stalled tab can't push the founder through a wall.
- **Animation:**
  - a 4-frame walk with leg stride, arm swing and body bob at 9 fps;
  - a 2-frame idle breath;
  - four facings (front/back × left/right, mirrored).

  Facing turns immediately on input. Animation follows **actual** movement, so walking into a wall shows the founder standing rather than running on the spot.

- **Marker:** an amber diamond floats above the founder so you can always find yourself (it doesn't bob when reduced motion is requested).
- **Measured in Chrome** (positions sampled every animation frame while keys were held):

| Keys       | Steady on-screen speed | Frames to full speed |
| ---------- | ---------------------- | -------------------- |
| Down+Right | 148 px/s               | 10                   |
| Up+Left    | 151 px/s               | 5                    |
| Right      | 148 px/s               | 6                    |
| Left       | 156 px/s               | 4                    |
| Down       | 165 px/s               | 3                    |
| Up         | 154 px/s               | 5                    |

The spread around 150 is mostly sampling noise between the page's animation frames and Phaser's update loop; the unit tests assert exactly 150 px/s for every direction.

## 4. Camera implementation

- **Follow:** smooth follow (lerp 0.16, with a small offset so the view centres on the body). With `roundPixels`, the sprite stays crisp.
- **Zoom:** integer levels (1, 2, 3) via the `+`/`−` keys or the on-canvas buttons. The default is 2 on wide canvases and 1 below 720 px, so phones see more of the office.
- **Bounds:** the office diamond plus its back walls and a 48 px margin. When the viewport is larger than the office (zoom 1 on big screens), the bounds grow, centred, so the office sits in the middle instead of pinned to a corner. They are recomputed on every resize and zoom.
- **Resizing:** Phaser's `Scale.RESIZE` tracks the container. World coordinates are independent of screen size; the camera is the only thing that changes.

## 5. Collision and navigation approach

- **Geometry, kept separate from rendering (TD-45):** built from layout data as tile-space boxes:
  - walls are thin strips (±0.08 tile) on tile edges with gaps at doors;
  - blocking furniture, desks and seats are whole tiles;
  - the boxes are bucketed by tile for cheap queries.
- **The founder:** a 0.4-tile square footprint.
- **Resolution:**
  - each axis is resolved separately, so pushing diagonally into a wall **slides** along it;
  - moves are sub-stepped to 0.1 tile, so **no tunnelling** even with a huge step;
  - the founder stops flush at the nearest edge and can't leave the map.
- **Corner assist:** when walking straight into a corner or just beside a doorway, the founder is nudged sideways (at walking speed, up to 0.3 tile) and slips through. It works on both axes, and doesn't pull someone clearly beside a doorway through it (tested).
- **Tests:**
  - doorway entry;
  - stopping flush at a wall;
  - diagonal sliding;
  - corner assist into doors and past furniture corners on both axes;
  - furniture, desks, chairs and the meeting table blocking;
  - map edges;
  - no tunnelling;
  - a **seeded 6,000-move random walk** that never ends inside anything and explores more than 100 tiles (it never gets stuck).

## 6. Interactive object system

- **Interactables (`buildInteractables`):** employees at their seats, vacant desks (none in the seed), all 9 room entrances, and furniture marked with an `interaction`. That covers the project board, the department boards in Design, Frontend, Backend and QA, the meeting screen, the reception desk, the coffee machine and the arcade.
- **Proximity:** every frame, `nearestInteractable` picks the best object within range, preferring what the founder faces. The focused object gets a bouncing **E** prompt and a highlight (employees also show their name tag). It is emitted as `interaction.focus`, and the HUD shows "Press E for Sarah Chen".
- **Activation:** **E, Enter or Space** on the focused object, or a **click** on any interactive sprite (pixel-perfect hit areas, hand cursor; doors use a diamond hit zone). This emits `interaction.activate` with a typed target and the `source`. Hover emits `interaction.hover`.
- **The typed contract:** `InteractionTarget` is `employee | desk | room_entrance | object`, carrying IDs only. The application looks everything up in its own state.
- **Current React behaviour (placeholder, as requested):**
  - activating selects the target: employees go into `uiStore`, which feeds the view model, and a ring appears in the office;
  - `InteractionPanel` shows read-only live data: an employee's role, status, open tasks and current task (opening the task sheet); a room's people; the project board's counts; a department board's open tasks with a link to the filtered task board.

  There are no conversations, no task assignment and no meetings (Phase 1.6).

## 7. Asset strategy and sources

- **All original and procedural:** no image files, no third-party art, no licensing risk. The full list is in [ASSETS.md](ASSETS.md).
- **Characters:** pixel buffers with a 1 px outline, in 24 × 40 frames with feet on a fixed baseline. Front and back views are mirrored for left and right.
- **Furniture:** composed from isometric boxes plus pixel details, rendered once to textures shared by all pieces of the same kind, size and facing.
- **Generation:** all textures are generated once when the scene starts, in a few milliseconds, with nothing to download beyond the existing lazy Phaser chunk.
- **Replaceable later:** stable texture keys (`furniture.<kind>.<cols>x<rows>.<facing>`, `character.<id>`, `office.base`, `wall.col|row`) are the seam for sprite sheets, without changing scenes.

## 8. Tests and results

Run on 2026-11-20.

| Check                  | Result                                                            |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run typecheck`    | Passed                                                            |
| `npm run lint`         | Passed, 0 problems (game layer boundaries still enforced)         |
| `npm run format:check` | Passed                                                            |
| `npm test`             | **638 of 638 passed, 45 files** (53 new or changed in this phase) |
| `npm run build`        | Succeeded                                                         |

| File                                          | Tests   | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `game/world/world.test.ts` (new)              | 25      | Walls: outer, back and front edges, room separation, every door open. Collision: see §5. Movement: equal speed in 8 directions, diagonals along the tile axes, opposite keys, ramp up and stop, facing. Interaction: interactable list, range, facing preference. Camera: bounds cover the office and back walls, centring in large viewports, zoom defaults and steps. Depth: multi-tile furniture on all sides, continuous ordering while walking. |
| `game/systems/keyboardControls.test.ts` (new) | 7       | Arrows and WASD; scroll prevented; E, Enter and Space once per press; zoom keys; **keys ignored from other inputs and from buttons inside the office**; browser shortcuts left alone; release on blur; dispose                                                                                                                                                                                                                                       |
| `game/assets/characters.test.ts` (new)        | 4       | Outline and mirror; every pose fits the frame with feet on the baseline; walk frames differ; deterministic department-coloured looks                                                                                                                                                                                                                                                                                                                 |
| `bridge/officeViewModel.test.ts` (new)        | 4       | Seats, colours and derived status; reflects status changes; unchanged office means an equal view model; **event bridge communication**; stable target keys                                                                                                                                                                                                                                                                                           |
| `features/office/OfficePage.test.tsx` (new)   | 7       | Game created **once in StrictMode** and destroyed on unmount (no listeners afterwards); first-visit instructions that focus the office; view model pushed only when the office would change; room and nearby HUD; employee activation selects and opens details, and closing deselects; objects and entrances with live data; zoom buttons and the touch D-pad reach the game                                                                        |
| `domain/rules/officeLayout.test.ts`           | +6 (16) | Furniture validation: seed is valid; no doorway blocking; seating only on waypoints; outside the room, overlap and duplicate IDs; walk-through items; footprint tiles                                                                                                                                                                                                                                                                                |

`isoMath.test.ts` (9, from Phase 1.0) still covers world-to-screen conversion, screen-to-tile selection and inverse round trips.

**Mutation check:** I broke nine gameplay safeguards one at a time. All nine are caught, and every file was restored.

| Deliberate break                    | Tests that failed |
| ----------------------------------- | ----------------- |
| Diagonals not normalised (faster)   | 2                 |
| Walls ignored by collision          | 3                 |
| Furniture ignored by collision      | 1                 |
| Corner assist off (col axis)*       | 1                 |
| Corner assist off (row axis)        | 2                 |
| Keys read from anywhere             | 1                 |
| Interaction range ignored           | 1                 |
| Game recreated on every view change | 2                 |
| Game not destroyed on unmount       | 1                 |

\*The first run of this break was **not** caught: my tests only exercised corner assist in one direction. I added a test that clips the corridor plant's corner moving along the other axis, and both directions are now caught.

## 9. Browser testing and screenshots

Headless Chrome, Vite dev server, real IndexedDB, driven over the DevTools protocol with real key and touch events. The workspace had live work in it: Sarah and Ryan working, Daniel in review, Emma blocked.

- **Walking:**
  - from the corridor through the Management doorway to Alex's desk ("Press E for Alex Morgan"), then E opens his details;
  - back out, along the corridor and into Frontend ("Press E for Ryan Miller");
  - also into QA, the Meeting Room, Backend and Design, where E selects Sarah.

  The HUD room name followed every move.

- **No movement while typing:** "wasd" and an arrow key typed into an input landed in the input, and the founder stayed in the same room.
- **No duplicate Phaser instances:** after 4 Dashboard ⇄ Office round trips there was **1 canvas**, and window listener counts were identical before and after (`blur 2, resize 1, …`). Leaving the office leaves **0 canvases**.
- **All routes still render:** `/`, `/projects`, `/tasks`, `/employees`, `/activity`, `/settings`, `/office`.
- **Viewport sizes**, each with a single canvas and no horizontal page overflow in either theme:

| Viewport | Canvas    | Zoom |
| -------- | --------- | ---- |
| 1440     | 798 × 743 | 2    |
| 1280     | 638 × 643 | 1    |
| 768      | 718 × 626 | 1    |
| 390      | 356 × 522 | 1    |

- **Touch:** with touch emulation the D-pad appears, and holding "Walk right" moved the founder **2.1 tiles**.
- **Console:** no errors or warnings in any session.
- **Fixes made from play-testing:**
  - seated employees were hidden behind their chairs; they are now lifted onto the seat and drawn over it;
  - the E prompt overlapped name tags; they are now stacked;
  - room labels were clipped; they are now centred in their rooms;
  - Space on a focused zoom button was swallowed by the game; keys now only count when the office element itself has focus;
  - two shelves showed their backs; they were moved to face into their rooms;
  - the hint pill wrapped on phones; it is now shorter there, with touch wording on touch devices.

**Screenshots** are in [`docs/screenshots/phase-1.5/`](screenshots/phase-1.5/):

- `dark-office-desktop-1440.png`, `-laptop-1280`, `-tablet-768`, `-mobile-390`, and the `light-office-*` versions (the office canvas keeps its own palette; the UI around it follows the theme)
- `dark-office-design-selected.png`: Sarah working, with the E prompt, name tag, selection ring and details panel
- `dark-office-backend-review.png`: server racks and Daniel's review bubble
- `dark-office-qa-blocked.png`: Emma's blocked bubble
- `dark-office-meeting-room.png`
- `dark-office-overview-zoom1.png`: the whole floor at zoom 1
- `dark-office-mobile-touch-pad.png`: phone layout with the D-pad

## 10. Performance observations

- **Frame rate:** 57–60 fps in headless Chrome using **software** WebGL (SwiftShader), with a median frame time of 16.7 ms while walking. A laptop GPU has more headroom than this.
- **Per frame:** one founder update (no allocations: velocity, step and move-result objects are preallocated), one proximity scan over about 25 interactables, and a position update for the prompt. Collision queries touch only the boxes in about 9 nearby tiles.
- **Static world:** the floor and back walls are one image. Partitions and furniture are about 160 static images that are never redrawn. Textures are generated once and shared, so the 59 furniture pieces use 27 textures.
- **React:** unrelated store changes don't reach Phaser (view-model dedupe), and the scene is never recreated by re-renders.
- **Bundle:** Phaser plus the office stays lazy at 1.23 MB (331 kB gzip), +12 kB gzip for the scene and art code. The main app bundle is 526 kB (158 kB gzip), +6 kB gzip for the office page, panel and bridge.
- **Memory:** the static floor texture is about 1.4 k × 0.8 k pixels (~4.5 MB of GPU memory).

## 11. Known limitations

1. **The office canvas keeps its own palette in the light theme** (deliberate, TD-16): the dark backdrop around the office remains.
2. **No click-to-walk or pathfinding.** Clicking selects objects. Touch uses a D-pad; navigation (A*) is planned with employee movement in 1.6.
3. **Employees don't move yet:** they sit at their desks. Status changes switch between typing, bubble and idle, but there is no walking to meetings or breaks (Phase 1.6, per the roadmap).
4. **Interactions are placeholders:** a details panel only. There are no conversations, assignment or meetings, as scoped.
5. **Small canvases default to zoom 1:** below 720 px of canvas width (including the 1280 px laptop layout, whose canvas is 638 px), people are small. Zoom 2 is one key away.
6. **Text in the canvas uses Phaser text at 3× resolution:** crisp at zoom 1–2 and slightly soft at zoom 3. There is no bitmap pixel font yet.
7. **Low walls are partitions, not full walls:** part of the cut-away look, so rooms don't feel fully enclosed.
8. **The canvas isn't screen-reader content.** Its `role="application"` region has instructions, and every office action is available from the Employees, Projects and Tasks pages (R13).
9. **Headless test limits:** the frame-rate figures come from software rendering. Drag interactions and real touch gestures beyond the D-pad weren't tested.
10. **Department colours now exist in four places:** seed data, CSS tokens, light-theme tokens, and the office floor palette (`game/assets/palette.ts`).

## 12. What is ready for Phase 1.6

- **Interaction to commands:** `interaction.activate` already reaches `OfficePage` with typed targets. Phase 1.6 can open conversation and assignment UI from `InteractionPanel` and run the **existing commands** (assign, change status) with no change to the game layer.
- **Employee movement:** layout data (furniture, desks, waypoints), the collision world and `Founder`'s movement and animation code are ready to drive walking employees. Waypoints for meeting seats, break spots and lounge seats already exist. A* over the same tile grid is the next piece.
- **Presence state:** the view model is the channel for presence (in a meeting, on a break) when it becomes explicit state (TD-20).
- **Selection and highlighting:** `handle.select` and the ring work for any target, and employee hover, focus and selected states exist.
- **Testing harnesses:** the dev-only `__projectHqOffice.state()` hook and the CDP play-test scripts let movement and interactions be verified in a real browser.
