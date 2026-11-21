import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { workspaceLifecycle } from '@/commands';
import { appRoutes } from '@/app/routes';

/** Renders the full application shell at `path`, with the real stores. */
export function renderApp(path = '/') {
  const router = createMemoryRouter(appRoutes, { initialEntries: [path] });
  return { router, ...render(<RouterProvider router={router} />) };
}

/**
 * Loads the real workspace (on fake-indexeddb) and resets it to the seed, so each
 * test starts from the same company. Call from `beforeEach`.
 */
export async function freshWorkspace(): Promise<void> {
  await workspaceLifecycle.initialize();
  const reset = await workspaceLifecycle.resetWorkspace();
  if (!reset.ok) throw new Error(reset.error.message);
  await workspaceLifecycle.flush();
}
