"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { buttonClasses } from "@/components/ui/button"

// Native `<button aria-pressed>` for behavior; daisyUI `btn` for appearance,
// reached through the shared `buttonClasses()` builder rather than a second
// hand-written class string — a toggle *is* a button that remembers its state.
// The variant/size names below are this component's own public API; they map
// onto Button's daisy-backed ones so both stay on one scale.
const toggleVariantMap = {
  default: "ghost",
  outline: "outline",
} as const

// Toggle's scale is one step taller than Button's at every step; mapping it
// through preserves the existing heights (2.5rem / 2.25rem / 2.75rem) instead
// of re-declaring `--size` a second time.
const toggleSizeMap = {
  default: "lg",
  sm: "default",
  lg: "xl",
} as const

type ToggleVariant = keyof typeof toggleVariantMap
type ToggleSize = keyof typeof toggleSizeMap

function toggleClasses({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ToggleVariant
  size?: ToggleSize
  className?: string
}) {
  return buttonClasses({
    variant: toggleVariantMap[variant],
    size: toggleSizeMap[size],
    className: cn(
      // The pressed treatment. Not daisy's `btn-active` — that derives its
      // background from `--btn-color`, which `btn-ghost` leaves unset, so it
      // resolves to the base-200 mix rather than a readable pressed state.
      "group/toggle aria-pressed:bg-base-200 aria-pressed:text-base-content [&_svg:not([class*='size-'])]:size-3.5",
      className
    ),
  })
}

/** Native `<button aria-pressed>` in place of Radix's Toggle. */
function Toggle({
  className,
  variant,
  size,
  pressed,
  defaultPressed,
  onPressedChange,
  onClick,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ToggleVariant
  size?: ToggleSize
  pressed?: boolean
  defaultPressed?: boolean
  onPressedChange?: (pressed: boolean) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultPressed ?? false)
  const isPressed = pressed ?? uncontrolled

  return (
    <button
      type="button"
      data-slot="toggle"
      aria-pressed={isPressed}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        setUncontrolled(!isPressed)
        onPressedChange?.(!isPressed)
      }}
      className={toggleClasses({ variant, size, className })}
      {...props}
    />
  )
}

export { Toggle, toggleClasses, type ToggleVariant, type ToggleSize }
