import * as React from "react"
import { Slot } from "@/components/ui/slot"

import { cn } from "@/lib/utils"

// daisyUI `btn` swapped in for the shadcn/Tailwind class string; public API (variants/sizes/data-*/asChild) unchanged.
// daisy's size scale (ratio 3:4:5:6:7) doesn't match ours (6:8:9:10:11), so each size below re-declares --size/--btn-p explicitly.
// `text-sm` must stay in the base, not only in the size variants: the four
// icon sizes declare no text-* class, and without it they inherit
// line-height 1.5 (21px) instead of Tailwind's text-sm 20px.
const BUTTON_BASE =
  "btn text-sm font-medium tracking-normal whitespace-nowrap shrink-0 border border-transparent outline-none select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-error aria-invalid:ring-2 aria-invalid:ring-error/20 dark:aria-invalid:border-error/50 dark:aria-invalid:ring-error/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"

const buttonVariantClasses = {
  default: "btn-primary hover:bg-primary/90 active:bg-primary/80",
  outline:
    "[--btn-color:var(--color-base-100)] border-base-300 text-base-content hover:bg-base-200 hover:text-base-content",
  secondary: "btn-secondary hover:bg-secondary/80",
  ghost: "btn-ghost text-base-content hover:bg-base-200 hover:text-base-content",
  // NOT `btn-soft btn-error`: daisy's soft variant mixes an OPAQUE tint
  // (measured oklab L=0.963) where ours is a 10% ALPHA tint. Identical on
  // white, visibly different anywhere the button sits on a non-white
  // surface. Kept as manual alpha utilities rather than daisy's prebuilt class.
  destructive:
    "bg-error/10 text-error border-error/20 hover:bg-error/15 dark:bg-error/20 dark:hover:bg-error/25",
  // The solid counterpart, straight from daisy. Used where a destructive
  // action is the dialog's primary affordance (`AlertDialogAction`) and the
  // soft tint above would read as secondary.
  "destructive-solid": "btn-error",
  // `no-underline` is load-bearing: daisy's btn-link underlines at rest,
  // ours only on hover. Caught by screenshot diff, not by computed-style
  // probing — text-decoration was not in the probe list.
  link: "btn-link no-underline text-primary underline-offset-4 hover:underline border-transparent",
} as const

const buttonSizeClasses = {
  // --size / --btn-p re-declared per step: daisy's own scale does not
  // land on any of these except `default`.
  default: "[--size:2.25rem] [--btn-p:1rem] gap-1.5 text-sm",
  xs: "[--size:1.5rem] [--btn-p:0.625rem] gap-1 text-xs rounded-sm [&_svg:not([class*='size-'])]:size-3",
  sm: "[--size:2rem] [--btn-p:0.75rem] gap-1 text-xs",
  lg: "[--size:2.5rem] [--btn-p:1.5rem] gap-1.5 text-sm",
  xl: "[--size:2.75rem] [--btn-p:1.75rem] gap-2 text-base",
  icon: "btn-square [--size:2.25rem]",
  "icon-xs": "btn-square [--size:1.5rem] rounded-sm [&_svg:not([class*='size-'])]:size-3",
  "icon-sm": "btn-square [--size:2rem]",
  "icon-lg": "btn-square [--size:2.5rem]",
} as const

type ButtonVariant = keyof typeof buttonVariantClasses
type ButtonSize = keyof typeof buttonSizeClasses

function buttonClasses({
  variant = "default",
  size = "default",
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
} = {}) {
  return cn(BUTTON_BASE, buttonVariantClasses[variant], buttonSizeClasses[size], className)
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & {
  variant?: ButtonVariant
  size?: ButtonSize
  asChild?: boolean
}) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(
        BUTTON_BASE,
        buttonVariantClasses[variant],
        buttonSizeClasses[size],
        className
      )}
      {...props}
    />
  )
}

export { Button, buttonClasses, type ButtonVariant, type ButtonSize }
