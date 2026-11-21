import type { ReactNode } from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` for destructive actions. */
  tone?: 'primary' | 'danger';
  /** While true the dialog cannot be dismissed and the confirm button shows progress. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}

/** Asks the user to confirm one action. Cancel is focused first, so Enter never destroys data. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      role="alertdialog"
      size="sm"
      title={title}
      description={description}
      dismissible={!busy}
      footer={
        <>
          <Button data-autofocus disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone} loading={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
