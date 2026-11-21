// Phase 1.7 browser verification against the Vite dev server and real IndexedDB.
// Usage: node scripts/browser/phase-1-7.mjs <origin> <cdpPort> <outDir>
// Use a fresh Chrome profile: the scenario seeds its own company.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, checks, connect, sleep } from './cdp.mjs';

const [origin, cdpPort, outDir] = process.argv.slice(2);
mkdirSync(outDir, { recursive: true });
const { check, results } = checks();
const overflowed = [];

const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
const page = await connect(targets.find((target) => target.type === 'page').webSocketDebuggerUrl);
const a = app(page, origin, outDir);
const shoot = async (name, options) => {
  const result = await a.shoot(name, options);
  if (result.overflow) overflowed.push(name);
  console.log(`  shot ${name}${result.overflow ? '  !! horizontal overflow' : ''}`);
};
const day = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

await page.send('Page.navigate', { url: `${origin}/` });
await sleep(1500);
await a.viewport(1440);
await a.go('/');

// ── 1. A small company, created through the commands ────────────────────────
const seeded = await a.run(`
  const ok = (r) => { if (!r.ok) throw new Error(r.error.message); return r.value; };
  const site = ok(commands.createProject(me, { name: 'Website relaunch', priority: 'high', deadline: '${day(27)}',
    description: 'A faster, clearer marketing site with the new brand and pricing.' }));
  ok(commands.updateProject(me, { projectId: site.id, patch: { status: 'active' } }));
  const portal = ok(commands.createProject(me, { name: 'Customer portal', priority: 'critical',
    description: 'Self-service accounts, invoices and support for customers.' }));
  ok(commands.updateProject(me, { projectId: portal.id, patch: { status: 'active' } }));
  ok(commands.createProject(me, { name: 'Billing API v2', description: 'Usage-based billing endpoints.' }));
  const t = (projectId, departmentId, title, assigneeId, extra = {}) =>
    ok(commands.createTask(me, { projectId, departmentId, title, assigneeId, ...extra }));
  const move = (task, ...statuses) => { for (const status of statuses) ok(commands.changeTaskStatus(me, { taskId: task.id, status })); };
  move(t(site.id, 'dept_management', 'Relaunch brief', 'emp_alex_morgan'), 'in_progress', 'in_review', 'done');
  move(t(site.id, 'dept_design', 'Design homepage', 'emp_sarah_chen', { priority: 'high', deadline: '${day(2)}' }), 'in_progress');
  move(t(site.id, 'dept_frontend', 'Build homepage', 'emp_ryan_miller', { priority: 'high', deadline: '${day(-3)}' }), 'in_progress');
  move(t(portal.id, 'dept_backend', 'Accounts API', 'emp_daniel_kim', { priority: 'critical' }), 'in_progress', 'in_review');
  t(portal.id, 'dept_qa', 'Portal test plan', 'emp_emma_wilson', { deadline: '${day(5)}' });
  t(portal.id, 'dept_frontend', 'Invoice screens', null, { deadline: '${day(-1)}' });
  t(site.id, 'dept_frontend', 'Pricing page', 'emp_ryan_miller');
  return 'ok';
`);
check('company created through commands', seeded === 'ok');
await sleep(1200);

// ── 2. Schema upgrade on real stored data: write a v2 record, reload ─────────
await page.evaluate(`new Promise((resolve, reject) => {
  const open = indexedDB.open('project-hq');
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('workspace', 'readwrite');
    const store = tx.objectStore('workspace');
    const get = store.get('current');
    get.onsuccess = () => {
      const record = get.result;
      record.schemaVersion = 2;
      for (const task of record.workspace.tasks) delete task.blockedReason;
      for (const event of record.workspace.activity) delete event.meetingId;
      store.put(record);
    };
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => reject(tx.error);
  };
})`);
await a.go('/');
const migrated = await a.workspace(
  `Object.values(w.tasks).every(t => 'blockedReason' in t) && w.activity.every(e => 'meetingId' in e)`,
);
check('a saved schema-v2 workspace upgrades to v3 on load, with nothing lost', migrated);
check(
  'the upgrade keeps the old record as a backup',
  await page.evaluate(`new Promise((resolve) => {
    const open = indexedDB.open('project-hq');
    open.onsuccess = () => {
      const req = open.result.transaction('backups').objectStore('backups').getAll();
      req.onsuccess = () => { resolve(req.result.some(b => b.reason === 'pre-migration')); open.result.close(); };
    };
  })`),
);

