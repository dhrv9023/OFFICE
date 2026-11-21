// @vitest-environment jsdom
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';
import { Input, Select } from './Field';
import { ProgressBar } from './ProgressBar';
import { StatusIndicator } from './StatusIndicator';
import { Tabs } from './Tabs';
import { Toaster } from './toast/Toaster';
import { toast, useToastStore } from './toast/toastStore';
import { Tooltip } from './Tooltip';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setOpen(true);
        }}
      >
        Open
      </Button>
      <Dialog
        open={open}
        onClose={() => {
          setOpen(false);
        }}
        title="Edit details"
        description="Change the name."
        footer={<Button>Save</Button>}
      >
        <Input label="Name" />
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('is a labelled modal that traps focus, closes on Escape and restores focus', () => {
    render(<DialogHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Edit details' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleDescription('Change the name.');
    const close = within(dialog).getByRole('button', { name: 'Close' });
    expect(close).toHaveFocus();

    // Shift+Tab from the first control wraps to the last one.
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(within(dialog).getByRole('button', { name: 'Save' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe('ConfirmDialog', () => {
  it('focuses Cancel first and cannot be dismissed while busy', () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <ConfirmDialog
        open
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    const dialog = screen.getByRole('alertdialog', { name: 'Delete?' });
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    rerender(
      <ConfirmDialog
        open
        busy
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });
});

describe('Tabs', () => {
  it('follows the tabs pattern', () => {
    function Harness() {
      const [value, setValue] = useState<'a' | 'b'>('a');
      return (
        <Tabs
          label="Sections"
          value={value}
          onChange={setValue}
          tabs={[
            { id: 'a', label: 'First', content: <p>First panel</p> },
            { id: 'b', label: 'Second', content: <p>Second panel</p> },
          ]}
        />
      );
    }
    render(<Harness />);
    const first = screen.getByRole('tab', { name: 'First' });
    expect(first).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('tabpanel', { name: 'First' })).toHaveTextContent('First panel');

    fireEvent.keyDown(first, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
    expect(screen.getByRole('tabpanel', { name: 'Second' })).toHaveTextContent('Second panel');
  });
});

describe('form fields', () => {
  it('labels controls and links hints and errors', () => {
    render(
      <>
        <Input label="Project name" hint="Up to 100 characters." error="A name is required." />
        <Select
          label="Priority"
          options={[
            { value: 'low', label: 'Low' },
            { value: 'high', label: 'High' },
          ]}
        />
      </>,
    );
    const input = screen.getByRole('textbox', { name: 'Project name' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Up to 100 characters. A name is required.');
    expect(screen.getByRole('combobox', { name: 'Priority' })).toHaveValue('low');
  });
});

describe('ProgressBar and StatusIndicator', () => {
  it('expose their values as text, not just colour', () => {
    render(
      <>
        <ProgressBar value={33.4} label="Website progress" valueText="1 of 3 tasks done" />
        <StatusIndicator tone="warning" label="Blocked" />
      </>,
    );
    const bar = screen.getByRole('progressbar', { name: 'Website progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '33');
    expect(bar).toHaveAttribute('aria-valuetext', '33%, 1 of 3 tasks done');
    expect(screen.getByText('Blocked')).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('appears on focus and describes its trigger', () => {
    render(
      <Tooltip content="Projects">
        <button type="button" aria-label="Projects">
          P
        </button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'Projects' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Projects');
    fireEvent.blur(screen.getByRole('button', { name: 'Projects' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Toaster', () => {
  it('announces toasts politely, errors assertively, and lets them be dismissed', () => {
    vi.useFakeTimers();
    try {
      render(<Toaster />);
      act(() => {
        toast.success('Saved', 'All good.');
        toast.error('Failed', 'Disk full.');
      });
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
      expect(screen.getByRole('alert')).toHaveTextContent('Failed');

      act(() => {
        vi.advanceTimersByTime(7000);
      });
      expect(screen.queryByText('Saved')).not.toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
      expect(useToastStore.getState().toasts).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});
