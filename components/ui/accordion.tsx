"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Native `<details>`/`<summary>` for behavior; `type="single"` relies on
 * same-named `<details>` being mutually exclusive natively. Drops Radix's
 * controlled `value`/`onValueChange` for uncontrolled `open`/`defaultOpen` —
 * no consumers need it yet.
 *
 * Styling is daisyUI's `collapse` / `collapse-title` / `collapse-content`,
 * which has a dedicated `details` branch (`.collapse:is(details)`) that
 * animates `::details-content` — so the open/close height transition the
 * hand-rolled version never had comes for free, and daisy's `collapse-arrow`
 * draws the caret, replacing the icon element this component used to render.
 */
const AccordionGroupContext = React.createContext<string | undefined>(undefined)

function Accordion({
  className,
  type = "single",
  children,
  ...props
}: React.ComponentProps<"div"> & {
  type?: "single" | "multiple"
}) {
  const groupName = React.useId()
  return (
    <AccordionGroupContext.Provider value={type === "single" ? groupName : undefined}>
      <div data-slot="accordion" className={cn("flex w-full flex-col", className)} {...props}>
        {children}
      </div>
    </AccordionGroupContext.Provider>
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<"details">) {
  const groupName = React.useContext(AccordionGroupContext)
  return (
    <details
      data-slot="accordion-item"
      name={groupName}
      className={cn(
        // `rounded-none`: daisy's collapse defaults to `--radius-box`, but
        // stacked accordion rows are divided by a rule, not by rounded cards.
        // `has-[summary:focus-visible]:outline-none`: daisy draws a native
        // outline on the collapse when its summary is focused; the app's
        // focus system is the ring on the summary itself (see below).
        "collapse collapse-arrow rounded-none not-last:border-b has-[summary:focus-visible]:outline-none",
        className
      )}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<"summary">) {
  return (
    <summary
      data-slot="accordion-trigger"
      className={cn(
        "collapse-title text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-primary/30 hover:underline",
        className
      )}
      {...props}
    >
      {children}
    </summary>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="accordion-content"
      className={cn(
        "collapse-content text-sm [&_a]:underline [&_a]:underline-offset-3 [&_a]:hover:text-base-content [&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
