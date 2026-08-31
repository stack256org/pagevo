"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Native `<input type="checkbox" role="switch">` carrying daisy's own `toggle`
 * class. daisy renders the track on the input and the knob as a `::before` in
 * its grid, keyed off the real `:checked` pseudo-class, so the wrapper `<span>`,
 * the thumb `<span>` and the React mirror of the checked state are all gone —
 * uncontrolled usage is now genuinely uncontrolled.
 *
 * This adopts daisy's appearance rather than reproducing the old one: checked
 * is a base-100 track with a primary knob (the inverse of the previous primary
 * track / light knob), unchecked is a bordered transparent track, and the width
 * is daisy's own computed value rather than the previous 33px/25px.
 *
 * `data-slot` and `peer` sit on the input itself now (they were on the removed
 * wrapper) — label.tsx's `peer-data-[slot=switch]:` selectors depend on exactly
 * those two, and sibling order is unchanged.
 */
function Switch({
  className,
  size = "default",
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "checked" | "defaultChecked" | "onChange" | "size"> & {
  size?: "sm" | "default"
  checked?: boolean
  defaultChecked?: boolean
  onCheckedChange?: (checked: boolean) => void
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      data-slot="switch"
      disabled={disabled}
      checked={checked}
      defaultChecked={checked === undefined ? defaultChecked : undefined}
      onChange={(event) => onCheckedChange?.(event.target.checked)}
      className={cn(
        "peer toggle toggle-primary",
        // daisy derives both track and knob geometry from --size; its own
        // default is 24px. These keep the two existing heights (18px / 14px).
        size === "default" ? "[--size:1.125rem]" : "[--size:0.875rem]",
        // daisy computes a rounded-rect from --radius-selector, which is
        // neither a pill nor on the documented 5-step radius scale.
        "rounded-full",
        // daisy ships `outline: 2px solid` on :focus-visible; the design
        // checklist mandates the ring system instead.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        "aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/20 dark:aria-invalid:border-error/50 dark:aria-invalid:ring-error/40",
        className
      )}
      {...props}
    />
  )
}

export { Switch }
