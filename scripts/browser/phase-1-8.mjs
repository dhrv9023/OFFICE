// Phase 1.8 browser verification against the Vite dev server and real IndexedDB.
// Usage: node scripts/browser/phase-1-8.mjs <origin> <cdpPort> <outDir>
// Use a fresh Chrome profile: the scenario seeds its own company. AI employees are
// controlled test actors acting through `gatewayFor` (no AI model is involved).

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
const shoot = async (name) => {
  const result = await a.shoot(name);
  if (result.overflow) overflowed.push(name);
  console.log(`  shot ${name}${result.overflow ? '  !! horizontal overflow' : ''}`);
};
const day = (offset) => {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
/** Runs code with the app's own modules: commands, the gateway, the store. */
const inApp = (body) =>
  page.evaluate(`(async () => {
    const { commands, gatewayFor } = await import('/src/commands/index.ts');
    const { USER_ACTOR: me } = await import('/src/domain/types/actor.ts');
    const { getWorkspace } = await import('/src/stores/workspace.ts');
    const ok = (r) => { if (!r.ok) throw new Error(r.error.message); return r.value; };
    ${body}
  })()`);
const idb = (store) =>
  page.evaluate(`new Promise((resolve) => {
    const open = indexedDB.open('project-hq');
    open.onsuccess = () => {
      const req = open.result.transaction('${store}').objectStore('${store}').getAll();
      req.onsuccess = () => { resolve(req.result); open.result.close(); };
    };
  })`);

await page.send('Page.navigate', { url: `${origin}/` });
await sleep(1500);
await a.viewport(1440);
await a.go('/');

// ── 1. A company, then a real schema-v3 record upgraded to v4 ───────────────
await inApp(`
  const site = ok(commands.createProject(me, { name: 'Website relaunch', priority: 'high' }));
  ok(commands.updateProject(me, { projectId: site.id, patch: { status: 'active' } }));
  const t = (departmentId, title, assigneeId) => ok(commands.createTask(me, { projectId: site.id, departmentId, title, assigneeId }));
  t('dept_design', 'Old moodboard', 'emp_sarah_chen');
  t('dept_design', 'Design homepage', 'emp_sarah_chen');
  t('dept_frontend', 'Build homepage', 'emp_ryan_miller');
  t('dept_frontend', 'Legacy footer', 'emp_ryan_miller');
  ok(commands.createProject(me, { name: 'Billing API v2' }));
`);
await sleep(1200);
await page.evaluate(`new Promise((resolve, reject) => {
  const open = indexedDB.open('project-hq');
  open.onsuccess = () => {
    const db = open.result;
    const tx = db.transaction('workspace', 'readwrite');
    const store = tx.objectStore('workspace');
    const get = store.get('current');
    get.onsuccess = () => {
      const record = get.result;
      record.schemaVersion = 3;
      delete record.workspace.accessProfiles;
      delete record.workspace.approvals;
      delete record.workspace.executions;
      store.put(record);
    };
    tx.oncomplete = () => { db.close(); resolve(true); };
    tx.onerror = () => reject(tx.error);
  };
})`);
await a.go('/');
const profiles = await a.workspace(`Object.values(w.accessProfiles).map(p => p.status)`);
check(
  'a saved v3 workspace upgrades to v4: every employee gets a disabled access profile',
  profiles.length === 5 && profiles.every((status) => status === 'disabled'),
);
check(
  'the upgrade keeps the v3 record as a backup',
  (await idb('backups')).some(
    (backup) => backup.reason === 'pre-migration' && backup.payload.schemaVersion === 3,
  ),
);

// ── 2. The founder edits access in the UI ───────────────────────────────────
await a.go('/employees');
await a.click(a.button('AI access for Ryan Miller'));
await sleep(400);
const accessDialog = a.dialog('Access for Ryan Miller');
await a.click(
  `[...${accessDialog}.querySelectorAll('label')].find(l => l.textContent.startsWith('Active')).querySelector('input')`,
);
await shoot('access-dialog-1440');
await a.click(a.button('Save access', accessDialog));
await sleep(500);
await a.click(a.button('AI access for Alex Morgan'));
await sleep(400);
const alexDialog = a.dialog('Access for Alex Morgan');
await a.click(
  `[...${alexDialog}.querySelectorAll('label')].find(l => l.textContent.startsWith('Active')).querySelector('input')`,
);
await a.click(
  `[...${alexDialog}.querySelectorAll('label')].find(l => l.textContent.startsWith('Delete tasks')).querySelector('input')`,
);
// New grants start at the narrowest scope; the founder widens this one deliberately.
await sleep(200);
await a.type(a.labelled(alexDialog, 'Scope for Delete tasks'), 'any');
await sleep(200);
await shoot('access-dialog-grant-1440');
await a.click(a.button('Save access', alexDialog));
await sleep(500);
const access = await a.workspace(
  `({ ryan: w.accessProfiles.emp_ryan_miller.status, alex: w.accessProfiles.emp_alex_morgan.status, alexDeletes: w.accessProfiles.emp_alex_morgan.grants.some(g => g.permission === 'task.delete' && g.scope === 'any') })`,
);
check(
  'the founder enabled two employees and granted one a delete permission through the UI',
  access.ryan === 'active' && access.alex === 'active' && access.alexDeletes,
);

// ── 3. Controlled test actors act through their gateways ────────────────────
const outcomes = await inApp(`
  const w = getWorkspace();
  const task = (title) => Object.values(w.tasks).find(t => t.title === title).id;
  const project = Object.values(w.projects).find(p => p.name === 'Website relaunch').id;
  const ryan = gatewayFor('emp_ryan_miller');
  const alex = gatewayFor('emp_alex_morgan');
  const status = (r) => r.ok ? r.value.execution.status : 'error:' + r.error.code;
  return {
    ownTask: status(ryan.request({ type: 'changeTaskStatus', input: { taskId: task('Build homepage'), status: 'in_progress' } }, { requestId: 'ryan-1' })),
    othersTask: status(ryan.request({ type: 'assignTask', input: { taskId: task('Design homepage'), assigneeId: 'emp_emma_wilson', allowCrossDepartment: true } }, { requestId: 'ryan-2' })),
    deleteNoGrant: status(ryan.request({ type: 'deleteTask', input: { taskId: task('Legacy footer') } }, { requestId: 'ryan-3' })),
    archive: status(ryan.request({ type: 'updateProject', input: { projectId: project, patch: { status: 'archived' } } }, { requestId: 'ryan-4' })),
    reset: status(ryan.request({ type: 'resetWorkspace', input: {} }, { requestId: 'ryan-5' })),
    duplicate: (() => { const r = ryan.request({ type: 'changeTaskStatus', input: { taskId: task('Build homepage'), status: 'in_progress' } }, { requestId: 'ryan-1' }); return r.ok && r.value.duplicate; })(),
    delete1: status(alex.request({ type: 'deleteTask', input: { taskId: task('Old moodboard') } }, { requestId: 'alex-1', reason: 'Superseded by the new brand.' })),
    delete2: status(alex.request({ type: 'deleteTask', input: { taskId: task('Legacy footer') } }, { requestId: 'alex-2', reason: 'Not needed after the redesign.' })),
    delete3: status(alex.request({ type: 'deleteTask', input: { taskId: task('Design homepage') } }, { requestId: 'alex-3', reason: 'Merging into the brand task.' })),
  };
`);
check('a limited employee may move its own task', outcomes.ownTask === 'succeeded');
check("assigning someone else's task is denied", outcomes.othersTask === 'denied');
check('deleting without a grant is denied', outcomes.deleteNoGrant === 'denied');
check('archiving a project is denied', outcomes.archive === 'denied');
check('resetting the workspace cannot even be requested', outcomes.reset === 'error:validation');
check(
  'repeating a request ID returns the first result and runs nothing again',
  outcomes.duplicate === true,
);
check(
  'deleting with a grant is routed to the founder for approval',
  [outcomes.delete1, outcomes.delete2, outcomes.delete3].every(
    (status) => status === 'awaiting_approval',
  ),
);
const bypass = await inApp(`
  const w = getWorkspace();
  const before = JSON.stringify(w.tasks);
  const task = Object.values(w.tasks).find(t => t.title === 'Legacy footer').id;
  const agent = (employeeId) => ({ kind: 'agent', employeeId });
  const results = [
    commands.deleteTask(agent('emp_ryan_miller'), { taskId: task }),
    commands.deleteTask(agent('emp_alex_morgan'), { taskId: task }),
    commands.updateAccessProfile(agent('emp_ryan_miller'), { employeeId: 'emp_ryan_miller', status: 'active', grants: [] }),
    commands.approveRequest(agent('emp_alex_morgan'), { approvalId: getWorkspace().approvals[0].id }),
  ].map(r => r.ok ? 'ok' : r.error.code);
  return { results, unchanged: JSON.stringify(getWorkspace().tasks) === before };
`);
check(
  'calling the commands directly as an agent is refused (permission, approval, self-approval) and changes nothing',
  bypass.results.join() ===
    'permission_denied,approval_required,permission_denied,permission_denied' && bypass.unchanged,
);

// ── 4. Approvals in the UI ──────────────────────────────────────────────────
for (const [theme, width] of [
  ['dark', 1440],
  ['dark', 1280],
  ['dark', 768],
  ['dark', 390],
  ['light', 1440],
]) {
  await a.viewport(width);
  await a.go('/approvals', theme);
  await shoot(`approvals-pending-${theme}-${String(width)}`);
}
await a.viewport(1440);
await a.go('/approvals');
check(
  'the sidebar shows 3 pending approvals',
  (
    await page.evaluate(
      `[...document.querySelectorAll('nav a')].find(l => l.textContent.includes('Approvals'))?.textContent`,
    )
  ).includes('3'),
);
const approveCard = (summary, verb) =>
  `[...document.querySelectorAll('button')].find(b => b.textContent.startsWith('${verb}') && b.closest('li')?.textContent.includes(${JSON.stringify(summary)}))`;
await a.click(approveCard('Delete task "Old moodboard"', 'Approve'));
await sleep(400);
await a.type(
  a.labelled(a.dialog('Approve this request?'), 'Note'),
  'Agreed, the new moodboard replaces it.',
);
await shoot('approval-confirm-1440');
await a.click(a.button('Approve and apply', a.dialog('Approve this request?')));
await sleep(600);
check(
  'approving applies the exact action, attributed to the employee',
  await a.workspace(
    `!Object.values(w.tasks).some(t => t.title === 'Old moodboard') && w.activity.some(e => e.eventType === 'task.deleted' && e.actorId === 'emp_alex_morgan')`,
  ),
);
await a.click(approveCard('Delete task "Legacy footer"', 'Reject'));
await sleep(400);
await a.type(a.labelled(a.dialog('Reject this request?'), 'Note'), 'Keep it for the old site.');
await a.click(a.button('Reject', a.dialog('Reject this request?')));
await sleep(600);
check(
  'a rejected request never runs',
  await a.workspace(`Object.values(w.tasks).some(t => t.title === 'Legacy footer')`),
);
// Change the target of the third request, then try to approve it.
await inApp(`
  const task = Object.values(getWorkspace().tasks).find(t => t.title === 'Design homepage').id;
  ok(commands.updateTask(me, { taskId: task, patch: { title: 'Design homepage v2' } }));
`);
await a.click(approveCard('Delete task "Design homepage"', 'Approve'));
await sleep(400);
await a.click(a.button('Approve and apply', a.dialog('Approve this request?')));
await sleep(700);
check(
  'approving a request whose target changed marks it out of date and applies nothing',
  (await a.workspace(`Object.values(w.tasks).some(t => t.title === 'Design homepage v2')`)) &&
    (await a.workspace(`w.approvals.find(a => a.summary.includes('Design homepage')).status`)) ===
      'stale',
);
await shoot('approvals-decided-1440');
check(
  'a decided request cannot be approved again',
  (await inApp(
    `return commands.approveRequest(me, { approvalId: getWorkspace().approvals[0].id }).error?.reason;`,
  )) === 'approval_closed',
);

// ── 5. Execution log ────────────────────────────────────────────────────────
await a.go('/approvals?tab=log');
await shoot('execution-log-1440');
await a.go('/approvals?tab=log&status=denied');
check(
  'the execution log filters to the 3 denied attempts',
  (await page.evaluate('document.body.innerText')).includes('3 of 7 match'),
);
await shoot('execution-log-denied-1440');
await a.viewport(390);
await a.go('/approvals?tab=log');
await shoot('execution-log-390');
await a.viewport(1440);

// ── 6. Meetings page and the office agree ───────────────────────────────────
await a.go('/meetings');
await a.click(a.button('Schedule meeting'));
await sleep(400);
const scheduleDialog = a.dialog('Schedule a meeting');
await a.type(a.labelled(scheduleDialog, 'Title'), 'Relaunch kick-off');
await a.type(a.labelled(scheduleDialog, 'Date'), day(1));
await a.type(a.labelled(scheduleDialog, 'Start time'), '10:00');
for (const name of ['Sarah Chen', 'Ryan Miller']) {
  await a.click(
    `[...${scheduleDialog}.querySelectorAll('label')].find(l => l.textContent.includes(${JSON.stringify(name)})).querySelector('input')`,
  );
}
await a.click(a.button('Schedule meeting', scheduleDialog));
await sleep(600);
await a.click(a.button('Edit'));
await sleep(400);
await a.type(a.labelled(a.dialog('Edit meeting'), 'Agenda'), 'Agree scope and owners.');
await a.click(a.button('Save changes', a.dialog('Edit meeting')));
await sleep(600);
check(
  'a meeting scheduled and edited on the Meetings page is stored once, with the edit',
  (
    await a.workspace(
      `Object.values(w.meetings).filter(m => m.title === 'Relaunch kick-off').map(m => m.agenda)`,
    )
  ).join() === 'Agree scope and owners.',
);
await shoot('meetings-upcoming-1440');
await a.click(a.button('Details'));
await sleep(400);
await shoot('meeting-details-1440');
await page.evaluate(
  `document.querySelector('[role=dialog] button[aria-label="Close"]')?.click() ?? document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`,
);
await sleep(300);
await a.go('/meetings');
await a.click(a.button('Start'));
await sleep(500);
await a.openOffice('dark', 1440);
await a.walkTo(13.5, 9.5);
await a.tap('KeyE');
await sleep(700);
check(
  'the office meeting room shows the meeting started on the Meetings page',
  (await a.inspector()).includes('Relaunch kick-off'),
);
await shoot('office-meeting-from-page-1440');
for (const [theme, width] of [
  ['dark', 768],
  ['dark', 390],
  ['light', 1440],
]) {
  await a.viewport(width);
  await a.go('/meetings', theme);
  await shoot(`meetings-${theme}-${String(width)}`);
}

// ── 7. Everything survives a reload; notifications lead to approvals ───────
await a.viewport(1440);
await a.go('/');
const persisted = await a.workspace(
  `({ approvals: w.approvals.length, executions: w.executions.length, ryan: w.accessProfiles.emp_ryan_miller.status })`,
);
check(
  'approvals, executions and access survive a reload',
  persisted.approvals === 3 && persisted.executions === 7 && persisted.ryan === 'active',
);
await a.click(a.button('Notifications'));
await sleep(400);
await a.click(
  `[...document.querySelectorAll('li button')].find(b => b.textContent.includes('Review request'))`,
);
await sleep(600);
check(
  'an approval notification opens the approvals page',
  (await page.evaluate('location.pathname')) === '/approvals',
);

// ── 8. Housekeeping checks ──────────────────────────────────────────────────
await a.go('/office');
await sleep(1200);
await a.go('/meetings');
await a.go('/office');
await sleep(1200);
check(
  'only one office canvas after navigating away and back',
  (await page.evaluate(`document.querySelectorAll('canvas').length`)) === 1,
);
const saveState = await page.evaluate(
  `(async () => { const { getAppStatus } = await import('/src/stores/appStatus.ts'); return getAppStatus().save.state; })()`,
);
check('no failed save at the end', saveState !== 'error');
check('no console errors', page.errors.length === 0);
check('no horizontal overflow on any screen', overflowed.length === 0);
[...new Set(page.errors)].slice(0, 10).forEach((error) => console.log(`  ${error.slice(0, 300)}`));
writeFileSync(
  join(outDir, 'checks.txt'),
  `${results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`).join('\n')}\n`,
);
page.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
