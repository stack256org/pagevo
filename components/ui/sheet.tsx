"use client"

import * as React from "react"
import { createPortal } from "react-dom"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slot } from "@/components/ui/slot"
import { XIcon } from "@phosphor-icons/react"

// Native <dialog>-based, same engine as dialog.tsx (see the comment there).

type SheetContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  dialogRef: React.RefObject<HTMLDialogElement | null>
}

const SheetContext = React.createContext<SheetContextValue | null>(null)

function useSheetContext(component: string) {
  const ctx = React.useContext(SheetContext)
  if (!ctx) throw new Error(`<${component}> must be used within <Sheet>`)
  return ctx
}

function Sheet({
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
  const dialogRef = React.useRef<HTMLDialogElement>(null)

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [openProp, onOpenChange]
  )

  // useLayoutEffect, not useEffect: showModal() must run before the browser
  // paints the frame where `open` flips true, or that frame briefly renders
  // with the dialog's un-promoted (pre-top-layer, pre-@starting-style)
  // styles — visible as a flash at the document's default 0,0 origin before
  // it snaps to its actual centered/offscreen position.
  React.useLayoutEffect(() => {
    const el = dialogRef.current
    if (!el) return
    if (open && !el.open) el.showModal()
    else if (!open && el.open) el.close()
  }, [open])

  React.useEffect(() => {
    if (!open) return
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = ""
    }
  }, [open])

  return (
    <SheetContext.Provider value={{ open, setOpen, dialogRef }}>
      {children}
    </SheetContext.Provider>
  )
}

function SheetTrigger({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useSheetContext("SheetTrigger")
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sheet-trigger"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(true)
      }}
      {...props}
    >
      {children}
    </Comp>
  )
}

function SheetClose({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useSheetContext("SheetClose")
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="sheet-close"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event)
        if (!event.defaultPrevented) setOpen(false)
      }}
      {...props}
    >
      {children}
    </Comp>
  )
}

function SheetPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<"dialog"> & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
  onEscapeKeyDown?: (event: { target: EventTarget | null; preventDefault: () => void }) => void
}) {
  const { open, setOpen, dialogRef } = useSheetContext("SheetContent")

  // Portaled to document.body so a SheetContent living inside a persistent ancestor (e.g. the sidebar) doesn't depend on that
  // ancestor's CSS while closed and not yet top-layer-promoted; `mounted` avoids an SSR/client markup mismatch since the portal target only exists in the browser.
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => { setMounted(true) }, [])

  React.useEffect(() => {
    const el = dialogRef.current
    if (!el) return

    function handleCancel(event: Event) {
      onEscapeKeyDown?.({ target: document.activeElement, preventDefault: () => event.preventDefault() })
    }
    function handleClose() {
      setOpen(false)
    }

    el.addEventListener("cancel", handleCancel)
    el.addEventListener("close", handleClose)
    return () => {
      el.removeEventListener("cancel", handleCancel)
      el.removeEventListener("close", handleClose)
    }
  }, [dialogRef, onEscapeKeyDown, setOpen])

  if (!mounted) return null

  return createPortal(
    <dialog
      ref={dialogRef}
      data-slot="sheet-content"
      data-side={side}
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false)
      }}
      className={cn(
        "fixed z-50 m-0 flex max-h-none max-w-none flex-col bg-neutral bg-clip-padding text-sm text-base-content data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:top-auto data-[side=bottom]:h-auto data-[side=bottom]:w-full data-[side=bottom]:border-t data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:h-full data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:h-full data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:bottom-auto data-[side=top]:h-auto data-[side=top]:w-full data-[side=top]:border-b data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
        className
      )}
      {...props}
    >
      {open && (
        <>
          {children}
          {showCloseButton && (
            <SheetClose asChild>
              <Button
                variant="ghost"
                className="absolute top-4 right-4 bg-secondary"
                size="icon-sm"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </SheetClose>
          )}
        </>
      )}
    </dialog>,
    document.body
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-8", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-8", className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="sheet-title"
      className={cn(
        "font-heading text-lg font-semibold tracking-wide text-base-content",
        className
      )}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="sheet-description"
      className={cn("mt-0.5 text-sm leading-relaxed text-base-content/70", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