// ── 3. Dashboard: attention metrics link to filtered views ──────────────────
for (const [theme, width] of [
  ['dark', 1440],
  ['dark', 1280],
  ['dark', 768],
  ['dark', 390],
  ['light', 1440],
]) {
  await a.viewport(width);
  await a.go('/', theme);
  await shoot(`dashboard-${theme}-${String(width)}`);
}
await a.viewport(1440);
await a.go('/');
const overdueText = await page.evaluate(
  `[...document.querySelectorAll('a')].find(l => (l.getAttribute('aria-label') ?? '').startsWith('Overdue:'))?.getAttribute('aria-label')`,
);
check('dashboard counts 2 overdue tasks', overdueText?.startsWith('Overdue: 2.'));
await a.click(a.button('Overdue:'));
await sleep(700);
check(
  'the Overdue figure opens the board filtered to overdue work',
  (await page.evaluate('location.pathname + location.search')) === '/tasks?due=overdue',
);
await shoot('tasks-overdue-view-1440');

// ── 4. Blocking with a reason from the card menu ────────────────────────────
await a.go('/tasks');
await a.click(a.button('Change status of "Portal test plan"'));
await sleep(300);
await a.click(
  `[...document.querySelectorAll('[role=menuitem]')].find(m => m.textContent.includes('Blocked'))`,
);
await sleep(400);
const blockDialog = a.dialog('Mark as blocked');
await a.type(a.labelled(blockDialog, 'Reason'), 'Waiting on staging credentials from IT');
await shoot('block-reason-dialog-1440');
await a.click(a.button('Mark as blocked', blockDialog));
await sleep(600);
const blocked = await a.workspace(
  `Object.values(w.tasks).find(t => t.title === 'Portal test plan')`,
);
check(
  'blocking records the reason and shows it on the card',
  blocked.status === 'blocked' &&
    blocked.blockedReason === 'Waiting on staging credentials from IT' &&
    (await page.evaluate('document.body.innerText')).includes('Waiting on staging credentials'),
);
await shoot('tasks-board-1440');
for (const width of [1280, 768, 390]) {
  await a.viewport(width);
  await a.go('/tasks');
  await shoot(`tasks-board-${String(width)}`);
}
await a.viewport(1440);
await a.go('/tasks?status=blocked', 'light');
await shoot('tasks-blocked-light-1440');

// ── 5. Meetings: schedule with a time, start, presence in the office ────────
await a.openOffice('dark', 1440);
await a.walkTo(13.5, 9.5);
await sleep(400);
await a.tap('KeyE');
await sleep(700);
check(
  'the meeting room door opens the planner',
  (await a.inspector()).includes('Schedule a meeting'),
);
await a.click(a.button('Schedule a meeting'));
await sleep(400);
const scheduleDialog = a.dialog('Schedule a meeting');
await a.type(a.labelled(scheduleDialog, 'Title'), 'Relaunch kick-off');
await a.type(a.labelled(scheduleDialog, 'Agenda'), 'Agree scope and owners for the relaunch.');
await a.type(a.labelled(scheduleDialog, 'Date'), day(1));
await a.type(a.labelled(scheduleDialog, 'Start time'), '10:00');
await a.type(a.labelled(scheduleDialog, 'Duration'), '45');
const siteId = await a.workspace(
  `Object.values(w.projects).find(p => p.name === 'Website relaunch').id`,
);
await a.type(a.labelled(scheduleDialog, 'Project'), siteId);
for (const name of ['Sarah Chen', 'Ryan Miller', 'Alex Morgan']) {
  await a.click(
    `[...${scheduleDialog}.querySelectorAll('label')].find(l => l.textContent.includes(${JSON.stringify(name)})).querySelector('input')`,
  );
}
await sleep(300);
await shoot('meeting-schedule-dialog-1440');
await a.click(a.button('Schedule meeting', scheduleDialog));
await sleep(700);
const meeting = await a.workspace(
  `Object.values(w.meetings).find(m => m.title === 'Relaunch kick-off')`,
);
check(
  'meeting saved with date, time, duration, project and three participants',
  meeting?.startsAt === `${day(1)}T10:00` &&
    meeting.durationMinutes === 45 &&
    meeting.projectId === siteId &&
    meeting.participantIds.length === 3,
);

