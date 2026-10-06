"use client";

import { cn } from "@workspace/ui/lib/utils";
import { Slider as SliderPrimitive } from "radix-ui";
import type * as React from "react";

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  const thumbs = (props.value ?? props.defaultValue ?? [0]).length;
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center data-[disabled]:opacity-50",
        className
      )}
      data-slot="slider"
      {...props}
    >
      <SliderPrimitive.Track
        className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-muted"
        data-slot="slider-track"
      >
        <SliderPrimitive.Range
          className="absolute h-full bg-primary"
          data-slot="slider-range"
        />
      </SliderPrimitive.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderPrimitive.Thumb
          className="block size-4 shrink-0 rounded-full border border-primary bg-background shadow-sm outline-none transition-[color,box-shadow] hover:ring-4 hover:ring-ring/50 focus-visible:ring-4 focus-visible:ring-ring/50"
          data-slot="slider-thumb"
          // biome-ignore lint/suspicious/noArrayIndexKey: thumbs are positional
          key={index}
        />
      ))}
    </SliderPrimitive.Root>
  );
}

export { Slider };
