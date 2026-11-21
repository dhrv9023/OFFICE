# Phase 1.8 Report — AI Safety, Permissions and Execution Infrastructure

**Status:** complete. Typecheck, ESLint, Prettier, all **814 tests** (54 new) and the production build pass. **25 of 25** scripted browser checks pass against real IndexedDB, and **72 route screenshots** (9 routes × 4 widths × 2 themes) show no horizontal overflow and no console errors. **No AI model is called anywhere. Phase 2 has not been started.**

The founder stays in control. Every action is authorized at the command layer, whoever calls it:

- AI employees act only within grants the founder sets, through an identity-bound gateway.
- High-impact actions wait for the founder's approval, and stale approvals never apply.
- Every request is recorded in an execution log.

In normal use no AI is connected, so these screens are empty. The browser tests drive **controlled test actors**.

## 1. Initial architecture assessment

|                          | Finding                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Existed and reused**   | <ul><li>The `Actor` model (`user`, `agent(employeeId)`, `system`) and `actorId` on activity.</li><li>A single choke point: `bind()` in `createCommands`.</li><li>Pure handlers, which allow dry runs.</li><li>Versioned snapshots with migrations, backups and recovery.</li><li>Meeting rules and commands, used by both the office and the new page.</li></ul> |
| **Missing**              | <ul><li>Agent status.</li><li>Permissions and resource scopes: any agent that was an employee could run **every** command.</li><li>Approvals, an execution registry, idempotency and retries.</li><li>A meeting edit command.</li><li>Lifecycle import, export and reset take no actor.</li></ul>                                                                |
| **Changed**              | <ul><li>`bind()` authorizes every call.</li><li>An executor for agents; identity-bound gateways.</li><li>Schema v4.</li><li>New screens.</li></ul>                                                                                                                                                                                                               |
| **Risks named up front** | <ul><li>A local single-user app can't stop code in the page from acting as the founder.</li><li>IndexedDB is not tamper-proof.</li><li>Approval races (stale targets).</li><li>Migrating existing workspaces.</li></ul>                                                                                                                                          |
| **Not expanded**         | <ul><li>No "external integration" actor kind (nothing uses it yet).</li><li>No approval expiry.</li><li>No queues or workers.</li></ul>                                                                                                                                                                                                                          |

## 2. Actor identity

Everything here is implemented.

| Actor       | Identity                                        | What they can do                                                                                                                |
| ----------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Founder     | `user`                                          | Everything, never needs approval; the only approver and access manager                                                          |
| AI employee | `agent(employeeId)`: the **stable employee ID** | Only what an **active** access profile grants, through `gatewayFor(employeeId)`                                                 |
| System      | `system`                                        | **No business actions** (refused with `permission_denied`), so nothing an employee or the founder did is attributed to "system" |

- **Renaming** an employee changes neither identity nor permissions (tested).
- **Identity is set by the application:** a gateway is created for one employee and frozen. It can't act for another, retry another's requests or cancel another's approvals (tested).
- **Execution context:** authorization yields the target, the permissions used and any approval reason. Approved actions run through the approval handler only, and callers have no flag to claim approval.

## 3. Permission model

Permissions exist only for real command capabilities (`domain/types/access.ts`):

| Area                              | Permissions (allowed scopes)                                                                                     |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Projects                          | `project.create`, `project.edit`, `project.change_status`, `project.delete` (any)                                |
| Tasks                             | `task.create`, `task.edit`, `task.assign`, `task.change_status`, `task.delete` (own, department, any)            |
| People                            | `employee.rename` (any)                                                                                          |
| Meetings                          | `meeting.create`, `meeting.edit`, `meeting.start`, `meeting.complete`, `meeting.cancel` (own = participant, any) |
| **Founder only, never grantable** | `access.manage`, `approval.decide`, `notification.manage`                                                        |

Workspace import, export and reset are **not commands at all**. They are lifecycle functions used by the founder's Settings screen and are never handed to an agent. `task.read`-style read permissions were not added: there is no read API for agents yet, so they would protect nothing.

**Scope resolution** (`requirementsOf`): a task's assignee and department; for `createTask`, the requested assignee and department; for meetings, the participants. Own-scope assignment allows only taking unowned work or handing back one's own.

**Enforcement order** in `bind()`:

1. Identity.
2. Standing.
3. The resource exists.
4. A grant covers the resource.
5. The approval policy.
6. The handler's own domain validation, unchanged.

