"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Native `<input type="radio">` group: sharing one `name` gives arrow-key nav for free, no roving-tabindex JS needed.
 * `name` auto-generated via `useId` when omitted, since native grouping requires a shared `name`.
 *
 * Items carry daisy's `radio` class, which draws both the ring and the dot
 * (a `::before`) off the input's own `:checked` state — so the wrapper `<span>`
 * and the dot `<span>` are gone. `data-slot` and `peer` moved onto the input
 * with them: label.tsx's `peer-data-[slot=radio-group-item]:` selectors depend
 * on exactly those two, and sibling order is unchanged.
 */
type RadioGroupContextValue = {
  name: string
  value?: string
  onValueChange?: (value: string) => void
}

const RadioGroupContext = React.createContext<RadioGroupContextValue | null>(null)

function RadioGroup({
  className,
  name,
  value,
  defaultValue,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<"div">, "onChange"> & {
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const generatedName = React.useId()
  const [uncontrolledValue, setUncontrolledValue] = React.useState(defaultValue)
  const currentValue = value ?? uncontrolledValue

  return (
    <RadioGroupContext.Provider
      value={{
        name: name ?? generatedName,
        value: currentValue,
        onValueChange: (v) => {
          setUncontrolledValue(v)
          onValueChange?.(v)
        },
      }}
    >
      <div
        data-slot="radio-group"
        role="radiogroup"
        className={cn("grid w-full gap-3", className)}
        {...props}
      />
    </RadioGroupContext.Provider>
  )
}

function RadioGroupItem({
  className,
  value,
  disabled,
  ...props
}: Omit<React.ComponentProps<"input">, "type" | "value" | "onChange"> & {
  value: string
}) {
  const context = React.useContext(RadioGroupContext)
  if (!context) {
    throw new Error("RadioGroupItem must be rendered inside a RadioGroup")
  }
  const isChecked = context.value === value

  return (
    <input
      type="radio"
      data-slot="radio-group-item"
      name={context.name}
      value={value}
      checked={isChecked}
      disabled={disabled}
      onChange={() => context.onValueChange?.(value)}
      className={cn(
        // Plain `radio`, no colour modifier: daisy leaves --input-color unset,
        // so the ring and dot both resolve to currentColor — i.e. base-content,
        // exactly the colour this component drew by hand before. The dot size
        // falls out of daisy's own geometry: 18px box − 2×4px padding − 2×1px
        // border = the same 8px dot as the removed `size-2` span.
        "peer radio [--size:1.125rem]",
        // daisy's unchecked ring is color-mix(currentColor 20%), not a token.
        "not-checked:border-base-300",
        // daisy ships `outline: 2px solid` on :focus-visible; the design
        // checklist mandates the ring system instead.
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
        props["aria-invalid"] &&
          !isChecked &&
          "border-error ring-2 ring-error/20 dark:border-error/50 dark:ring-error/40",
        className
      )}
      {...props}
    />
  )
}

export { RadioGroup, RadioGroupItem }
