import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import type { TaskId } from '@/domain/ids';

const PARAM = 'task';

/**
 * The open task lives in the URL (`?task=…`), so task details can be opened from
 * any page, linked to, and closed with the browser's back button.
 */
export function useTaskLink() {
  const [params, setParams] = useSearchParams();
  const openTaskId = params.get(PARAM) as TaskId | null;

  const open = useCallback(
    (taskId: TaskId) => {
      setParams((current) => {
        const next = new URLSearchParams(current);
        next.set(PARAM, taskId);
        return next;
      });
    },
    [setParams],
  );

  const close = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete(PARAM);
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  return { openTaskId, open, close };
}
