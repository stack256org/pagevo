"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

type CheckedState = boolean | "indeterminate"

/**
 * Native `<input type="checkbox">` carrying daisy's own `checkbox` class.
 *
 * daisy draws the box AND the checkmark (a clip-path `::before`) and keys both
 * off the input's real `:checked` / `:indeterminate` pseudo-classes, so the
 * wrapper `<span>`, the `CheckIcon` child and the React-state-driven visual
 * classes this component used to need are all gone. `indeterminate` still has
 * no HTML attribute — settable only as a DOM property, hence the ref effect.
 *
 * `data-slot` and `peer` sit on the input itself now (they were on the removed
 * wrapper): label.tsx's `peer-data-[slot=checkbox]:` selectors depend on
 * exactly those two, and sibling order is unchanged. Side effect: its
 * `peer-disabled:` rules were dead before — a `<span>` can never match
 * `:disabled` — and now actually apply.
 */
function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "checked" | "defaultChecked" | "onChange"> & {
  checked?: CheckedState
  defaultChecked?: CheckedState
  onCheckedChange?: (checked: boolean) => void
}) {
  const ref = React.useRef<HTMLInputElement>(null)
  // Uncontrolled usage (defaultChecked only) still needs tracking so a click
  // clears an initial `indeterminate` — the DOM property doesn't reset itself.
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState<CheckedState>(
    defaultChecked ?? false
  )
  const current = checked ?? uncontrolledChecked
  const isIndeterminate = current === "indeterminate"
  const isChecked = current === true

  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = isIndeterminate
  }, [isIndeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      data-slot="checkbox"
      disabled={disabled}
      checked={isChecked || isIndeterminate}
      onChange={(event) => {
        setUncontrolledChecked(event.target.checked)
        onCheckedChange?.(event.target.checked)
      }}
      className={cn(
        "peer checkbox checkbox-primary",
        // daisy's own box is 24px (--size-selector * 6) and its
        // --radius-selector is 8px — neither matches this app: the box is
        // 18px and square, and 8px is off the documented 5-step radius scale.
        "[--size:1.125rem] rounded-none",
        // `checkbox-primary` points --input-color at primary, which daisy uses
        // for the border in EVERY state — that would tint unchecked boxes blue.
        // Scoped back to base-300 while unchecked only, leaving daisy to own
        // the checked/indeterminate fill and border.
        "not-checked:not-indeterminate:border-base-300",
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

export { Checkbox }
