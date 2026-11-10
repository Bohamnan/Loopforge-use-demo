import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Called when the user asks to reload; defaults to a full page reload. */
  onReload?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * Last-resort render error fallback. It shows a generic message only and never
 * outputs the error message, stack or component content, which may contain resume data (B-03).
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error): void {
    // Log the error class name only; the message may contain user content.
    console.error('ErrorBoundary caught a render error:', error.name);
  }

  private handleReload = (): void => {
    (this.props.onReload ?? (() => window.location.reload()))();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }
    return (
      <div role="alert" style={{ padding: 24 }}>
        <p>页面出现异常，请刷新后重试。</p>
        <button type="button" onClick={this.handleReload}>
          刷新页面
        </button>
      </div>
    );
  }
}
