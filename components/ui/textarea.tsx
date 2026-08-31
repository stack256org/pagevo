import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "textarea flex field-sizing-content min-h-16 w-full resize-none rounded-none border border-transparent border-b-base-300 bg-transparent px-0 py-3 text-base transition-[color,border-color] outline-none placeholder:text-base-content/70 focus-visible:border-b-primary disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-b-error md:text-sm dark:aria-invalid:border-b-error/50",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
