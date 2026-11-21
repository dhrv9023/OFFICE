import { CheckCircle2, ShieldCheck, XCircle } from 'lucide-react';
import { useId, useMemo, useState, type SyntheticEvent } from 'react';
import { useSearchParams } from 'react-router';
import { commands } from '@/commands';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Dialog } from '@/components/Dialog';
import { EmptyState } from '@/components/EmptyState';
import { Textarea } from '@/components/Field';
import { Page } from '@/components/Page';
import { Tabs } from '@/components/Tabs';
import { RelativeTime } from '@/components/time';
import { toast } from '@/components/toast/toastStore';
import type { DomainError } from '@/domain/errors';
import { USER_ACTOR, type ApprovalRequest, type WorkspaceState } from '@/domain/types';
import { errorTitle } from '@/features/common/commandFeedback';
import { useWorkspace } from '@/stores/workspace';
import { describeInput } from './describeInput';
import { ExecutionLog } from './ExecutionLog';
import { APPROVAL_STATUS } from './statusLabels';

type Tab = 'requests' | 'log';

/**
 * The founder's control room for AI employees: requests that need a decision,
 * past decisions, and the execution log of everything employees asked to do.
 */
export function ApprovalsPage() {
  const workspace = useWorkspace((state) => state);
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'log' ? 'log' : 'requests';
  const pending = workspace.approvals.filter((approval) => approval.status === 'pending');
  const decided = [...workspace.approvals]
    .filter((approval) => approval.status !== 'pending')
    .sort((a, b) => (b.decidedAt ?? b.createdAt).localeCompare(a.decidedAt ?? a.createdAt));

  return (
    <Page
      title="Approvals"
      description="What AI employees asked to do. Actions that need you wait here until you decide; everything else they request is recorded in the execution log."
    >
      <div className="max-w-4xl">
        <Tabs
          label="Approvals"
          value={tab}
          onChange={(id) => {
            setParams(id === 'requests' ? {} : { tab: id }, { replace: true });
          }}
          tabs={[
            {
              id: 'requests',
              label: `Requests · ${String(pending.length)} waiting`,
              content:
                tab === 'requests' ? (
                  <Requests pending={pending} decided={decided} workspace={workspace} />
                ) : null,
            },
            {
              id: 'log',
              label: `Execution log · ${String(workspace.executions.length)}`,
              content: tab === 'log' ? <ExecutionLog workspace={workspace} /> : null,
            },
          ]}
        />
      </div>
    </Page>
  );
}

