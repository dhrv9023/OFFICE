# Project HQ

An interactive virtual office where one person manages a workforce of AI employees.
Phase 1 builds the frontend foundation and a simulated isometric office — no LLM integration yet.

**Status:** Phase 1.0 (scaffold) complete. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Getting started

Requires Node 20.19+ (developed on Node 26).

```bash
npm install
npm run dev        # http://localhost:5173
```

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
