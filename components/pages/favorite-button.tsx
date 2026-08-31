"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

interface FavoriteButtonProps {
  isFavorited: boolean;
  pageId: string;
  workspaceId: string;
}

export function FavoriteButton({
  pageId,
  workspaceId,
  isFavorited: initial,
}: FavoriteButtonProps) {
  const [favorited, setFavorited] = useState(initial);
  const [pending, setPending] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // Header isn't remounted on navigation, so re-sync state to the server value
  // whenever the page/prop changes — otherwise the star shows "one page behind".
  // biome-ignore lint/correctness/useExhaustiveDependencies: pageId is a reset trigger, not a value read here. Without it, navigating between two pages that share the same `initial` never re-runs this and a local toggle from the previous page sticks.
  useEffect(() => {
    setFavorited(initial);
  }, [pageId, initial]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (
        e as CustomEvent<{ pageId: string; isFavorited: boolean }>
      ).detail;
      if (detail?.pageId === pageId) {
        setFavorited(detail.isFavorited);
      }
    }
    window.addEventListener("pagevo:favorites-changed", handler);
    return () =>
      window.removeEventListener("pagevo:favorites-changed", handler);
  }, [pageId]);

  async function toggle() {
    if (pending) {
      return;
    }
    setPending(true);
    const next = !favorited;
    setFavorited(next);

    try {
      if (next) {
        await fetch("/api/user/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, workspaceId }),
        });
      } else {
        await fetch(`/api/user/favorites/${pageId}`, { method: "DELETE" });
      }
      window.dispatchEvent(
        new CustomEvent("pagevo:favorites-changed", {
          detail: { pageId, isFavorited: next },
        })
      );
    } catch {
      setFavorited(!next); // revert on error
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        className={`flex size-7 items-center justify-center rounded-sm transition-colors disabled:opacity-50 ${
          favorited
            ? "text-warning hover:bg-warning/10"
            : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
        }`}
        disabled={pending}
        onClick={toggle}
        onMouseEnter={(e) =>
          showTooltip(
            favorited ? "Remove from favorites" : "Add to favorites",
            e
          )
        }
        onMouseLeave={hideTooltip}
        type="button"
      >
        <Star fill={favorited ? "currentColor" : "none"} size={16} />
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
