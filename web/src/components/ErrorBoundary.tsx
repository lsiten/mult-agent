import React, { Component } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    // TODO: Send error to logging service
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-background p-6">
          <div className="max-w-md w-full space-y-6 text-center">
            <div className="flex justify-center">
              <div className="rounded-full bg-error/10 p-4">
                <AlertTriangle className="h-12 w-12 text-error" />
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">出错了</h2>
              <p className="text-muted-foreground">
                应用遇到了一个意外错误。请尝试刷新页面，如果问题持续存在，请联系支持。
              </p>
            </div>

            {this.state.error && (
              <details className="text-left">
                <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                  查看错误详情
                </summary>
                <div className="mt-4 p-4 bg-card border border-border rounded-lg">
                  <div className="space-y-2">
                    <div>
                      <div className="text-xs font-semibold text-error mb-1">错误消息:</div>
                      <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                        {this.state.error.message}
                      </pre>
                    </div>
                    {this.state.error.stack && (
                      <div>
                        <div className="text-xs font-semibold text-error mb-1">堆栈跟踪:</div>
                        <pre className="text-xs bg-background p-2 rounded overflow-x-auto max-h-64">
                          {this.state.error.stack}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </details>
            )}

            <div className="flex gap-3 justify-center">
              <Button
                onClick={this.handleReset}
                variant="outline"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                重试
              </Button>
              <Button
                onClick={() => window.location.reload()}
              >
                刷新页面
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
