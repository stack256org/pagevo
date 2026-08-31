"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Slot } from "@/components/ui/slot"

// Pure daisyUI CSS tooltip — no JS state, no positioning library. Content is
// either a plain string (daisy's `data-tip` attribute) or, for anything
// richer, daisy's `tooltip-content` slot (real markup, still CSS-driven).

type Side = "top" | "right" | "bottom" | "left"
type Align = "start" | "center" | "end"

type TooltipConfig = {
  side: Side
  align: Align
  hidden: boolean
  content: React.ReactNode
}

const sideClass: Record<Side, string> = {
  top: "tooltip-top",
  right: "tooltip-right",
  bottom: "tooltip-bottom",
  left: "tooltip-left",
}
const alignClass: Record<Align, string> = {
  start: "tooltip-start",
  center: "tooltip-center",
  end: "tooltip-end",
}

const TooltipConfigContext = React.createContext<{
  setConfig: (config: TooltipConfig) => void
} | null>(null)

function TooltipProvider({ children }: { children?: React.ReactNode; delayDuration?: number }) {
  return <>{children}</>
}

function Tooltip({ children }: { children?: React.ReactNode }) {
  const [config, setConfig] = React.useState<TooltipConfig>({
    side: "top",
    align: "center",
    hidden: false,
    content: null,
  })

  if (config.hidden || !config.content) {
    return <>{children}</>
  }

  const isPlainText = typeof config.content === "string"

  return (
    <TooltipConfigContext.Provider value={{ setConfig }}>
      <div
        data-slot="tooltip"
        className={cn("tooltip", sideClass[config.side], alignClass[config.align])}
        data-tip={isPlainText ? (config.content as string) : undefined}
      >
        {children}
        {!isPlainText && <div className="tooltip-content">{config.content}</div>}
      </div>
    </TooltipConfigContext.Provider>
  )
}

function TooltipTrigger({
  asChild = true,
  children,
}: {
  asChild?: boolean
  children?: React.ReactNode
}) {
  if (!asChild) {
    return (
      <span data-slot="tooltip-trigger" className="contents">
        {children}
      </span>
    )
  }
  return <Slot data-slot="tooltip-trigger">{children}</Slot>
}

function TooltipContent({
  side = "top",
  align = "center",
  hidden = false,
  children,
}: {
  side?: Side
  align?: Align
  hidden?: boolean
  children?: React.ReactNode
} & Record<string, unknown>) {
  const ctx = React.useContext(TooltipConfigContext)

  React.useLayoutEffect(() => {
    ctx?.setConfig({ side, align, hidden, content: children })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, side, align, hidden, children])

  return null
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
