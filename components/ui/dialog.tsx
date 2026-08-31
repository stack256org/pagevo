"use client"

import * as React from "react"
// `Portal.Group` shows as deprecated in favor of a standalone `PortalGroup`
// export, but that export isn't re-exported from the package root yet.
import { Portal } from "@headlessui/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Slot } from "@/components/ui/slot"
import { XIcon } from "@phosphor-icons/react"

// Native <dialog> instead of Radix: showModal()/close() give focus-trap, Escape, and
// top-layer stacking for free, replacing the old manual z-580/z-590 tiers.

type DialogContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  dialogRef: React.RefObject<HTMLDialogElement | null>
}

const DialogContext = React.createContext<DialogContextValue | null>(null)

function useDialogContext(component: string) {
  const ctx = React.useContext(DialogContext)
  if (!ctx) throw new Error(`<${component}> must be used within <Dialog>`)
  return ctx
}

function Dialog({
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
  // it snaps to its actual centered position.
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
    <DialogContext.Provider value={{ open, setOpen, dialogRef }}>
      {children}
    </DialogContext.Provider>
  )
}

function DialogTrigger({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useDialogContext("DialogTrigger")
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="dialog-trigger"
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

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogClose({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useDialogContext("DialogClose")
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="dialog-close"
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

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<"dialog"> & {
  showCloseButton?: boolean
  onEscapeKeyDown?: (event: { target: EventTarget | null; preventDefault: () => void }) => void
}) {
  const { open, setOpen, dialogRef } = useDialogContext("DialogContent")
  const contentRef = React.useRef<HTMLDivElement>(null)

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

  return (
    <dialog
      ref={dialogRef}
      data-slot="dialog-content"
      onClick={(event) => {
        if (event.target === dialogRef.current) setOpen(false)
      }}
      className={cn(
        "fixed top-1/2 left-1/2 z-50 m-0 w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-md bg-neutral p-6 text-sm text-base-content ring-1 ring-base-content/10 outline-none sm:max-w-md",
        className
      )}
      {...props}
    >
      {/* Headless UI portals (Select's ListboxOptions, a Popover panel, …)
          default to document.body, outside this <dialog>'s top layer — they'd
          render invisibly behind the modal regardless of z-index, so
          Portal.Group redirects them into this subtree instead. It targets
          this inner wrapper rather than the <dialog> itself because the
          dialog carries a `transform` (centering + the open/close scale
          animation), which becomes the containing block for the portaled
          panel's `position: absolute` coordinates and throws floating-ui's
          math off by the dialog's own centering offset. `relative` here,
          with no offset of its own, re-establishes the containing block one
          level in, without one. */}
      {open && (
        <>
          <Portal.Group target={contentRef}>
            <div ref={contentRef} className="relative grid gap-6">
              {children}
            </div>
          </Portal.Group>
          {showCloseButton && (
            <DialogClose asChild>
              <Button
                variant="ghost"
                className="absolute top-5 right-5 bg-secondary"
                size="icon-sm"
              >
                <XIcon />
                <span className="sr-only">Close</span>
              </Button>
            </DialogClose>
          )}
        </>
      )}
    </dialog>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogClose asChild>
          <Button variant="outline">Close</Button>
        </DialogClose>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      data-slot="dialog-title"
      className={cn(
        "font-heading text-lg leading-none font-semibold tracking-wide",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="dialog-description"
      className={cn(
        "mt-0.5 text-sm leading-relaxed text-base-content/70 *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-base-content",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
