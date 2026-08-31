"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

/**
 * Wraps next-themes with this app's conventions.
 *
 * Both attributes are load-bearing and neither may be dropped:
 *   - `class` drives globals.css's `@custom-variant dark` (every `dark:` utility) and the hand-written `.dark` block.
 *   - `data-theme` is the ONLY selector daisyUI 5 emits its built-in themes under
 *     (`[data-theme=light]` / `[data-theme=dark]`), so without it every `--color-*`
 *     stays pinned to the light palette and dark mode paints light surfaces.
 *     This became required once the shadcn `:root`/`.dark` colour tokens were deleted
 *     and daisy became the sole source of colour.
 *
 * `disableTransitionOnChange` prevents every interactive element's colour transition from animating at once on theme flip.
 */
export function ThemeProvider({
  children,
  ...props
}: ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute={["class", "data-theme"]}
      defaultTheme="system"
      disableTransitionOnChange
      enableSystem
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}