// A clashing second meeting is refused with the reason.
await a.click(a.button('Schedule a meeting'));
await sleep(400);
const clashDialog = a.dialog('Schedule a meeting');
await a.type(a.labelled(clashDialog, 'Title'), 'Design sync');
await a.type(a.labelled(clashDialog, 'Date'), day(1));
await a.type(a.labelled(clashDialog, 'Start time'), '10:30');
await a.click(
  `[...${clashDialog}.querySelectorAll('label')].find(l => l.textContent.includes('Sarah Chen')).querySelector('input')`,
);
await sleep(300);
const busyShown = (await page.evaluate(`${clashDialog}.innerText`)).includes(
  'Busy: in “Relaunch kick-off”',
);
await a.click(a.button('Schedule meeting', clashDialog));
await sleep(400);
const clashText = await page.evaluate(`${clashDialog}.innerText`);
check(
  'a clashing meeting is refused, naming the person and meeting',
  busyShown && clashText.includes('Sarah Chen is already in "Relaunch kick-off" at that time.'),
);
await shoot('meeting-clash-1440');
await a.click(a.button('Cancel', clashDialog));
await sleep(300);

await a.click(a.button('Start'));
await sleep(1200);
const presence = await page.evaluate(`(async () => {
  const { getWorkspace } = await import('/src/stores/workspace.ts');
  const { buildOfficeViewModel } = await import('/src/bridge/officeViewModel.ts');
  const { OFFICE_LAYOUT } = await import('/src/domain/seed/index.ts');
  return buildOfficeViewModel(getWorkspace(), OFFICE_LAYOUT, null).employees
    .filter(e => e.presence === 'in_meeting').map(e => e.name);
})()`);
check(
  'starting the meeting seats its three participants in the meeting room',
  presence.length === 3,
);
await shoot('meeting-in-progress-office-1440');

// Ryan's profile says where he is.
await page.evaluate(
  `[...document.querySelectorAll('aside button')].find(b => b.getAttribute('aria-label') === 'Back to overview')?.click()`,
);
await sleep(300);
await a.click(
  `[...document.querySelectorAll('aside button')].find(b => b.textContent.includes('Ryan Miller'))`,
);
await sleep(500);
check(
  'the profile shows the running meeting',
  (await a.inspector()).includes('In a meeting: Relaunch kick-off'),
);
await shoot('profile-in-meeting-1440');

// Hold it, with notes.
await a.walkTo(13.5, 9.5);
await a.tap('KeyE');
await sleep(600);
await a.click(a.button('Mark as held'));
await sleep(400);
const heldDialog = a.dialog('Mark as held');
await a.type(
  a.labelled(heldDialog, 'Notes'),
  'Hero first, pricing second. Sarah owns visuals; Ryan builds.',
);
await a.click(a.button('Mark as held', heldDialog));
await sleep(900);
check(
  'holding the meeting stores the notes and everyone returns to their desk',
  (await a.workspace(
    `Object.values(w.meetings).find(m => m.title === 'Relaunch kick-off').status`,
  )) === 'completed' &&
    (await page.evaluate(`(async () => {
      const { getWorkspace } = await import('/src/stores/workspace.ts');
      const { buildOfficeViewModel } = await import('/src/bridge/officeViewModel.ts');
      const { OFFICE_LAYOUT } = await import('/src/domain/seed/index.ts');
      return buildOfficeViewModel(getWorkspace(), OFFICE_LAYOUT, null).employees.every(e => e.presence === 'at_desk');
    })()`)),
);
await shoot('meeting-held-1440');
await a.openOffice('dark', 1440);
await a.walkTo(9.5, 4.6);
await a.tap('KeyE');
await sleep(700);
check(
  'the participant profile keeps the meeting notes',
  (await a.inspector()).includes('Hero first, pricing second.'),
);
await shoot('profile-meeting-notes-1440');
await a.openOffice('light', 390);
await a.walkTo(9.5, 4.6);
await a.tap('KeyE');
await sleep(700);
await shoot('profile-light-390');

// ── 6. Activity filters ─────────────────────────────────────────────────────
await a.viewport(1440);
await a.go('/activity?kind=meeting');
const activityText = await page.evaluate('document.body.innerText');
check(
  'activity can be filtered to meetings',
  activityText.includes('Meeting "Relaunch kick-off" was held') &&
    !activityText.includes('was assigned to'),
);
await shoot('activity-meetings-1440');
await a.go('/activity?employee=emp_ryan_miller');
await shoot('activity-person-1440');
await a.viewport(390);
await a.go('/activity');
await shoot('activity-390');

