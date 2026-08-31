"use client";

import { createPortal } from "react-dom";
import { Badge } from "@/components/ui/badge";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

interface Props {
  action: string;
  hasMeta: boolean;
  label: string;
  pillClass: string;
}

// Extracted as its own client component because the parent audit page is an
// async server component (direct db access) — the hover-tooltip hook needs
// a client boundary of its own.
export function AuditActionPill({ action, label, pillClass, hasMeta }: Props) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  return (
    <>
      <Badge
        className={`max-w-full truncate ${pillClass}`}
        onMouseEnter={(e) => {
          if (!hasMeta) {
            showTooltip(action, e);
          }
        }}
        onMouseLeave={hideTooltip}
        variant="outline"
      >
        {label}
      </Badge>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
