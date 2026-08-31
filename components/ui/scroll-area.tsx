import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Plain `overflow-auto` in place of Radix's ScrollArea — scrollbars are already styled
 * globally (globals.css `::-webkit-scrollbar`), so Radix's custom thumb added nothing.
 */
function ScrollArea({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div data-slot="scroll-area" className={cn("relative", className)} {...props}>
      <div
        data-slot="scroll-area-viewport"
        className="size-full overflow-auto rounded-[inherit] outline-none focus-visible:ring-[3px] focus-visible:ring-primary/50"
      >
        {children}
      </div>
    </div>
  )
}

export { ScrollArea }
