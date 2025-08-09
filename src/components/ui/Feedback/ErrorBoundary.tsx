import { AlertTriangle, RefreshCw } from 'lucide-react';
import type { ErrorInfo, ReactNode } from 'react';
import { Component } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * Error boundary component that catches JavaScript errors and displays fallback UI
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="p-6 rounded-lg border text-center"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <AlertTriangle className="mx-auto mb-4 text-red-500" size={48} />

          <h2
            className="text-xl font-bold mb-2"
            style={{ fontFamily: 'Cinzel, serif' }}
          >
            Something went wrong
          </h2>

          <p className="mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
            {process.env.NODE_ENV === 'development'
              ? this.state.error?.message
              : 'An unexpected error occurred. Please try refreshing the page.'}
          </p>

          <button
            onClick={this.handleRetry}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw size={16} />
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Simple error display component for non-boundary errors
 */
export interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorDisplay({
  title = 'Error',
  message,
  onRetry,
  className,
}: ErrorDisplayProps) {
  return (
    <div
      className={`p-4 rounded-lg border text-center ${className}`}
      style={{
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderColor: 'rgba(239, 68, 68, 0.3)',
        color: '#ef4444',
      }}
    >
      <AlertTriangle className="mx-auto mb-2" size={24} />

      <h3 className="font-semibold mb-1">{title}</h3>

      <p className="text-sm mb-3">{message}</p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors"
        >
          Try Again
        </button>
      )}
    </div>
  );
}
