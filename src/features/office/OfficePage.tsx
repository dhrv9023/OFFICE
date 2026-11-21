import { useCallback, useMemo, useState } from 'react';
import { targetKey, type InteractionTarget } from '@/bridge/gameEvents';
import {
  buildOfficeViewModel,
  sameOfficeViewModel,
  type OfficeViewModel,
} from '@/bridge/officeViewModel';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import type { EmployeeId, RoomId } from '@/domain/ids';
import { OFFICE_LAYOUT } from '@/domain/seed';
import { useUiStore } from '@/stores/uiStore';
import { useWorkspace } from '@/stores/workspace';
import { OfficeCanvas } from './OfficeCanvas';
import { OfficeInspector } from './OfficeInspector';

/**
 * The virtual office: a full-bleed playable canvas beside a contextual
 * inspector. The scene only reports interactions; this page decides what they
 * mean (today: selection and the inspector).
 */
export function OfficePage() {
  const workspace = useWorkspace((state) => state);
  const selectedEmployeeId = useUiStore((state) => state.selectedEmployeeId);
  const [roomId, setRoomId] = useState<RoomId | null>(null);
  const [nearby, setNearby] = useState<{ target: InteractionTarget; label: string } | null>(null);
  const [active, setActive] = useState<InteractionTarget | null>(null);

  // Keep the same view-model object while nothing the office shows has changed,
  // so unrelated workspace updates never reach the scene.
  const next = useMemo(
    () => buildOfficeViewModel(workspace, OFFICE_LAYOUT, selectedEmployeeId),
    [workspace, selectedEmployeeId],
  );
  const [view, setView] = useState<OfficeViewModel>(next);
  if (view !== next && !sameOfficeViewModel(view, next)) setView(next);

  const room = OFFICE_LAYOUT.rooms.find((candidate) => candidate.id === roomId);
  const roomColor = room?.departmentId
    ? workspace.departments[room.departmentId]?.color
    : undefined;

  const open = useCallback((target: InteractionTarget) => {
    setActive(target);
    useUiStore.getState().selectEmployee(target.kind === 'employee' ? target.employeeId : null);
  }, []);

  const onFocusChange = useCallback((target: InteractionTarget | null, label: string | null) => {
    setNearby(target && label ? { target, label } : null);
  }, []);

  const back = () => {
    setActive(null);
    useUiStore.getState().selectEmployee(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <h1 className="sr-only">Virtual Office</h1>
      <section
        aria-label="Office floor"
        className="relative h-[62vh] min-h-[360px] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1"
      >
        <ErrorBoundary title="The office view crashed">
          <OfficeCanvas
            view={view}
            selectedKey={active ? targetKey(active) : null}
            onRoomChange={setRoomId}
            onFocusChange={onFocusChange}
            onActivate={open}
            hud={
              <p className="flex items-center gap-2 rounded-lg border border-line bg-surface/90 px-3 py-1.5 text-sm shadow-overlay backdrop-blur">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: roomColor ?? 'var(--color-accent)' }}
                />
                <span className="truncate font-medium" aria-live="polite">
                  {room?.name ?? 'Main floor'}
                </span>
              </p>
            }
          />
        </ErrorBoundary>
      </section>

      <OfficeInspector
        active={active}
        nearby={nearby}
        roomId={roomId}
        onSelectEmployee={(employeeId: EmployeeId) => {
          open({ kind: 'employee', employeeId });
        }}
        onBack={back}
        className="border-t border-line lg:w-[22rem] lg:shrink-0 lg:border-t-0 lg:border-l"
      />
    </div>
  );
}
