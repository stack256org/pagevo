import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "input h-9 w-full min-w-0 rounded-xs border border-base-300 bg-base-100 px-3 py-1.5 text-sm text-base-content transition-[color,border-color,box-shadow] outline-none placeholder:text-base-content/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-error aria-invalid:ring-error/20 file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-base-content dark:aria-invalid:border-error/50",
        className
      )}
      {...props}
    />
  )
}

export { Input }
