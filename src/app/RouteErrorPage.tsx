import { isRouteErrorResponse, useRouteError } from 'react-router';
import { ErrorState } from '@/components/ErrorState';

/** Shown by the router when a route throws while rendering or loading. */
export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <div className="flex h-full items-center justify-center">
      <ErrorState
        title="This page hit a problem"
        description={detail}
        onRetry={() => {
          window.location.reload();
        }}
        retryLabel="Reload"
      />
    </div>
  );
}
