import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Minus,
  MousePointerClick,
  Plus,
  type LucideIcon,
} from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { createEventBus } from '@/bridge/eventBus';
import type { GameEvents, InteractionTarget } from '@/bridge/gameEvents';
import type { OfficeViewModel } from '@/bridge/officeViewModel';
import { Button, IconButton } from '@/components/Button';
import { cn } from '@/components/cn';
import { ErrorState } from '@/components/ErrorState';
import { Spinner } from '@/components/Spinner';
import type { RoomId } from '@/domain/ids';
import { OFFICE_LAYOUT } from '@/domain/seed';
import type { DirectionInput, GameHandle } from '@/game/createGame';
import { useResolvedTheme } from '@/hooks/useTheme';
import {
  loadOfficeIntroSeen,
  prefersReducedMotion,
  saveOfficeIntroSeen,
} from '@/services/preferences';

type CanvasStatus = { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

export interface OfficeCanvasCallbacks {
  onRoomChange?: (roomId: RoomId | null) => void;
  onFocusChange?: (target: InteractionTarget | null, label: string | null) => void;
  onActivate?: (target: InteractionTarget, label: string, source: 'keyboard' | 'pointer') => void;
}

interface OfficeCanvasProps extends OfficeCanvasCallbacks {
  /** State-derived view of the office; pushed to the running scene on change. */
  view: OfficeViewModel;
  /** Target to show as selected (e.g. `employee:emp_…`), or null. */
  selectedKey: string | null;
  /** Overlay shown in the top-left corner (e.g. the current room). */
  hud?: ReactNode;
}

/** The space around the office follows the app theme; the office art never changes. */
const BACKDROPS = { dark: 0x0e0e11, light: 0xe4e4e0 } as const;

/**
 * Hosts the Phaser office. Owns its lifecycle (lazy import, StrictMode-safe
 * create/destroy), focus (keys only drive the founder while this area has focus)
 * and the on-canvas controls. The game is created once per mount: view-model and
 * selection changes are pushed into the running scene, never by recreating it.
 */
export function OfficeCanvas({ view, selectedKey, hud, ...callbacks }: OfficeCanvasProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<GameHandle | null>(null);
  const viewRef = useRef(view);
  const selectedRef = useRef(selectedKey);
  const callbacksRef = useRef(callbacks);
  const [status, setStatus] = useState<CanvasStatus>({ kind: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [focused, setFocused] = useState(false);
  const [showIntro, setShowIntro] = useState(() => !loadOfficeIntroSeen());
  const [zoom, setZoom] = useState<number | null>(null);
  const instructionsId = useId();
  const theme = useResolvedTheme();
  const themeRef = useRef(theme);

  useEffect(() => {
    callbacksRef.current = callbacks;
  });

  useEffect(() => {
    const host = hostRef.current;
    const frame = frameRef.current;
    if (!host || !frame) return;

    let cancelled = false;
    const bus = createEventBus<GameEvents>();
    bus.on('scene.ready', () => {
      setStatus({ kind: 'ready' });
    });
    bus.on('scene.error', ({ message }) => {
      setStatus({ kind: 'error', message });
    });
    bus.on('camera.zoom', ({ zoom: next }) => {
      setZoom(next);
    });
    bus.on('player.moved', ({ roomId }) => callbacksRef.current.onRoomChange?.(roomId));
    bus.on('interaction.focus', ({ target, label }) =>
      callbacksRef.current.onFocusChange?.(target, label),
    );
    bus.on('interaction.activate', ({ target, label, source }) =>
      callbacksRef.current.onActivate?.(target, label, source),
    );

    import('@/game/createGame')
      .then(({ createGame }) => {
        if (cancelled) return;
        const handle = createGame({
          parent: host,
          keyboardTarget: frame,
          bus,
          layout: OFFICE_LAYOUT,
          reducedMotion: prefersReducedMotion(),
          backdrop: BACKDROPS[themeRef.current],
        });
        handle.setViewModel(viewRef.current);
        handleRef.current = handle;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'The office failed to load.';
        setStatus({ kind: 'error', message });
      });

    return () => {
      cancelled = true;
      bus.clear();
      handleRef.current?.destroy();
      handleRef.current = null;
    };
  }, [attempt]);

  useEffect(() => {
    viewRef.current = view;
    handleRef.current?.setViewModel(view);
  }, [view]);

  useEffect(() => {
    themeRef.current = theme;
    handleRef.current?.setBackdrop(BACKDROPS[theme]);
  }, [theme, status]);

  useEffect(() => {
    selectedRef.current = selectedKey;
    handleRef.current?.select(selectedKey);
  }, [selectedKey, status]);

  const startPlaying = () => {
    saveOfficeIntroSeen();
    setShowIntro(false);
    frameRef.current?.focus();
  };

  return (
    <div
      ref={frameRef}
      role="application"
      tabIndex={0}
      aria-label="Virtual office"
      aria-describedby={instructionsId}
      onFocus={() => {
        setFocused(true);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
      onPointerDown={(event) => {
        // Clicking the office gives it the keyboard (but not when using its buttons).
        if (!(event.target instanceof HTMLElement && event.target.closest('button'))) {
          frameRef.current?.focus({ preventScroll: true });
        }
      }}
      className="relative h-full w-full overflow-hidden bg-office-backdrop outline-none focus-visible:ring-2 focus-visible:ring-focus/70 focus-visible:ring-inset"
    >
      <div ref={hostRef} className="absolute inset-0" aria-hidden="true" />

      <p id={instructionsId} className="sr-only">
        Walk with the arrow keys or W, A, S and D. Press E, Enter or Space to interact with the
        person or object you are next to. Plus and minus zoom. Everything here can also be done from
        the Employees, Projects and Tasks pages.
      </p>

      {status.kind === 'loading' ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <Spinner label="Loading the office…" />
        </div>
      ) : null}

      {status.kind === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-canvas">
          <ErrorState
            title="The office couldn't be displayed"
            description={status.message}
            onRetry={() => {
              setStatus({ kind: 'loading' });
              setAttempt((n) => n + 1);
            }}
          />
        </div>
      ) : null}

      {status.kind === 'ready' ? (
        <>
          {hud ? (
            <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100%-8rem)]">
              {hud}
            </div>
          ) : null}

          <div
            role="group"
            aria-label="Zoom"
            className="absolute top-3 right-3 flex items-center rounded-lg border border-line bg-surface/90 p-0.5 shadow-card backdrop-blur"
          >
            <IconButton
              icon={Minus}
              label="Zoom out"
              disabled={zoom !== null && zoom <= 1}
              className="size-7"
              onClick={() => handleRef.current?.zoomBy(-1)}
            />
            <span
              className="w-8 text-center text-xs font-medium text-muted tabular-nums"
              aria-live="polite"
            >
              {zoom ?? '–'}×
            </span>
            <IconButton
              icon={Plus}
              label="Zoom in"
              disabled={zoom !== null && zoom >= 3}
              className="size-7"
              onClick={() => handleRef.current?.zoomBy(1)}
            />
          </div>

          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center">
            <p
              aria-hidden="true"
              className={cn(
                'flex items-center gap-2 rounded-lg border border-line bg-surface/90 px-3 py-1.5 text-xs text-muted shadow-card backdrop-blur transition-opacity duration-300',
              )}
            >
              {focused ? (
                <>
                  <span className="pointer-coarse:hidden">
                    <Kbd>WASD</Kbd> or <Kbd>↑↓←→</Kbd> to walk · <Kbd>E</Kbd> to interact
                  </span>
                  <span className="hidden pointer-coarse:inline">
                    Use the pad to walk · tap people to see details
                  </span>
                </>
              ) : (
                <>
                  <MousePointerClick className="size-3.5 shrink-0 text-accent-strong" />
                  <span className="pointer-coarse:hidden">Click the office to start walking</span>
                  <span className="hidden pointer-coarse:inline">Use the pad to walk</span>
                </>
              )}
            </p>
          </div>

          <DirectionPad
            onChange={(input) => {
              handleRef.current?.setVirtualDirection(input);
            }}
          />

          {showIntro ? (
            <div className="absolute inset-0 flex items-center justify-center bg-overlay p-4">
              <div
                role="dialog"
                aria-labelledby={`${instructionsId}-intro`}
                className="w-full max-w-sm animate-pop-in rounded-2xl border border-line bg-surface p-6 text-content shadow-overlay"
              >
                <h2 id={`${instructionsId}-intro`} className="text-lg font-semibold">
                  Welcome to your office
                </h2>
                <p className="mt-1.5 text-sm text-muted">
                  You are the founder in the amber jacket. Walk around, visit each department and
                  see your team at work.
                </p>
                <dl className="mt-5 flex flex-col gap-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Walk</dt>
                    <dd>
                      <Kbd>WASD</Kbd> or <Kbd>↑↓←→</Kbd>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Interact with what is next to you</dt>
                    <dd>
                      <Kbd>E</Kbd>
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <dt className="text-muted">Zoom</dt>
                    <dd>
                      <Kbd>+</Kbd> <Kbd>−</Kbd>
                    </dd>
                  </div>
                </dl>
                <p className="mt-4 text-xs text-subtle">
                  Keys only work while the office has focus, so typing anywhere else never moves
                  you.
                </p>
                <Button
                  variant="primary"
                  className="mt-5 w-full"
                  data-autofocus
                  onClick={startPlaying}
                >
                  Start exploring
                </Button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A key cap, shared by the hint bar, the intro and the inspector. */
export function Kbd({ children }: { children: string | string[] }) {
  return (
    <kbd className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-sm border border-line-strong bg-surface-raised px-1 font-sans text-xs font-medium text-content">
      {children}
    </kbd>
  );
}

const PAD: readonly { key: keyof DirectionInput; label: string; icon: LucideIcon; area: string }[] =
  [
    { key: 'up', label: 'Walk up', icon: ChevronUp, area: 'col-start-2 row-start-1' },
    { key: 'left', label: 'Walk left', icon: ChevronLeft, area: 'col-start-1 row-start-2' },
    { key: 'right', label: 'Walk right', icon: ChevronRight, area: 'col-start-3 row-start-2' },
    { key: 'down', label: 'Walk down', icon: ChevronDown, area: 'col-start-2 row-start-3' },
  ];

/** On-screen direction pad for touch screens (hidden where a fine pointer exists). */
function DirectionPad({ onChange }: { onChange: (input: DirectionInput | null) => void }) {
  const held = useRef<DirectionInput>({ up: false, down: false, left: false, right: false });
  const update = (key: keyof DirectionInput, on: boolean) => {
    held.current = { ...held.current, [key]: on };
    const any = Object.values(held.current).some(Boolean);
    onChange(any ? held.current : null);
  };
  const press = (key: keyof DirectionInput) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    update(key, true);
  };
  const release = (key: keyof DirectionInput) => () => {
    update(key, false);
  };

  return (
    <div className="absolute bottom-14 left-3 hidden grid-cols-3 grid-rows-3 gap-1 pointer-coarse:grid">
      {PAD.map(({ key, label, icon: Icon, area }) => (
        <button
          key={key}
          type="button"
          aria-label={label}
          onPointerDown={press(key)}
          onPointerUp={release(key)}
          onPointerCancel={release(key)}
          onLostPointerCapture={release(key)}
          className={cn(
            'flex size-11 touch-none items-center justify-center rounded-lg border border-line bg-surface/90 text-content shadow-card backdrop-blur select-none active:bg-accent active:text-accent-contrast',
            area,
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
