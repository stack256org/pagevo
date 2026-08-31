"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Behavior is hand-rolled, value-based (not Headless UI's index-based
// TabGroup, which doesn't match the string `value` contract every consumer
// here already uses): context for the active value, plus manual role/aria-*
// wiring and roving arrow-key navigation.
//
// Styling is daisyUI's `tabs`/`tab` (+ `tabs-box`/`tabs-border`). daisy keys
// the active tab off `[aria-selected=true]`, which this component already
// sets for accessibility — so no state-driven class computation is needed and
// `.tab` must stay a *direct child* of `.tabs` (daisy scopes it as
// `.tab:is(.tabs > .tab)`).

type TabsContextValue = {
  value: string | undefined
  setValue: (value: string) => void
  idBase: string
}

const TabsContext = React.createContext<TabsContextValue | null>(null)

function useTabsContext(component: string) {
  const ctx = React.useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> must be used within <Tabs>`)
  return ctx
}

function Tabs({
  className,
  orientation = "horizontal",
  value: valueProp,
  defaultValue,
  onValueChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical"
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultValue)
  const value = valueProp ?? uncontrolled
  const idBase = React.useId()

  const setValue = React.useCallback(
    (next: string) => {
      if (valueProp === undefined) setUncontrolled(next)
      onValueChange?.(next)
    },
    [valueProp, onValueChange]
  )

  return (
    <TabsContext.Provider value={{ value, setValue, idBase }}>
      <div
        data-slot="tabs"
        data-orientation={orientation}
        className={cn("group/tabs flex gap-2 data-horizontal:flex-col", className)}
        {...props}
      >
        {children}
      </div>
    </TabsContext.Provider>
  )
}

// `tabs-box` = daisy's filled pill group; `tabs-border` = daisy's underline
// group. Both draw their own active-tab treatment off `[aria-selected=true]`.
const tabsListVariantClasses = {
  default: "tabs-box",
  line: "tabs-border",
} as const

type TabsListVariant = keyof typeof tabsListVariantClasses

function TabsList({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: TabsListVariant }) {
  const listRef = React.useRef<HTMLDivElement>(null)

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const navKeys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]
    if (!navKeys.includes(event.key)) return

    const list = listRef.current
    if (!list) return
    const tabs = Array.from(list.querySelectorAll<HTMLButtonElement>('[role="tab"]:not(:disabled)'))
    const currentIndex = tabs.indexOf(document.activeElement as HTMLButtonElement)
    if (currentIndex === -1) return

    let nextIndex = currentIndex
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (event.key === "Home") nextIndex = 0
    else if (event.key === "End") nextIndex = tabs.length - 1

    event.preventDefault()
    tabs[nextIndex]?.focus()
    tabs[nextIndex]?.click()
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      data-slot="tabs-list"
      data-variant={variant}
      onKeyDown={handleKeyDown}
      className={cn(
        "tabs group/tabs-list w-fit items-center justify-center group-data-vertical/tabs:flex-col",
        tabsListVariantClasses[variant],
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

function TabsTrigger({
  className,
  value,
  disabled,
  onClick,
  ...props
}: React.ComponentProps<"button"> & { value: string }) {
  const { value: activeValue, setValue, idBase } = useTabsContext("TabsTrigger")
  const active = activeValue === value

  return (
    <button
      type="button"
      role="tab"
      id={`${idBase}-trigger-${value}`}
      aria-controls={`${idBase}-content-${value}`}
      aria-selected={active}
      data-slot="tabs-trigger"
      data-active={active}
      disabled={disabled}
      tabIndex={active ? 0 : -1}
      onClick={(event) => {
        onClick?.(event)
        if (!event.defaultPrevented) setValue(value)
      }}
      className={cn(
        // daisy's `tab` owns sizing, padding, the inactive/hover colours and
        // the active treatment (via `[aria-selected=true]`, set above). What
        // stays here is layout (stretch to fill a `w-full` list), the app's
        // ring-based focus system in place of daisy's own outline, and icon
        // sizing.
        "tab flex-1 gap-2 font-medium group-data-vertical/tabs:w-full group-data-vertical/tabs:justify-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  value,
  ...props
}: React.ComponentProps<"div"> & { value: string }) {
  const { value: activeValue, idBase } = useTabsContext("TabsContent")
  if (activeValue !== value) return null

  return (
    <div
      role="tabpanel"
      id={`${idBase}-content-${value}`}
      aria-labelledby={`${idBase}-trigger-${value}`}
      tabIndex={0}
      data-slot="tabs-content"
      className={cn("flex-1 text-sm outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
