import * as React from 'react';
import { cn } from '@/utils/cn';

/** Keyboard shortcut chip. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn(
        'inline-flex min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-[inset_0_-1px_0_var(--border)]',
        className,
      )}
      {...props}
    />
  );
}
