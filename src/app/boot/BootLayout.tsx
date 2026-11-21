import type { ReactNode } from 'react';
import { BrandMark } from '../shell/Brand';

/** Full-screen frame for the states shown before the application shell exists. */
export function BootLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/3 left-1/2 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft blur-3xl"
      />
      <main className="relative w-full max-w-lg">
        <div className="mb-7 flex items-center justify-center gap-3">
          <BrandMark className="size-10 rounded-xl ring-1 ring-line" />
          <div className="leading-tight">
            <p className="text-base font-semibold tracking-tight">Project HQ</p>
            <p className="text-xs text-subtle">AI workforce</p>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
