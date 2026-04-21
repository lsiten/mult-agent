import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

interface AlertDialogContextValue {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const AlertDialogContext = React.createContext<AlertDialogContextValue | undefined>(undefined);

function useAlertDialog() {
  const context = React.useContext(AlertDialogContext);
  if (!context) {
    throw new Error("useAlertDialog must be used within AlertDialog");
  }
  return context;
}

interface AlertDialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}

export function AlertDialog({ open = false, onOpenChange, children }: AlertDialogProps) {
  return (
    <AlertDialogContext.Provider value={{ open, onOpenChange: onOpenChange || (() => {}) }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

interface AlertDialogTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
}

export function AlertDialogTrigger({ children, asChild, ...props }: AlertDialogTriggerProps) {
  const { onOpenChange } = useAlertDialog();

  if (asChild && React.isValidElement(children)) {
    const childProps = children.props as any;
    return React.cloneElement(children, {
      onClick: (e: React.MouseEvent) => {
        onOpenChange(true);
        childProps.onClick?.(e);
      },
    } as any);
  }

  return (
    <button {...props} onClick={() => onOpenChange(true)}>
      {children}
    </button>
  );
}

export function AlertDialogContent({ children, className }: { children: React.ReactNode; className?: string }) {
  const { open, onOpenChange } = useAlertDialog();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-background/80 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Dialog */}
      <div className={cn(
        "relative z-50 w-full max-w-lg bg-card border border-border rounded-lg shadow-lg p-6 space-y-4",
        className
      )}>
        {children}
      </div>
    </div>
  );
}

export function AlertDialogHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {children}
    </div>
  );
}

export function AlertDialogTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-lg font-semibold", className)}>
      {children}
    </h2>
  );
}

export function AlertDialogDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-sm text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function AlertDialogFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex gap-2 justify-end", className)}>
      {children}
    </div>
  );
}

export function AlertDialogCancel({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const { onOpenChange } = useAlertDialog();

  return (
    <Button
      variant="outline"
      onClick={() => {
        onClick?.();
        onOpenChange(false);
      }}
      className={className}
    >
      {children}
    </Button>
  );
}

export function AlertDialogAction({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  const { onOpenChange } = useAlertDialog();

  return (
    <Button
      onClick={() => {
        onClick?.();
        onOpenChange(false);
      }}
      className={className}
    >
      {children}
    </Button>
  );
}

// Simple Alert component for non-modal alerts
export function Alert({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-border bg-muted/50 p-4", className)}>
      {children}
    </div>
  );
}
