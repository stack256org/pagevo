"use client";

import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

// Extracted as its own client component because the parent analytics page is
// an async server component (direct db access) — the hover-tooltip hook
// needs a client boundary of its own.
export function TruncatedNameLabel({ name }: { name: string }) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: passive label, not a control — the hover tooltip only re-shows `name`, which is already this element's text content and is truncated by CSS only, so assistive tech reads it in full regardless. Making the span focusable would add a tab stop that exposes nothing new. */}
      <span
        className="w-32 shrink-0 truncate text-xs font-medium text-base-content/80"
        onMouseEnter={(e) => showTooltip(name, e)}
        onMouseLeave={hideTooltip}
      >
        {name}
      </span>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
