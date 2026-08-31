"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui/button";
import { Slot } from "@/components/ui/slot";

// Native <dialog>-based, same engine as dialog.tsx (see the comment there).
// Deliberately does NOT close on backdrop click — an alert dialog exists to
// force an explicit Cancel/Action decision (see doc/CLAUDE.md Rule 8), so
// only the two buttons (or Escape) can dismiss it.

type AlertDialogContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  dialogRef: React.RefObject<HTMLDialogElement | null>;
};

const AlertDialogContext = React.createContext<AlertDialogContextValue | null>(null);

function useAlertDialogContext(component: string) {
  const ctx = React.useContext(AlertDialogContext);
  if (!ctx) throw new Error(`<${component}> must be used within <AlertDialog>`);
  return ctx;
}

function AlertDialog({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
}: {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const dialogRef = React.useRef<HTMLDialogElement>(null);

  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );

  // useLayoutEffect, not useEffect: showModal() must run before the browser
  // paints the frame where `open` flips true, or that frame briefly renders
  // with the dialog's un-promoted (pre-top-layer, pre-@starting-style)
  // styles — visible as a flash at the document's default 0,0 origin before
  // it snaps to its actual centered position.
  React.useLayoutEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  React.useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    function handleClose() {
      setOpen(false);
    }
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [setOpen]);

  return (
    <AlertDialogContext.Provider value={{ open, setOpen, dialogRef }}>
      {children}
    </AlertDialogContext.Provider>
  );
}

function AlertDialogTrigger({
  asChild,
  onClick,
  children,
  ...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
  const { setOpen } = useAlertDialogContext("AlertDialogTrigger");
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      data-slot="alert-dialog-trigger"
      onClick={(event: React.MouseEvent<HTMLButtonElement>) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(true);
      }}
      {...props}
    >
      {children}
    </Comp>
  );
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}

function AlertDialogContent({
  className,
  // No-op: native <dialog> top-layer stacking made this unnecessary; kept so callers don't need to change.
  overlayClassName: _overlayClassName,
  children,
  ...props
}: React.ComponentProps<"dialog"> & { overlayClassName?: string }) {
  const { open, dialogRef } = useAlertDialogContext("AlertDialogContent");

  return (
    <dialog
      ref={dialogRef}
      data-slot="alert-dialog-content"
      className={cn(
        "fixed left-1/2 top-1/2 z-590 m-0 w-full max-w-105 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-base-300 bg-neutral p-6",
        className,
      )}
      {...props}
    >
      {open && children}
    </dialog>
  );
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    // daisy `modal-action` (end-aligned, gapped action row). It composes
    // standalone — unlike `modal-box`, none of its declarations are scoped to
    // a `.modal` ancestor — so it works on this native-`<dialog>` engine.
    <div
      className={cn("modal-action items-center", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <h2
      className={cn("text-base font-semibold text-base-content", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p className={cn("text-sm text-base-content/70", className)} {...props} />
  );
}

function AlertDialogAction({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { setOpen } = useAlertDialogContext("AlertDialogAction");

  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      // daisy `btn btn-error` via the shared Button class builder, in place of
      // the hand-rolled button class string this used to carry.
      className={buttonClasses({ variant: "destructive-solid", className })}
      {...props}
    />
  );
}

function AlertDialogCancel({
  className,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const { setOpen } = useAlertDialogContext("AlertDialogCancel");

  return (
    <button
      type="button"
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) setOpen(false);
      }}
      className={buttonClasses({ variant: "outline", className })}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogPortal,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
