import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<Id extends string> {
  readonly id: Id;
  readonly label: string;
  readonly content: ReactNode;
}

interface TabsProps<Id extends string> {
  label: string;
  tabs: readonly TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
}

/** WAI-ARIA tabs with automatic activation: arrows, Home and End move between tabs. */
export function Tabs<Id extends string>({ label, tabs, value, onChange }: TabsProps<Id>) {
  const baseId = useId();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.id === value),
  );

  const select = (index: number) => {
    const count = tabs.length;
    const next = ((index % count) + count) % count;
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const moves: Record<string, number> = {
      ArrowRight: activeIndex + 1,
      ArrowLeft: activeIndex - 1,
      Home: 0,
      End: tabs.length - 1,
    };
    const target = moves[event.key];
    if (target === undefined) return;
    event.preventDefault();
    select(target);
  };

  const active = tabs[activeIndex];

  return (
    <div>
      <div
        role="tablist"
        aria-label={label}
        onKeyDown={onKeyDown}
        className="flex gap-6 overflow-x-auto border-b border-line"
      >
        {tabs.map((tab, index) => {
          const selected = index === activeIndex;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                refs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => {
                onChange(tab.id);
              }}
              className={cn(
                '-mb-px border-b-2 px-0.5 pt-1 pb-3 text-sm font-medium whitespace-nowrap transition-colors',
                selected
                  ? 'border-content text-content'
                  : 'border-transparent text-muted hover:text-content',
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          role="tabpanel"
          id={`${baseId}-panel-${active.id}`}
          aria-labelledby={`${baseId}-tab-${active.id}`}
          tabIndex={0}
          className="pt-8 focus-visible:outline-offset-4"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}
