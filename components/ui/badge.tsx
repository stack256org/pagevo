import * as React from "react"
import { Slot } from "@/components/ui/slot"

import { cn } from "@/lib/utils"

const badgeVariantClasses = {
  default: "border-secondary-content/20 bg-secondary text-secondary-content",
  secondary: "border-base-300 bg-base-200 text-base-content/70",
  destructive: "border-error/20 bg-error/10 text-error",
  outline: "border-base-300 bg-transparent text-base-content",
  ghost: "border-transparent bg-base-200/60 text-base-content/70",
  link: "border-transparent bg-transparent text-primary underline-offset-4 hover:underline p-0",
} as const

type BadgeVariant = keyof typeof badgeVariantClasses

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & {
  variant?: BadgeVariant
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(
        "badge inline-flex w-fit shrink-0 items-center gap-1 rounded-xs border px-2 py-0.5 text-xs font-medium tracking-normal whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [&>svg]:pointer-events-none [&>svg]:size-3",
        badgeVariantClasses[variant],
        className
      )}
      {...props}
    />
  )
}

export { Badge }
