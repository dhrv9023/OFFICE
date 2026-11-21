import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Layer boundaries from docs/ARCHITECTURE.md, enforced by lint:
 *  - domain/  is pure TypeScript: no frameworks, no other layers.
 *  - game/    is Phaser only: no React, no stores, no commands, no UI.
 *  - bridge/  is framework-free glue: no React, no Phaser.
 *  - UI code never imports Phaser directly (only via the lazy game entry point).
 *  - IndexedDB (idb) is used only inside services/storage.
 *  - commands/ is the only writer of business state: nothing else may import
 *    stores/internal (the writable store).
 */
/**
 * Each rule is `[patterns, message]`. `patterns` is a list of gitignore-style globs,
 * or a single regex string. Several rules can apply to one set of files.
 */
const restrict = (...rules) => ({
  'no-restricted-imports': [
    'error',
    {
      patterns: rules.map(([patterns, message]) =>
        typeof patterns === 'string' ? { regex: patterns, message } : { group: patterns, message },
      ),
    },
  ],
});

const PHASER_ONLY_IN_GAME = [
  ['phaser', '@/game/scenes/**', '@/game/entities/**', '@/game/systems/**', '@/game/assets/**'],
  'Only game/ may import Phaser. Mount the game through the lazy @/game/createGame entry point.',
];
const IDB_ONLY_IN_STORAGE = [
  ['idb', 'idb/*', 'fake-indexeddb', 'fake-indexeddb/*'],
  'IndexedDB is used only inside services/storage. Everything else goes through StorageService.',
];
const SERVICES_STAND_ALONE = [
  [
    'react',
    'react-*',
    '@/commands',
    '@/commands/**',
    '@/features/**',
    '@/components/**',
    '@/app/**',
  ],
  'services/ are framework-free adapters: they must not depend on commands or UI.',
];
const NO_STORE_WRITES = [
  ['@/stores/internal/**', '**/stores/internal/**'],
  'Business state is written only by commands/. Read it through @/stores/workspace and change it through @/commands.',
];

export default defineConfig(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    files: ['src/domain/**'],
    rules: restrict(
      [
        ['react', 'react-*', 'phaser', 'zustand', 'zustand/*', 'lucide-react', '@/*'],
        'domain/ must stay pure TypeScript with no framework imports (use relative imports inside domain/).',
      ],
      [
        // Any path segment naming another layer, e.g. "../commands" or "../../stores/x".
        '(^|/)(stores|commands|services|game|bridge|features|components|app|hooks)(/|$)',
        'domain/ must not import from other layers.',
      ],
      IDB_ONLY_IN_STORAGE,
    ),
  },
  {
    // Pure pixel art shared by the game (sprites) and the interface (portraits).
    files: ['src/art/**'],
    rules: restrict(
      [
        ['react', 'react-*', 'phaser', 'zustand', 'zustand/*', 'lucide-react', '@/*'],
        'art/ is pure drawing code with no framework imports (use relative imports inside art/).',
      ],
      [
        '(^|/)(stores|commands|services|game|bridge|features|components|app|hooks|domain)(/|$)',
        'art/ must not import from other layers.',
      ],
      IDB_ONLY_IN_STORAGE,
    ),
  },
  {
    files: ['src/game/**'],
    rules: restrict(
      [
        [
          'react',
          'react-*',
          'zustand',
          'zustand/*',
          '@/stores',
          '@/stores/**',
          '@/commands',
          '@/commands/**',
          '@/features/**',
          '@/components/**',
          '@/app/**',
          '@/services/**',
        ],
        'game/ is a rendering layer: it talks to the app only through bridge/ and domain types.',
      ],
      IDB_ONLY_IN_STORAGE,
    ),
  },
  {
    files: ['src/bridge/**'],
    rules: restrict(
      [
        ['react', 'react-*', 'phaser', '@/features/**', '@/components/**', '@/app/**'],
        'bridge/ must stay framework-free.',
      ],
      NO_STORE_WRITES,
      IDB_ONLY_IN_STORAGE,
    ),
  },
  {
    files: ['src/commands/**'],
    rules: restrict(PHASER_ONLY_IN_GAME, IDB_ONLY_IN_STORAGE, [
      ['react', 'react-*', '@/features/**', '@/components/**', '@/app/**', '@/game/**'],
      'commands/ are framework-free application logic, callable from UI and agents alike.',
    ]),
  },
  {
    // The agent runtime gets capabilities injected (gateway, reader, config lookup);
    // it may never reach the store, storage, the scene, the UI or command values
    // (which would include the founder's full authority). Types are fine.
    files: ['src/runtime/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/commands', '@/commands/**', '@/services/**'],
              allowTypeImports: true,
              message:
                'runtime/ receives gateways and readers by injection; import their types only.',
            },
            {
              group: [
                '@/stores/**',
                '**/stores/internal/**',
                '@/game/**',
                'phaser',
                'react',
                'react-*',
                '@/features/**',
                '@/components/**',
                '@/app/**',
                'idb',
                'idb/*',
              ],
              message:
                'runtime/ must not touch the store, storage, Phaser or UI: every change goes through the gateway.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/stores/**'],
    rules: restrict(PHASER_ONLY_IN_GAME, IDB_ONLY_IN_STORAGE),
  },
  {
    files: ['src/app/**', 'src/components/**', 'src/features/**', 'src/hooks/**'],
    rules: restrict(PHASER_ONLY_IN_GAME, NO_STORE_WRITES, IDB_ONLY_IN_STORAGE),
  },
  {
    files: ['src/services/**'],
    rules: restrict(
      PHASER_ONLY_IN_GAME,
      NO_STORE_WRITES,
      IDB_ONLY_IN_STORAGE,
      SERVICES_STAND_ALONE,
    ),
  },
  {
    // The one place allowed to talk to IndexedDB.
    files: ['src/services/storage/**'],
    rules: restrict(PHASER_ONLY_IN_GAME, NO_STORE_WRITES, SERVICES_STAND_ALONE),
  },
  {
    files: ['eslint.config.js', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
  // Plain JS files (config, browser verification scripts) are not part of a TS
  // project, so skip type-aware rules for them.
  { files: ['**/*.js', '**/*.mjs'], extends: [tseslint.configs.disableTypeChecked] },
  // Browser verification scripts run in Node and drive Chrome; development only.
  { files: ['scripts/**/*.mjs'], languageOptions: { globals: globals.node } },
  prettier,
);
