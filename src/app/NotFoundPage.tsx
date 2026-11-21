import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { Page } from '@/components/Page';
import { ROUTES } from './navigation';

export function NotFoundPage() {
  return (
    <Page title="Page not found" hideTitle>
      <EmptyState
        icon={Compass}
        title="This page doesn't exist"
        description="The address doesn't match anything in Project HQ."
        action={
          <Link
            to={ROUTES.dashboard}
            className="text-sm font-medium text-accent-strong hover:underline"
          >
            Back to the dashboard
          </Link>
        }
      />
    </Page>
  );
}