function Requests({
  pending,
  decided,
  workspace,
}: {
  pending: readonly ApprovalRequest[];
  decided: readonly ApprovalRequest[];
  workspace: WorkspaceState;
}) {
  const [deciding, setDeciding] = useState<{
    approval: ApprovalRequest;
    verdict: 'approve' | 'reject';
  } | null>(null);
  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="pending-heading">
        <h2 id="pending-heading" className="mb-3 text-base font-semibold">
          Waiting for you <span className="font-normal text-muted">· {pending.length}</span>
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            compact
            icon={ShieldCheck}
            title="Nothing to decide"
            description="No AI employee is connected yet. When they are, actions that need your approval wait here and nothing happens until you decide."
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((approval) => (
              <li key={approval.id}>
                <RequestCard
                  approval={approval}
                  workspace={workspace}
                  onDecide={(verdict) => {
                    setDeciding({ approval, verdict });
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="decided-heading">
        <h2 id="decided-heading" className="mb-3 text-base font-semibold">
          Decided <span className="font-normal text-muted">· {decided.length}</span>
        </h2>
        {decided.length === 0 ? (
          <p className="text-sm text-muted">No decisions yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {decided.map((approval) => (
              <li key={approval.id}>
                <RequestCard approval={approval} workspace={workspace} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {deciding ? (
        <DecisionDialog
          key={deciding.approval.id + deciding.verdict}
          approval={deciding.approval}
          verdict={deciding.verdict}
          workspace={workspace}
          onClose={() => {
            setDeciding(null);
          }}
        />
      ) : null}
    </div>
  );
}

function RequestCard({
  approval,
  workspace,
  onDecide,
}: {
  approval: ApprovalRequest;
  workspace: WorkspaceState;
  onDecide?: (verdict: 'approve' | 'reject') => void;
}) {
  const requester = workspace.employees[approval.requesterId];
  const department = requester ? workspace.departments[requester.departmentId] : undefined;
  const status = APPROVAL_STATUS[approval.status];
  const lines = describeInput(approval.action.input, workspace);
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {requester ? (
          <Avatar avatarId={requester.avatarId} color={department?.color} size="md" />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="font-medium">{approval.summary}</p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-muted">
            Requested by {requester?.name ?? approval.requesterId} ·{' '}
            <RelativeTime iso={approval.createdAt} />
          </p>
        </div>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted">Their reason</dt>
          <dd className="mt-0.5">
            {approval.reason || <span className="text-muted">None given</span>}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Why it needs you</dt>
          <dd className="mt-0.5">{approval.policyReason}</dd>
        </div>
      </dl>
      {lines.length > 0 ? (
        <div className="mt-4 rounded-lg border border-line bg-surface-raised p-3">
          <p className="text-xs font-medium text-muted">Proposed change</p>
          <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
            {lines.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-muted">{line.label}</dt>
                <dd className="break-words">{line.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
      {approval.status !== 'pending' ? (
        <p className="mt-3 text-sm text-muted">
          {status.label}
          {approval.decidedAt ? (
            <>
              {' '}
              · <RelativeTime iso={approval.decidedAt} />
            </>
          ) : null}
          {approval.decisionNote ? <> · “{approval.decisionNote}”</> : null}
        </p>
      ) : onDecide ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            variant="primary"
            icon={CheckCircle2}
            onClick={() => {
              onDecide('approve');
            }}
          >
            Approve…
          </Button>
          <Button
            icon={XCircle}
            onClick={() => {
              onDecide('reject');
            }}
          >
            Reject…
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

function DecisionDialog({
  approval,
  verdict,
  workspace,
  onClose,
}: {
  approval: ApprovalRequest;
  verdict: 'approve' | 'reject';
  workspace: WorkspaceState;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<DomainError | null>(null);
  const formId = useId();
  const requester = workspace.employees[approval.requesterId]?.name ?? 'the employee';
  const lines = useMemo(
    () => describeInput(approval.action.input, workspace),
    [approval, workspace],
  );

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const run = verdict === 'approve' ? commands.approveRequest : commands.rejectRequest;
    const result = run(USER_ACTOR, { approvalId: approval.id, note });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const { approval: decided } = result.value;
    if (decided.status === 'stale') {
      toast.error('Not applied: the request is out of date', decided.decisionNote);
    } else if (decided.status === 'approved') {
      toast.success('Approved and applied', approval.summary);
    } else {
      toast.success('Request rejected', `${approval.summary}. Nothing was changed.`);
    }
    onClose();
  };

  return (
    <Dialog
      open
      onClose={onClose}
      role="alertdialog"
      title={verdict === 'approve' ? 'Approve this request?' : 'Reject this request?'}
      description={
        verdict === 'approve'
          ? `${approval.summary}. It runs now, as ${requester}, if nothing it depends on has changed since the request. Otherwise it is marked out of date and nothing is applied.`
          : `${approval.summary}. Nothing will change. ${requester} can ask again later.`
      }
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            type="submit"
            form={formId}
            variant={verdict === 'approve' ? 'primary' : 'danger'}
          >
            {verdict === 'approve' ? 'Approve and apply' : 'Reject'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="flex flex-col gap-3">
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-danger/35 bg-danger/10 px-3.5 py-2.5 text-sm"
          >
            <p className="font-medium text-danger">{errorTitle(error)}</p>
            <p className="mt-0.5 text-muted">{error.message}</p>
          </div>
        ) : null}
        {lines.length > 0 ? (
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg border border-line bg-surface-raised p-3 text-sm">
            {lines.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-muted">{line.label}</dt>
                <dd className="break-words">{line.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <Textarea
          label="Note"
          hint={`Optional. Kept with the decision${verdict === 'reject' ? ' so the employee knows why' : ''}.`}
          value={note}
          data-autofocus
          onChange={(event) => {
            setNote(event.target.value);
          }}
        />
      </form>
    </Dialog>
  );
}
