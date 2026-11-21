// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { AppState } from '@/stores/appStatus';
import { useUnsavedChangesGuard } from './useUnsavedChangesGuard';

const leave = () => {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};

let current: AppState;
const read = () => current;
const set = (save: AppState['save'], storage: 'persistent' | 'memory' = 'persistent') => {
  current = { phase: { status: 'ready', storage }, operation: null, save };
};

describe('leaving with unsaved changes (Phase 1.7)', () => {
  it('asks only while changes are not safely on disk', () => {
    const { unmount } = renderHook(() => {
      useUnsavedChangesGuard(read);
    });
    set({ state: 'saved', at: '2026-12-01T10:00:00.000Z' });
    expect(leave()).toBe(false);
    set({ state: 'saving' });
    expect(leave()).toBe(true);
    set({ state: 'error', kind: 'conflict', message: 'Changed elsewhere.' });
    expect(leave()).toBe(true);
    set({ state: 'idle' }, 'memory');
    expect(leave()).toBe(true);

    // No listener is left behind after unmount.
    unmount();
    set({ state: 'saving' });
    expect(leave()).toBe(false);
  });
});
