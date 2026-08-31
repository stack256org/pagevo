"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { toggleClasses, type ToggleSize, type ToggleVariant } from "@/components/ui/toggle"

type ToggleGroupContextValue = {
  variant?: ToggleVariant
  size?: ToggleSize
  spacing?: number
  orientation?: "horizontal" | "vertical"
  value: string[]
  toggleValue: (value: string) => void
}

const ToggleGroupContext = React.createContext<ToggleGroupContextValue | null>(null)

/**
 * Native `<button>` group in place of Radix's ToggleGroup.
 *
 * At `spacing={0}` the group is daisyUI's `join`: daisy collapses the shared
 * borders and rounds only the outer corners itself, replacing the
 * hand-written `first:`/`last:`/`border-l-0` chain this used to carry. At any
 * other spacing the buttons are separate pills and `join` does not apply —
 * it has no concept of a gap between items.
 */
function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  type = "single",
  value,
  defaultValue,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  variant?: ToggleVariant
  size?: ToggleSize
  spacing?: number
  orientation?: "horizontal" | "vertical"
  type?: "single" | "multiple"
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[] | undefined) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState<string | string[] | undefined>(defaultValue)
  const current = value ?? uncontrolled
  const currentArray = Array.isArray(current) ? current : current ? [current] : []

  const toggleValue = (v: string) => {
    const next: string | string[] | undefined =
      type === "multiple"
        ? currentArray.includes(v)
          ? currentArray.filter((x) => x !== v)
          : [...currentArray, v]
        : currentArray.includes(v)
          ? undefined
          : v
    setUncontrolled(next)
    onValueChange?.(next)
  }

  return (
    <div
      data-slot="toggle-group"
      role="group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "group/toggle-group flex w-fit flex-row items-center gap-[--spacing(var(--gap))] data-vertical:flex-col data-vertical:items-stretch",
        spacing === 0 && (orientation === "vertical" ? "join join-vertical" : "join join-horizontal"),
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation, value: currentArray, toggleValue }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </div>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  value,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ToggleVariant
  size?: ToggleSize
  value: string
}) {
  const context = React.useContext(ToggleGroupContext)
  if (!context) {
    throw new Error("ToggleGroupItem must be rendered inside a ToggleGroup")
  }
  const isOn = context.value.includes(value)

  return (
    <button
      type="button"
      data-slot="toggle-group-item"
      data-state={isOn ? "on" : "off"}
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      aria-pressed={isOn}
      onClick={() => context.toggleValue(value)}
      className={cn(
        "shrink-0 focus:z-10 focus-visible:z-10 data-[state=on]:bg-base-200 data-[state=on]:text-base-content",
        // daisy's `join-item` reads the corner-radius custom properties the
        // `join` parent sets on its first/last child and collapses the shared
        // border via a negative inline margin.
        context.spacing === 0 && "join-item",
        toggleClasses({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export { ToggleGroup, ToggleGroupItem }
