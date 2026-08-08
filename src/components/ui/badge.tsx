import * as React from 'react';
import { cn } from '@/utils/cn';

/** Small pill label. Pass `color` for an algorithm accent chip. */
export function Badge({
  className,
  color,
  style,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { color?: string }) {
  return (
    <span
      className={cn(
        'rp-badge inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
        className,
      )}
      style={
        color
          ? {
              color,
              borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
              background: `color-mix(in srgb, ${color} 12%, transparent)`,
              ...style,
            }
          : style
      }
      {...props}
    />
  );
}
