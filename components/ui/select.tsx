"use client"

import * as React from "react"
import {
  Listbox,
  ListboxButton,
  ListboxOptions,
  ListboxOption,
  ListboxSelectedOption,
} from "@headlessui/react"
import { Check, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

// The one primitive that genuinely needed a real behavior library, since a keyboard-navigable
// select isn't something daisyUI's CSS can give you. `ListboxSelectedOption` mirrors the selected
// option's children into the trigger, same as Radix's `SelectValue`.
//
// Split of responsibility: Headless UI's `Listbox` owns behavior (keyboard
// navigation, focus, ARIA, open state, anchoring); daisyUI's `select` class
// styles the trigger — border, radius, height scale. Its own CSS-drawn caret
// (two 4px linear-gradient triangles) is disabled via `bg-none!` because it
// renders as a clipped/broken glyph at this size in some browsers; a real
// ChevronDown icon in SelectTrigger replaces it instead. The floating panel
// keeps hand-written surface classes built from daisy's own theme tokens:
// daisy's `dropdown-content` is inert outside a `.dropdown` ancestor and
// would fight Headless UI's anchoring, so there is no daisy class for this
// surface.

const SelectOptionsContext = React.createContext<React.ReactNode>(null)

function Select({
  children,
  value,
  onValueChange,
  disabled,
}: {
  children?: React.ReactNode
  value?: string
  onValueChange?: (value: string) => void
  disabled?: boolean
}) {
  let optionsChildren: React.ReactNode = null
  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === SelectContent) {
      optionsChildren = (child.props as { children?: React.ReactNode }).children
    }
  })

  return (
    <SelectOptionsContext.Provider value={optionsChildren}>
      <Listbox
        value={value ?? null}
        onChange={(next) => {
          if (next != null) onValueChange?.(next as string)
        }}
        disabled={disabled}
      >
        {children}
      </Listbox>
    </SelectOptionsContext.Provider>
  )
}

function SelectValue({
  placeholder,
  className,
}: {
  placeholder?: React.ReactNode
  className?: string
}) {
  const optionsChildren = React.useContext(SelectOptionsContext)
  return (
    <span data-slot="select-value" className={cn("min-w-0 flex-1 truncate text-left", className)}>
      <ListboxSelectedOption
        options={optionsChildren}
        placeholder={<span className="text-base-content/50">{placeholder}</span>}
      />
    </span>
  )
}

function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}: Omit<React.ComponentPropsWithoutRef<"button">, "children"> & {
  size?: "sm" | "default"
  children?: React.ReactNode
}) {
  return (
    <ListboxButton
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        // daisy's `select` owns the padding (including the inline-end room
        // the caret sits in), the radius and the appearance reset. `bg-none!`
        // turns off its own CSS-drawn caret (see the file-level comment
        // above) in favor of the real ChevronDown rendered below. Overridden
        // here: `w-full` (daisy clamps to 20rem), the base-200 surface and
        // base-300 border shared with the app's other field chrome, and an
        // explicit height so the trigger matches `input`'s 36px rather than
        // daisy's 40px.
        "select w-full border border-base-300 bg-base-200 bg-none! text-sm text-base-content transition-colors",
        "hover:bg-base-200/40 hover:border-base-300",
        "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "default" && "h-9",
        size === "sm" && "h-8 text-xs",
        className
      )}
      {...props}
    >
      {children}
      <ChevronDown
        className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 shrink-0 -translate-y-1/2 text-base-content/50"
      />
    </ListboxButton>
  )
}

function SelectContent({
  className,
  children,
  align = "start",
}: {
  className?: string
  children?: React.ReactNode
  align?: "start" | "center" | "end"
}) {
  const anchor = align === "center" ? "bottom" : align === "end" ? "bottom end" : "bottom start"

  return (
    <ListboxOptions
      data-slot="select-content"
      anchor={{ to: anchor, gap: 4 }}
      transition
      className={cn(
        // z-600: sits above this app's other stacking tiers (sidebar, modals) regardless of trigger context.
        // min-w-(--button-width): Headless UI's measured trigger width, floors the panel from rendering narrower.
        "z-600 min-w-(--button-width) overflow-y-auto rounded-md border border-base-300 bg-neutral p-1 text-base-content",
        "shadow-float",
        "transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95",
        className
      )}
    >
      {children}
    </ListboxOptions>
  )
}

type SelectItemSlot = Parameters<
  Extract<React.ComponentProps<typeof ListboxOption>["children"], (bag: never) => unknown>
>[0]

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ListboxOption>) {
  return (
    <ListboxOption
      data-slot="select-item"
      className={(bag: SelectItemSlot) => {
        const custom = typeof className === "function" ? className(bag) : className
        // selectedOption is true when Headless UI mirrors this option into the closed
        // trigger via SelectValue — the list-item chrome (padding/pr-8) can overflow a narrow trigger, so `contents` makes the wrapper transparent and only the plain label renders there.
        if (bag.selectedOption) return cn("contents", custom)
        return cn(
          "relative flex w-full cursor-default scroll-my-1 items-center gap-2 rounded-sm py-2 pl-3 pr-8 text-sm outline-none",
          "text-base-content transition-colors",
          "data-focus:bg-primary/10 data-focus:text-primary",
          "data-selected:font-medium",
          "data-disabled:pointer-events-none data-disabled:opacity-50",
          "[&_svg]:pointer-events-none [&_svg]:shrink-0",
          custom
        )
      }}
      {...props}
    >
      {({ selected, selectedOption }) => (
        <>
          {/* Same reasoning as the className branch above — the checkmark
              belongs to the open list, not the mirrored trigger copy. */}
          {!selectedOption && (
            <span className="absolute right-2.5 flex size-4 items-center justify-center">
              {selected && <Check className="size-3.5 text-primary" />}
            </span>
          )}
          {children}
        </>
      )}
    </ListboxOption>
  )
}

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