Every refusal is a structured `DomainError` (`invalid_actor`, `permission_denied` naming the permission, or `approval_required`), and **the state is not touched**.

## 4. Default permission profiles

Every profile starts **disabled**, including after migration, so nothing acts until the founder enables it.

| Role                                    | Default grants                                                                                                                                              |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project manager                         | Create projects (**ask me first**); edit projects; create, edit, assign and move tasks (any); schedule, edit, start, hold and cancel **their own** meetings |
| Specialists (design, frontend, backend) | Create tasks for themselves; edit, take and move **their own** tasks; start and hold their own meetings                                                     |
| QA                                      | As specialists, but may move tasks across **their department** (submitting work for review)                                                                 |

No default grant deletes, renames, archives, completes or touches access. The founder edits all of this in the **Access** dialog (Employees page, or "AI access · Manage" on an office profile).

## 5. Approval workflow

- **Policy** (fixed when an agent asks):
  - deleting a project or task;
  - renaming someone;
  - completing or archiving a project;
  - **taking work away from another employee**.

  On top of that, any grant marked **"ask me first"**.

- **Lifecycle:** `pending → approved | rejected | cancelled (withdrawn by the requester) | stale`.
- **Each request records:** id, execution id, requester, the frozen action (type and input), target (type, id, label, content version), summary, the requester's reason, the policy reason, creation time, decider, decision time and note.
- **Behaviour:** validate identity and permission, dry-run the handler, then create the request. **Nothing is applied.** The founder is notified ("Approval needed", linking to Approvals) and inspects the summary, the reasons and the proposed change, shown with names rather than IDs.
- **Integrity** (TD-73):
  - Approval re-checks the target's **content version**, the requester's authorization and the handler, then applies the action **as the requester**, in the same commit as the decision.
  - Any mismatch marks the request **stale** with the reason and applies nothing.
  - Decided requests are closed, so approving twice is refused.
  - Agents can't decide requests at all (`approval.decide` is founder-only), which rules out self-approval.

## 6. Execution registry

`Execution` records the requester, the frozen action, the target, a summary, the status (`succeeded`, `failed`, `denied`, `awaiting_approval`, `rejected`, `cancelled`), the approval link, `retryOf`, the request and completion times, a result line, and the error code and message. Execution is synchronous and local, so only the outcome is stored (TD-72).

- **Activity vs. executions:**
  - Activity says what happened in the company, attributed to the agent ("Task … was deleted", actor Alex).
  - Executions say how it was requested and decided.
  - Approval decisions add an `approval.*` activity entry; refused requests appear only in the execution log, because nothing happened in the company.
- **No secrets:** records hold action inputs as the app produced them; there are no credentials in the domain to store.
- **Scope:** the founder's own UI actions are recorded in activity, not executions (TD-72).

## 7. Idempotency and retries

- A request needs a `requestId` (1–100 characters). The same employee and key **never runs twice**: an identical repeat returns the first execution with `duplicate: true` and **no commit**. A different action under that key is refused with `idempotency_conflict`.
- **Retry** is explicit (`retry(executionId, newRequestId)`), works only for `failed` executions, and goes through identity, permission, validation and approval again. A succeeded action can't run twice, and denied, rejected or withdrawn requests need a new request.
- No queue was added: the app is local and synchronous, and every outcome is committed atomically with its record.

## 8. Meetings page

`/meetings` (Work → Meetings):

- **Tabs:** Upcoming (running first, then soonest), Held and Cancelled, with counts.
- **Filters:** search over title, agenda, notes, participants and project, plus a **date range**, all in the URL.
- **Cards:** time, project, participants and notes.
- **Details:** the full summary and the meeting's own history.
- **Actions:** Schedule, **Edit** (new `updateMeeting` command: same rules as scheduling, never clashes with itself, scheduled meetings only), Start, Mark as held (with notes), Cancel (confirmed).

Both screens use the same commands and dialogs as the office's meeting room. A meeting started on the page appears in the office's meeting room, and its participants are seated there (tested in the browser).

## 9. UI

