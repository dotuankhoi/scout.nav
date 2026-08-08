import * as React from 'react';
import * as SliderPrimitive from '@radix-ui/react-slider';
import { cn } from '@/utils/cn';

export function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        'relative flex w-full touch-none select-none items-center py-1.5',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="rp-slider-track relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted">
        <SliderPrimitive.Range className="rp-slider-range absolute h-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="rp-slider-thumb block size-3.5 rounded-full border-2 border-primary bg-background shadow transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:scale-110" />
    </SliderPrimitive.Root>
  );
}
