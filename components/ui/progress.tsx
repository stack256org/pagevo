import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Deliberately NOT a native `<progress>` — its `::-webkit-progress-value`/`::-moz-progress-bar`
 * diverge across engines and can't match our 2px translated-fill bar. ARIA below replaces Radix's.
 */
function Progress({
  className,
  value,
  max = 100,
  ...props
}: Omit<React.ComponentProps<"div">, "value"> & {
  value?: number | null
  max?: number
}) {
  const isIndeterminate = value == null
  const clamped = isIndeterminate ? 0 : Math.min(Math.max(value, 0), max)
  const state = isIndeterminate
    ? "indeterminate"
    : clamped >= max
      ? "complete"
      : "loading"

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      // Omitted while indeterminate — that is what tells a screen reader the
      // value is unknown rather than zero.
      aria-valuenow={isIndeterminate ? undefined : clamped}
      data-state={state}
      data-value={isIndeterminate ? undefined : clamped}
      data-max={max}
      className={cn(
        "relative flex h-0.5 w-full items-center overflow-x-hidden rounded-none bg-base-200",
        className
      )}
      {...props}
    >
      <div
        data-slot="progress-indicator"
        data-state={state}
        data-value={isIndeterminate ? undefined : clamped}
        data-max={max}
        className="size-full flex-1 bg-primary transition-all"
        style={{ transform: `translateX(-${100 - (clamped / max) * 100}%)` }}
      />
    </div>
  )
}

export { Progress }
