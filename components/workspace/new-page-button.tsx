"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

interface Props {
  children: React.ReactNode;
  className?: string;
  isPrivate?: boolean;
  onBeforeCreate?: () => void;
  parentId?: string;
  ref?: React.Ref<HTMLButtonElement>;
  title?: string;
  workspaceId: string;
  workspaceSlug: string;
}

export function NewPageButton({
  workspaceId,
  workspaceSlug,
  parentId,
  isPrivate,
  children,
  className,
  title,
  onBeforeCreate,
  ref,
}: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  async function handleClick() {
    if (loading) {
      return;
    }
    onBeforeCreate?.();
    setLoading(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workspaceId,
          parentId: parentId ?? null,
          title: "Untitled",
          isPrivate,
        }),
      });
      if (res.ok) {
        const page = await res.json();
        window.dispatchEvent(new CustomEvent("pages:refresh"));
        router.push(`/app/${workspaceSlug}/${page.shortId}`);
      }
    } catch {
      // no-op
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        className={className}
        disabled={loading}
        onClick={handleClick}
        onMouseEnter={(e) => {
          if (title) {
            showTooltip(title, e);
          }
        }}
        onMouseLeave={hideTooltip}
        ref={ref}
        type="button"
      >
        {children}
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
