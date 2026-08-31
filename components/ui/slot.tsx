"use client"

import * as React from "react"

// "use client" here (not on Button) is what lets `<Button asChild>` be used from Server Components.
function setRef<T>(ref: React.Ref<T> | undefined, node: T) {
  if (typeof ref === "function") ref(node)
  else if (ref) (ref as React.RefObject<T | null>).current = node
}

// Local replacement for radix-ui's `Slot.Root`: merges slot props onto the single child (asChild pattern).
// className/style merge, handlers compose (both run), other props: child wins.
const Slot = React.forwardRef<HTMLElement, React.HTMLAttributes<HTMLElement>>(
  ({ children, ...slotProps }, ref) => {
    if (!React.isValidElement(children)) return null

    const child = children as React.ReactElement<Record<string, unknown>>
    const childProps = child.props
    const merged: Record<string, unknown> = { ...slotProps, ...childProps }

    for (const key of Object.keys(slotProps)) {
      const slotValue = (slotProps as Record<string, unknown>)[key]
      const childValue = childProps[key]

      if (key === "className") {
        merged.className = [slotValue, childValue].filter(Boolean).join(" ")
      } else if (key === "style") {
        merged.style = { ...(slotValue as object), ...(childValue as object) }
      } else if (key.startsWith("on") && typeof slotValue === "function") {
        merged[key] = (...args: unknown[]) => {
          ;(slotValue as (...a: unknown[]) => void)(...args)
          if (typeof childValue === "function") (childValue as (...a: unknown[]) => void)(...args)
        }
      }
    }

    const childRef = (childProps as { ref?: React.Ref<HTMLElement> }).ref

    return React.cloneElement(child, {
      ...merged,
      ref: (node: HTMLElement) => {
        setRef(ref, node)
        setRef(childRef, node)
      },
    })
  }
)
Slot.displayName = "Slot"

export { Slot }