| Screen                                                         | What it does                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Approvals** (Headquarters → Approvals, with a pending count) | Requests waiting for the founder, shown as cards: requester, summary, their reason, why it needs approval, the proposed change, Approve… and Reject… with an optional note. Below that, decided requests with status ("Approved", "Rejected", "Withdrawn", "Out of date") and notes. Empty states say plainly that no AI is connected. |
| **Execution log** (tab)                                        | Filters for employee, action, status, resource and date range; outcome badges; the reason for every refusal or failure; request IDs and retries; paging                                                                                                                                                                                |
| **Access** dialog                                              | Status (Disabled, Active, Suspended); permissions grouped by area with scope and "Ask me first"; fixed policy notes ("Always needs your approval"); reset to role defaults; founder-only powers listed as never grantable. New grants start at the narrowest scope.                                                                    |
| Office profile                                                 | "AI access: Disabled · Manage"                                                                                                                                                                                                                                                                                                         |
| Notifications                                                  | "Approval needed" items open Approvals                                                                                                                                                                                                                                                                                                 |

## 10. Persistence and migration

- **Schema v4** adds `accessProfiles`, `approvals` and `executions`. Migration 3 → 4 is deterministic: every employee gets a **disabled** profile with role defaults, and the histories start empty. The existing **pre-migration backup** runs first. A failed step leaves the original untouched and goes to recovery (tested).
- **Decoding and integrity:** permissions, scopes and statuses come from closed lists; there must be exactly one valid profile per employee, with no founder-only or out-of-scope grants; pending approvals must point at a living requester and execution; request keys must be unique. Invalid data goes to the existing recovery screen and is never replaced with the seed.
- **Tested on real data:** a v3 record written into IndexedDB in the browser upgrades with a backup. Unit tests restore real v1, v2 and v3 records.

## 11. Security analysis

| Threat                               | Mitigation                                                                                                                 | Remaining limit                                                                                                              |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Identity spoofing by an agent runner | Runners get a frozen `gatewayFor(employeeId)` only; identity is set by the app                                             | Any code **in the page** can still construct a founder actor. This is a local, single-user app with no authentication        |
| Permission escalation                | Founder-only permissions are never grantable (validation and integrity); only the founder edits access                     | —                                                                                                                            |
| Unauthorized or self-approval        | `approval.decide` is founder-only, so agents are refused                                                                   | —                                                                                                                            |
| Approval replay or double execution  | A decided request is closed; executions are keyed by request ID                                                            | —                                                                                                                            |
| Stale targets                        | Content-hash version compared at approval, plus re-authorization and a dry run                                             | —                                                                                                                            |
| Cross-employee access                | Scopes are checked against the resource; gateways refuse others' retries and cancellations                                 | —                                                                                                                            |
| Direct store mutation                | Writable stores are lint-restricted to `commands/`; the executor commits only through the same store port                  | Lint isn't a runtime boundary inside the page                                                                                |
| Bypassing the UI                     | Authorization is in `bind()`, so direct calls are refused (tested in unit and browser tests)                               | —                                                                                                                            |
| Import bypass                        | Imported profiles and grants are decoded and validated; imported pending approvals still pass every check at approval time | Importing a workspace with active agents is the founder's explicit choice                                                    |
| Workspace import, export and reset   | Not commands; never exposed to agents                                                                                      | No actor check inside the lifecycle (founder-only by construction)                                                           |
| Persistence failure                  | Unchanged: revision-checked saves, error banner, retry, backups, unload guard                                              | —                                                                                                                            |
| Audit integrity                      | Records are append-or-close, validated on load                                                                             | **Not tamper-proof:** anyone with access to the browser profile can edit IndexedDB. No signatures or hash chains are claimed |

**Not provided:** multi-user security, authentication, server-side enforcement, encryption at rest. These need a backend (Phase 5 in the roadmap).

## 12. Tests and browser results

| Check                   | Result                                                 |
| ----------------------- | ------------------------------------------------------ |
| Typecheck, lint, format | Pass                                                   |
| `npm test`              | **814 of 814, 61 files** (760 → 814)                   |
| Build                   | App 650 kB (191 kB gzip, +14 kB); game chunk unchanged |

**New tests:**

