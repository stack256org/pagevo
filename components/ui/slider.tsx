"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Native `<input type="range">` for behavior, daisyUI `range` for appearance —
// daisy draws the track, the thumb and the progress fill itself (the fill is a
// clipped inset `box-shadow` on the thumb), which replaces the absolutely
// positioned track/fill overlay and the per-engine `::-webkit-slider-thumb` /
// `::-moz-range-thumb` rules this component used to carry.
//
// Only single-thumb is supported (native range has one thumb); no consumer
// needs multi-thumb yet.
function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  disabled,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> & {
  value?: number[]
  defaultValue?: number[]
  min?: number
  max?: number
  onValueChange?: (value: number[]) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue?.[0] ?? min)
  const current = value?.[0] ?? uncontrolled

  return (
    <input
      data-slot="slider"
      type="range"
      min={min}
      max={max}
      disabled={disabled}
      value={current}
      onChange={(event) => {
        const next = Number(event.target.value)
        setUncontrolled(next)
        onValueChange?.([next])
      }}
      className={cn(
        // `w-full` overrides daisy's own `clamp(3rem, 20rem, 100%)` so the
        // slider still fills its container, as every consumer expects.
        "range range-xs range-primary w-full disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        className
      )}
      {...props}
    />
  )
}

export { Slider }
