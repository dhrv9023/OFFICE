# Project HQ

An interactive virtual office where one person manages a workforce of AI employees.
Phase 1 builds the frontend foundation and a simulated isometric office — no LLM integration yet
(Phase 2 adds real AI).

**Status:** Phase 1 (through 1.8) complete. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Requirements

This is a Node.js / TypeScript project, so there is no `requirements.txt` (that is a Python
convention). Dependencies are declared in [package.json](package.json) and pinned exactly in
[package-lock.json](package-lock.json); `npm ci` installs precisely those versions.

| Requirement | Version                                            | Notes                                       |
| ----------- | -------------------------------------------------- | ------------------------------------------- |
| Node.js     | **20.19+ or 22.12+** (22 LTS or newer recommended) | `.nvmrc` pins 22. Required by Vite 8.       |
| npm         | 10+ (bundled with Node)                            |                                             |
| Git         | any recent version                                 |                                             |
| Browser     | Chrome, Edge, Firefox or Safari (current)          | Uses IndexedDB and WebGL/Canvas for Phaser. |

No API keys, database, or `.env` file are needed in Phase 1. Data is stored in your browser's IndexedDB.

## Setup

### Windows

1. Install Node.js LTS from <https://nodejs.org> (tick "Add to PATH"), and Git from <https://git-scm.com>.
2. Open PowerShell or Git Bash:

   ```powershell
   git clone https://github.com/dhrv9023/OFFICE.git
   cd OFFICE
   npm ci
   npm run dev
   ```

3. Open <http://localhost:5173>.

### Linux / macOS

```bash
git clone https://github.com/dhrv9023/OFFICE.git
cd OFFICE
nvm use          # optional: picks Node 22 from .nvmrc
npm ci
npm run dev      # http://localhost:5173
```

Use `npm install` instead of `npm ci` only if you intend to change dependencies.

## Scripts

| Script              | What it does                                 |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Vite dev server                              |
| `npm run build`     | Type-check, then production build to `dist/` |
| `npm run preview`   | Serve the production build                   |
| `npm run typecheck` | `tsc -b` (strict)                            |
| `npm run lint`      | ESLint, including layer-boundary rules       |
| `npm run format`    | Prettier write (`format:check` to verify)    |
| `npm test`          | Vitest, single run (`test:watch` to watch)   |
| `npm run check`     | typecheck + lint + format check + tests      |

Run `npm run check` after setup to confirm your environment is healthy.

## Troubleshooting

- **`npm ci` fails or "Unsupported engine"** — your Node is too old. Check `node -v` (need 20.19+ / 22.12+).
- **Port 5173 already in use** — run `npm run dev -- --port 5180`.
- **`format:check` complains on Windows** — the repo forces LF line endings via
  [.gitattributes](.gitattributes). Re-clone, or run `git add --renormalize .`.
- **Blank page or stale data** — clear the site's IndexedDB in browser DevTools (Application → Storage),
  or use the app's reset option.
- **`scripts/browser/*.mjs`** are optional dev-only verification scripts (need Node 22+ and a local Chrome
  with remote debugging); you do not need them to run the app.

## Stack

React 19 · TypeScript (strict) · Vite · Phaser 3 · Tailwind CSS v4 · Zustand · React Router · Lucide · Vitest.

## Structure

```
src/
  app/         shell, routes, navigation
  components/  reusable UI primitives
  features/    one folder per product area (office, projects, tasks, employees, activity, …)
  domain/      pure TypeScript: types, rules, seed data
  stores/      Zustand state (source of truth)
  commands/    the only write path into stores
  services/    storage and agent interfaces
  bridge/      typed event bus between Phaser and the app
  game/        Phaser only: isometric maths, scenes, entities, systems, assets
  styles/      Tailwind entry + design tokens
```

Phaser renders; it never owns data. The rules are in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and enforced by ESLint.

## Documentation

- [Product spec](docs/PRODUCT_SPEC.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Roadmap](docs/ROADMAP.md)
- [Technical decisions](docs/TECHNICAL_DECISIONS.md)
- [Assets](docs/ASSETS.md)
