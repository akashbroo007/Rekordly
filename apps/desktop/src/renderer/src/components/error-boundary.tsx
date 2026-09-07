import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@rekordly/ui';
import { logger } from '../lib/logger';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('renderer error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  override render() {
    if (this.state.error !== null) {
      return (
        <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-6 text-center">
          <h1 className="text-lg font-semibold text-foreground">Something went wrong</h1>
          <p className="max-w-md text-sm text-foreground-muted">{this.state.error.message}</p>
          <Button onClick={() => this.setState({ error: null })}>Try again</Button>
        </div>
      );
    }
    return this.props.children;
  }
}