- **Authorization (13):** founder authority; every profile starts disabled; suspended; rename keeps identity; own-task allowed; out-of-scope, missing-grant and founder-only refusals with the **state unchanged**; founder-only grants rejected; permission changes take effect at once; **calling the command directly can't skip approval**; reassigning another's work needs approval but picking up unowned work doesn't; "ask me first".
- **Pipeline (16):** succeeded, denied and failed executions; malformed requests; pending approval with nothing applied and the founder notified; approve applies once, attributed to the agent; reject never runs; withdraw by the requester only; no self-approval; stale target; permission revoked before approval; idempotent repeat with no commit; key reuse refused; explicit retry (and not for others or for succeeded); retry can't skip approval; **the acceptance scenario** (below).
- **Others:** content versions (same-millisecond edits); default profiles valid; `updateMeeting` (4); v3 → v4 migration (4, including determinism and an untouched original on failure); approvals UI (6); access dialog (1); Meetings page and filters (5); all commands for an unknown agent are refused **before any resource is looked at**.
- **Changed:** the actor tests (system actors no longer create projects; agents must be enabled); schema-version expectations.
- **Recreated:** the "history limits" test, which I removed by accident while rewriting the neighbouring actor tests. It is rewritten from the same constants and marked in the file.

**The acceptance scenario.** A limited AI employee (Ryan, active, default grants), unit tested and repeated in the browser:

| Attempt                           | Result                                                                           |
| --------------------------------- | -------------------------------------------------------------------------------- |
| 1. Move its own task              | **Succeeded**                                                                    |
| 2. Assign another employee's task | **Denied** (outside scope)                                                       |
| 3. Delete a task                  | **Denied** (no grant). With a grant: **routed to approval**, not applied         |
| 4. Archive a project              | **Denied** (no grant)                                                            |
| 5. Reset the workspace            | **Can't be requested** (not an action; not on the gateway)                       |
| Direct command calls as the agent | **Refused** (`permission_denied`, `approval_required`), with **no state change** |

**Browser** (`scripts/browser/phase-1-8.mjs`, headless Chrome 157, real IndexedDB). All 25 checks pass ([`workflows/checks.txt`](screenshots/phase-1.8/workflows/checks.txt)):

- **Migration and access:** a real v3 record upgrades (with a backup); the founder enables employees and grants a permission through the Access dialog.
- **The scenario above:** including the duplicate request and the direct bypass attempts.
- **Approvals in the UI:** 3 pending in the sidebar; approve applies the action, attributed to the employee; reject never runs; a stale request is refused; a decided request can't be approved again.
- **Execution log:** filtered to the 3 denials.
- **Meetings:** scheduled and edited on the page; started there and shown in the office's meeting room.
- **Persistence and navigation:** everything survives a reload; a notification opens Approvals.
- **Housekeeping:** one canvas; no failed saves; no console errors; no overflow.

## 13. Known limitations

1. **Nothing uses the executor yet.** No AI is connected, so in normal use Approvals and the execution log are empty.
2. **Same-page code can act as the founder** (section 11). The guarantees hold for agent runners given only a gateway.
3. **The local audit can be edited** by anyone with access to the browser profile.
4. **The execution log keeps the latest 1000 records.** Approvals are not capped, and there is no approval expiry.
5. **The founder's UI actions are in activity, not the execution log** (TD-72).
6. **No read permissions:** agents have no read API yet.
7. **A test was recreated:** the history-limit test was rewritten after an accidental deletion (section 12).
8. **Bundle:** 191 kB gzip. Route splitting (TD-67) gets closer to its 250 kB threshold.

## 14. Remaining gaps before Phase 2

1. **An agent runner:** a Web Worker or local service that holds only a gateway, with cancellation and timeouts.
2. **Provider configuration** (`AgentConfig`): model, prompt, budget. Keys must live outside the workspace and never in exports.
3. **Read access** for agents: a scoped read API, with read permissions added then.
4. **Messages:** a `Message` model for Talk, written by commands.
5. **Usage:** cost and token tracking per execution.
6. **Approval expiry** and a founder setting to adjust the fixed policy.

## 15. Proposed AI integration architecture

```
founder UI ──commands (user)──────────────────────────────┐
                                                           ▼
agent runner (worker) ──gatewayFor(id)──▶ executor ──▶ bind(): identity → permission/scope → approval policy
   ▲   holds: gateway, AgentConfig,         │                     │ needs approval → ApprovalRequest
   │   provider client (keys outside)       │                     ▼ allowed
   │                                        │              handler (pure) → state → autosave
   └── reads: scoped read API (future) ◀────┴── Execution record (+ activity as the agent)
```

The model proposes; the runner turns proposals into `gateway.request(...)` calls with request IDs; the application decides. Phase 2 plugs a provider into that loop. The boundary is already built and tested.