// ── 7. Notifications lead somewhere ─────────────────────────────────────────
await a.viewport(1440);
await a.go('/');
await a.click(a.button('Notifications'));
await sleep(400);
await shoot('notifications-1440');
const unreadBefore = await a.workspace('w.notifications.filter(n => !n.isRead).length');
await a.click(
  `[...document.querySelectorAll('li button')].find(b => b.textContent.includes('Open task'))`,
);
await sleep(700);
const unreadAfter = await a.workspace('w.notifications.filter(n => !n.isRead).length');
const location = await page.evaluate('location.search');
check(
  'clicking a notification marks it read and opens the task',
  unreadAfter === unreadBefore - 1 && location.includes('task='),
);
await shoot('notification-opened-task-1440');

// ── 8. Two tabs: a real save conflict, resolved explicitly ──────────────────
await a.go('/');
const second = await (
  await fetch(`http://127.0.0.1:${cdpPort}/json/new?${origin}/`, { method: 'PUT' })
).json();
const tab2 = await connect(second.webSocketDebuggerUrl);
await tab2.waitFor(
  `document.querySelector('main') && !document.body.innerText.includes('Loading')`,
  20000,
);
await sleep(800);
await tab2.evaluate(`(async () => {
  const { commands } = await import('/src/commands/index.ts');
  const { USER_ACTOR } = await import('/src/domain/types/actor.ts');
  commands.createProject(USER_ACTOR, { name: 'Made in tab two' });
})()`);
await sleep(1200);
await a.run(`commands.createProject(me, { name: 'Made in tab one' }); return true;`);
await sleep(1200);
const bannerText = await page.evaluate(`document.querySelector('[role=alert]')?.innerText ?? ''`);
check(
  'the first tab explains the conflict instead of failing silently',
  bannerText.includes('open in another tab'),
);
await shoot('save-conflict-banner-1440');
const leaveBlocked = await page.evaluate(`(() => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
})()`);
check('leaving with unsaved changes asks for confirmation', leaveBlocked);
await a.click(a.button('Keep this tab’s version'));
await sleep(400);
await shoot('save-conflict-confirm-1440');
await a.click(a.button('Keep this version', a.dialog('Keep this tab’s version?')));
await sleep(1500);
check(
  'keeping this version saves it and keeps the other tab’s data as a backup',
  !(await page.evaluate(`document.body.innerText`)).includes('open in another tab') &&
    (await page.evaluate(`new Promise((resolve) => {
      const open = indexedDB.open('project-hq');
      open.onsuccess = () => {
        const req = open.result.transaction('backups').objectStore('backups').getAll();
        req.onsuccess = () => { resolve(req.result.some(b => b.reason === 'pre-overwrite' && JSON.stringify(b.payload).includes('Made in tab two'))); open.result.close(); };
      };
    })`)),
);
tab2.close();
await fetch(`http://127.0.0.1:${cdpPort}/json/close/${second.id}`);
await a.go('/settings');
await a.click(
  `[...document.querySelectorAll('[role=tab]')].find(t => t.textContent.includes('Storage'))`,
);
await sleep(700);
check(
  'backups are listed with a download',
  (await page.evaluate('document.body.innerText')).includes('Replaced by another tab'),
);
await shoot('settings-backups-1440');

// ── 9. Keyboard, canvases, other pages ──────────────────────────────────────
await a.go('/');
await page.evaluate('document.activeElement?.blur()');
await a.tap('Tab');
const firstFocus = await page.evaluate('document.activeElement?.textContent?.trim()');
check('the first Tab stop is the skip link', /skip/i.test(firstFocus ?? ''));
let reachedMetric = false;
for (let i = 0; i < 40 && !reachedMetric; i++) {
  await a.tap('Tab');
  reachedMetric = (
    await page.evaluate(`document.activeElement?.getAttribute('aria-label') ?? ''`)
  ).startsWith('Working:');
}
check('dashboard metrics are reachable by keyboard', reachedMetric);
await a.go('/office');
await sleep(1500);
await a.go('/');
await a.go('/office');
await sleep(1500);
check(
  'only one office canvas after navigating away and back',
  (await page.evaluate(`document.querySelectorAll('canvas').length`)) === 1,
);

for (const [path, name] of [
  ['/projects', 'projects'],
  ['/employees', 'employees'],
  ['/settings', 'settings'],
]) {
  for (const width of [1440, 768, 390]) {
    await a.viewport(width);
    await a.go(path);
    await shoot(`${name}-${String(width)}`);
  }
}

const errors = [...new Set([...page.errors, ...tab2.errors])];
check('no console errors', errors.length === 0);
check('no horizontal overflow on any screen', overflowed.length === 0);
errors.slice(0, 10).forEach((error) => console.log(`  ${error.slice(0, 300)}`));
writeFileSync(
  join(outDir, 'checks.txt'),
  `${results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`).join('\n')}\n`,
);
page.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
