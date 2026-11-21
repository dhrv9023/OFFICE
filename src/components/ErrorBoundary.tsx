import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState } from './ErrorState';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Heading shown when a descendant throws. */
  title?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render errors in its subtree. Wrap independent regions (the whole app,
 * the office canvas) so one failure doesn't take down the rest of the UI.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex h-full items-center justify-center">
        <ErrorState
          title={this.props.title ?? 'Something went wrong'}
          description={error.message}
          onRetry={this.reset}
        />
      </div>
    );
  }
}
