"use client";

import { Link } from "lucide-react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { usePagePrivacy } from "@/components/pages/page-privacy-context";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

interface Props {
  pageId: string;
}

// Warns instead of a plain toast when the page is invite-only; "Give access"
// opens ShareButton's panel via a window event since it's a sibling component.
export function CopyLinkButton({ pageId }: Props) {
  const { isPrivate } = usePagePrivacy();
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    hideTooltip();

    if (isPrivate) {
      toast.warning("Link copied, but only you can open it", {
        description: "Give people access before sharing.",
        position: "bottom-center",
        duration: 6000,
        action: {
          label: "Give access",
          onClick: () =>
            window.dispatchEvent(
              new CustomEvent("pagevo:open-share", { detail: { pageId } })
            ),
        },
      });
    } else {
      toast.success("Link copied to clipboard", {
        position: "bottom-center",
        duration: 2500,
      });
    }
  }

  return (
    <>
      <button
        aria-label="Copy link"
        className="flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
        onClick={copyLink}
        onMouseEnter={(e) => showTooltip("Copy link", e)}
        onMouseLeave={hideTooltip}
        type="button"
      >
        <Link size={15} />
      </button>

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}
