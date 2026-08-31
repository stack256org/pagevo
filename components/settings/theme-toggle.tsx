"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
] as const;

/**
 * Segmented Light / Dark / System control.
 * Reads `theme` (not `resolvedTheme`) so "System" stays selected instead of snapping to the resolved OS theme.
 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  /* Render disabled until mounted: theme is unknown until localStorage is read client-side, avoiding a hydration flash. */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    /* fieldset + legend rather than role="group" + aria-label: it is the
       native grouping element, so the association survives even where ARIA
       is ignored. The legend is visually hidden because the adjacent settings
       row already labels this control on screen. */
    <fieldset className="m-0 inline-flex shrink-0 gap-0.5 rounded-md border border-base-300 bg-base-200 p-0.5">
      <legend className="sr-only">Colour theme</legend>
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = mounted && theme === value;
        return (
          /* A group of toggle buttons rather than a radiogroup: aria-pressed is
        carried natively by <button>, so screen readers announce the state
        without the roving-tabindex keyboard contract that role="radio"
        obliges us to implement by hand. */
          <button
            aria-label={label}
            aria-pressed={selected}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1.5 text-xs font-medium",
              selected
                ? "bg-base-100 text-base-content shadow-card"
                : "text-base-content/70 hover:text-base-content"
            )}
            disabled={!mounted}
            key={value}
            onClick={() => setTheme(value)}
            type="button"
          >
            <Icon aria-hidden size={14} />
            {label}
          </button>
        );
      })}
    </fieldset>
  );
}
