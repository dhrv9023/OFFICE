import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useApplyTheme } from '@/hooks/useTheme';
import { AppBoot } from './AppBoot';
import { appRoutes } from './routes';

export function App() {
  useApplyTheme();
  // Created once per mount (not at module scope) so tests can import routes freely.
  const [router] = useState(() => createBrowserRouter(appRoutes));

  return (
    <ErrorBoundary>
      <AppBoot>
        <RouterProvider router={router} />
      </AppBoot>
    </ErrorBoundary>
  );
}
