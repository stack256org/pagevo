"use client";

import { PopoverButton } from "@headlessui/react";

// Invisible PopoverButton pinned to an external DOMRect, since Headless UI's
// `anchor` prop only works off its own trigger ref, not a raw rect/virtual element.
export function RectAnchorTrigger({ rect }: { rect: DOMRect }) {
  return (
    <PopoverButton
      aria-hidden
      as="div"
      style={{
        position: "fixed",
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
        pointerEvents: "none",
      }}
      tabIndex={-1}
    />
  );
}
