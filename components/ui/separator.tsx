import * as React from "react"

import { cn } from "@/lib/utils"

// Local replacement for Radix's Separator (just a div + ARIA).
// `data-orientation` is load-bearing: the `data-horizontal:`/`data-vertical:` classes below key off it.
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
  decorative?: boolean
}) {
  return (
    <div
      data-slot="separator"
      data-orientation={orientation}
      // Decorative rules are hidden from assistive tech entirely.
      role={decorative ? "none" : "separator"}
      // aria-orientation only needed for vertical; horizontal is the implicit default.
      aria-orientation={
        !decorative && orientation === "vertical" ? "vertical" : undefined
      }
      className={cn(
        "shrink-0 bg-base-300 data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )
}

export { Separator }
