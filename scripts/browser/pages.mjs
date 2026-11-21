// Captures every route at 1440 / 1280 / 768 / 390 px, dark and light, checking for
// horizontal overflow and console errors. Read-only: it changes no data.
// Usage: node scripts/browser/pages.mjs <origin> <cdpPort> <outDir>

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, connect, sleep } from './cdp.mjs';

const [origin, cdpPort, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = await connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
const a = app(page, origin, outDir);
await page.send('Page.navigate', { url: `${origin}/` });
await sleep(1500);

const ROUTES = [
  ['dashboard', '/'],
  ['office', '/office'],
  ['projects', '/projects'],
  ['employees', '/employees'],
  ['tasks', '/tasks'],
  ['meetings', '/meetings'],
  ['approvals', '/approvals'],
  ['activity', '/activity'],
  ['settings', '/settings'],
];
const overflow = [];
let count = 0;
for (const theme of ['dark', 'light']) {
  for (const width of [1440, 1280, 768, 390]) {
    for (const [name, path] of ROUTES) {
      await a.viewport(width);
      await a.go(path, theme);
      if (name === 'office') await sleep(1500);
      const shot = await a.shoot(`${theme}-${name}-${String(width)}`);
      count += 1;
      if (shot.overflow) overflow.push(shot.name);
    }
  }
}
const summary = [
  `screens: ${String(count)}`,
  `horizontal overflow: ${overflow.length === 0 ? 'none' : overflow.join(', ')}`,
  `console errors: ${String(page.errors.length)}`,
  ...[...new Set(page.errors)].slice(0, 10).map((error) => `  ${error.slice(0, 300)}`),
].join('\n');
console.log(summary);
writeFileSync(join(outDir, 'pages.txt'), `${summary}\n`);
page.close();
process.exit(overflow.length === 0 && page.errors.length === 0 ? 0 : 1);
