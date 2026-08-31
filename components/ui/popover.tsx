"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Slot } from "@/components/ui/slot"

// Native `popover="auto"` attribute replaces hand-rolled outside-click/Escape listeners and createPortal;
// remaining JS just syncs showPopover()/hidePopover() to `open` since the consumer needs full control.

type PopoverContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  triggerRef: React.RefObject<HTMLElement | null>
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null)

function usePopoverContext(component: string) {
  const ctx = React.useContext(PopoverContext)
  if (!ctx) throw new Error(`<${component}> must be used within <Popover>`)
  return ctx
}

function Popover({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen)
  const open = openProp ?? uncontrolled
  const triggerRef = React.useRef<HTMLElement>(null)

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      {children}
    </PopoverContext.Provider>
  )
}

function PopoverTrigger({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { open, setOpen, triggerRef } = usePopoverContext("PopoverTrigger")
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      ref={triggerRef as React.Ref<never>}
      data-slot="popover-trigger"
      aria-expanded={open}
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(!open)
      }}
      {...props}
    >
      {children}
    </Comp>
  )
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  align?: "start" | "center" | "end"
  sideOffset?: number
}) {
  const { open, setOpen, triggerRef } = usePopoverContext("PopoverContent")
  const contentRef = React.useRef<HTMLDivElement>(null)
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null)

  React.useLayoutEffect(() => {
    const el = contentRef.current
    const trigger = triggerRef.current
    if (!el || !trigger) return

    if (open && !el.matches(":popover-open")) el.showPopover()
    else if (!open && el.matches(":popover-open")) el.hidePopover()

    if (!open) return

    function updatePosition() {
      const triggerRect = trigger!.getBoundingClientRect()
      const contentRect = el!.getBoundingClientRect()
      let left = triggerRect.left
      if (align === "center") left = triggerRect.left + triggerRect.width / 2 - contentRect.width / 2
      if (align === "end") left = triggerRect.right - contentRect.width
      left = Math.max(8, Math.min(left, window.innerWidth - contentRect.width - 8))
      setPos({ top: triggerRect.bottom + sideOffset, left })
    }

    updatePosition()
    window.addEventListener("resize", updatePosition)
    window.addEventListener("scroll", updatePosition, true)
    return () => {
      window.removeEventListener("resize", updatePosition)
      window.removeEventListener("scroll", updatePosition, true)
    }
  }, [open, align, sideOffset, triggerRef])

  React.useEffect(() => {
    const el = contentRef.current
    if (!el) return
    function handleToggle(event: Event) {
      setOpen((event as ToggleEvent).newState === "open")
    }
    el.addEventListener("toggle", handleToggle)
    return () => el.removeEventListener("toggle", handleToggle)
  }, [setOpen])

  return (
    <div
      ref={contentRef}
      popover="auto"
      data-slot="popover-content"
      style={{ position: "fixed", margin: 0, top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
      className={cn(
        "flex w-72 flex-col gap-4 rounded-md border border-base-300 bg-neutral p-4 text-sm text-base-content ring-1 ring-base-content/10 outline-hidden",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Popover, PopoverContent, PopoverTrigger }
