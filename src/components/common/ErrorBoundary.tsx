import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Runtime error in ${this.props.moduleName ?? 'application module'}`, error, errorInfo);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[320px] items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-base font-semibold">
            {this.props.moduleName ? `${this.props.moduleName} could not load` : 'Something went wrong'}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            This section hit an unexpected error. Your session is still active, and you can retry without leaving the app.
          </p>
          <Button className="mt-5" onClick={() => this.setState({ error: null })}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Try again
          </Button>
        </div>
      </div>
    );
  }
}
