"use client";

import { Lock } from "lucide-react";
import { createPortal } from "react-dom";
import { usePagePrivacy } from "@/components/pages/page-privacy-context";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

// Read-only status echo, not a second control — matches Notion, which only
// ever shows this next to the title when access is "Only people invited";
// it disappears for the workspace-wide and public-link tiers. The one real
// control for all three tiers is the Share panel's "General access" picker.
export function PagePrivacyPill() {
  const { isPrivate } = usePagePrivacy();
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  if (!isPrivate) {
    return null;
  }

  return (
    <>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions: read-only status badge, not a control — hovering only reveals explanatory prose about the "Private" label that is already visible. KNOWN A11Y DEBT: that prose is not reachable by keyboard or screen reader. The fix is to teach useHoverTooltip focus/blur + aria-describedby, not to put tabIndex on a passive badge — that would add a tab stop with no action behind it. */}
      <span
        className="ml-1.5 flex shrink-0 items-center gap-1 rounded-xs border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary"
        onMouseEnter={(e) =>
          showTooltip("Only you and invited people can open this page", e)
        }
        onMouseLeave={hideTooltip}
      >
        <Lock size={10} />
        Private
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
