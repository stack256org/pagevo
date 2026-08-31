"use client";

import { Pencil } from "lucide-react";
import { createPortal } from "react-dom";
import { usePageDraft } from "@/components/pages/page-draft-context";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

// Read-only status echo, same pattern as PagePrivacyPill — disappears the
// instant the page is promoted (see PageDraftProvider), no refresh needed.
export function PageDraftPill() {
  const { isDraft } = usePageDraft();
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  if (!isDraft) {
    return null;
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: read-only status badge, not a control — hovering only reveals explanatory prose about the "Draft" label that is already visible. KNOWN A11Y DEBT: that prose is not reachable by keyboard or screen reader. The fix is to teach useHoverTooltip focus/blur + aria-describedby, not to put tabIndex on a passive badge — that would add a tab stop with no action behind it. */}
      <span
        className="ml-1.5 flex shrink-0 items-center gap-1 rounded-xs border border-warning/30 bg-warning/10 px-1.5 py-0.5 text-[11px] font-semibold text-warning"
        onMouseEnter={(e) =>
          showTooltip(
            "This page is still a draft. Only you can see it for now. It will become visible to collaborators after you add a title or start writing.",
            e
          )
        }
        onMouseLeave={hideTooltip}
      >
        <Pencil size={10} />
        Draft
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
