// Minimal Chrome DevTools Protocol driver for browser verification of Project HQ.
// Development tooling only: never bundled into the app. Uses Node's built-in
// WebSocket (Node 22+); no extra dependencies.
//
// Start the app with `npx vite --port 5199` and Chrome with
// `google-chrome --headless=new --remote-debugging-port=9333 --user-data-dir=<dir>`.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Connects to one page target. Collects console errors and uncaught exceptions. */
export async function connect(webSocketUrl) {
  const ws = new WebSocket(webSocketUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));
  let nextId = 1;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      errors.push(msg.params.exceptionDetails.exception?.description ?? 'exception');
    } else if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      errors.push(msg.params.args.map((arg) => arg.value ?? arg.description).join(' '));
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? 'evaluation failed');
    }
    return result.result.value;
  };
  const waitFor = async (expression, timeout = 15000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await evaluate(`!!(${expression})`).catch(() => false)) return;
      await sleep(100);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
  await send('Runtime.enable');
  await send('Page.enable');
  return { ws, send, evaluate, waitFor, errors, close: () => ws.close() };
}

/** Page helpers bound to one connection and the app's origin. */
export function app(page, origin, outDir) {
  const { send, evaluate, waitFor } = page;

  const viewport = async (width) => {
    const mobile = width < 500;
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height: mobile ? 844 : 900,
      deviceScaleFactor: 1,
      mobile,
    });
  };

  const go = async (path, theme = 'dark') => {
    await evaluate(`(() => {
      localStorage.setItem('project-hq:theme', '${theme}');
      localStorage.setItem('project-hq:sidebar-collapsed', 'false');
      localStorage.setItem('project-hq:office-intro-seen', 'true');
    })()`);
    await send('Page.navigate', { url: origin + path });
    await waitFor(`document.querySelector('main') && !document.body.innerText.includes('Loading')`);
    await sleep(600);
  };

  const shoot = async (name, { full = false } = {}) => {
    const overflow = await evaluate('document.documentElement.scrollWidth > window.innerWidth');
    if (full) {
      const height = await evaluate(
        `Math.max(document.documentElement.scrollHeight, (document.querySelector('main')?.scrollHeight ?? 0) + 120)`,
      );
      const width = await evaluate('window.innerWidth');
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width < 500,
      });
      await sleep(400);
    }
    const { data } = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
    if (full) await viewport(await evaluate('window.innerWidth'));
    return { name, overflow };
  };

  const click = (selector) => evaluate(`(${selector}).click()`);
  const button = (text, scope = 'document') =>
    `[...${scope}.querySelectorAll('button,a')].find(b => (b.getAttribute('aria-label') ?? b.textContent).trim().startsWith(${JSON.stringify(text)}))`;
  const dialog = (title) =>
    `[...document.querySelectorAll('[role=dialog],[role=alertdialog]')].find(d => d.textContent.includes(${JSON.stringify(title)}))`;
  const labelled = (scope, label) =>
    `(() => { const l = [...${scope}.querySelectorAll('label')].find(l => l.textContent.trim().startsWith(${JSON.stringify(label)})); return l.control ?? document.getElementById(l.htmlFor); })()`;

  /** Sets a form control the way a user would (React listens to input/change events). */
  const type = async (selector, value) => {
    await evaluate(`(() => {
      const el = ${selector};
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype
        : el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
      el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    })()`);
  };

  /** Reads the live workspace (development server only: modules are served from /src). */
  const workspace = (expression) =>
    evaluate(
      `(async () => { const { getWorkspace } = await import('/src/stores/workspace.ts'); const w = getWorkspace(); return ${expression}; })()`,
    );

  /** Runs app commands as the founder (development server only). */
  const run = (body) =>
    evaluate(
      `(async () => { const { commands } = await import('/src/commands/index.ts'); const { USER_ACTOR: me } = await import('/src/domain/types/actor.ts'); ${body} })()`,
    );

  // Office walking with the development position handle (TD-50).
  const KEYS = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyE: 'e', Tab: 'Tab' };
  const key = (code, type) =>
    send('Input.dispatchKeyEvent', {
      type,
      code,
      key: KEYS[code],
      windowsVirtualKeyCode: code === 'Tab' ? 9 : KEYS[code].toUpperCase().charCodeAt(0),
    });
  const tap = async (code) => {
    await key(code, 'keyDown');
    await sleep(60);
    await key(code, 'keyUp');
  };
  const position = () => evaluate('window.__projectHqOffice?.state()');
  // Tile axes: Down+Right = +col, Up+Left = -col, Up+Right = -row, Down+Left = +row.
  const walkAxis = async (axis, target) => {
    for (let i = 0; i < 150; i++) {
      const p = await position();
      const delta = target - p[axis];
      if (Math.abs(delta) < 0.15) return;
      const combo =
        axis === 'col'
          ? delta > 0
            ? ['KeyS', 'KeyD']
            : ['KeyW', 'KeyA']
          : delta > 0
            ? ['KeyS', 'KeyA']
            : ['KeyW', 'KeyD'];
      for (const code of combo) await key(code, 'keyDown');
      await sleep(Math.min(250, Math.max(40, Math.abs(delta) * 160)));
      for (const code of combo) await key(code, 'keyUp');
      await sleep(40);
    }
  };
  const openOffice = async (theme, width) => {
    await viewport(width);
    await go('/office', theme);
    await waitFor('window.__projectHqOffice?.state()', 20000);
    await sleep(1200);
    await evaluate(`document.querySelector('[aria-label="Virtual office"]').focus()`);
  };
  const walkTo = async (col, row) => {
    await walkAxis('row', 8.5); // the corridor
    await walkAxis('col', col);
    await walkAxis('row', row);
  };
  const inspector = () =>
    evaluate(`document.querySelector('aside[aria-label="Office inspector"]')?.innerText ?? ''`);

  return {
    viewport,
    go,
    shoot,
    click,
    button,
    dialog,
    labelled,
    type,
    workspace,
    run,
    tap,
    openOffice,
    walkTo,
    inspector,
  };
}

/** A pass/fail ledger printed as it goes. */
export function checks() {
  const results = [];
  return {
    check(label, ok) {
      results.push({ label, ok: Boolean(ok) });
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
    },
    results,
  };
}
