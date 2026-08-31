"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/** Native `<details>`/`<summary>` in place of Radix's Collapsible. */
function Collapsible({
  open,
  defaultOpen,
  onOpenChange,
  ...props
}: Omit<React.ComponentProps<"details">, "open" | "onToggle"> & {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen ?? false)
  const isOpen = open ?? uncontrolledOpen

  return (
    <details
      data-slot="collapsible"
      open={isOpen}
      onToggle={(event) => {
        const next = (event.target as HTMLDetailsElement).open
        setUncontrolledOpen(next)
        onOpenChange?.(next)
      }}
      {...props}
    />
  )
}

function CollapsibleTrigger({
  className,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary
      data-slot="collapsible-trigger"
      className={cn("cursor-pointer list-none [&::-webkit-details-marker]:hidden", className)}
      {...props}
    />
  )
}

function CollapsibleContent({ ...props }: React.ComponentProps<"div">) {
  return <div data-slot="collapsible-content" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
