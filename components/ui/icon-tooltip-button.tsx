"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconTooltip } from "@/components/ui/icon-tooltip";

interface Props {
  icon: React.ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  /** Overrides the default sizing/color classes — for call sites that need
   *  to match an existing surrounding button style exactly. */
  className?: string;
  /** "below" for anchors near the top of a tightly-stacked list, where
   *  "above" (the default) would land on the previous row's content. */
  placement?: "above" | "below";
}

// Compact icon-only row action with a hover tooltip (via the app's own
// IconTooltip, not the shadcn dark-pill Tooltip) — used to keep action
// columns narrow enough that tables don't need horizontal scroll.
export function IconTooltipButton({ icon, label, href, onClick, danger, className: classNameProp, placement }: Props) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  // rect is a `position: fixed` portal anchor snapshotted once on hover —
  // dismiss it on scroll instead of repositioning, since this button can sit
  // inside any scrollable container (tables, panels, etc.).
  useEffect(() => {
    if (!rect) return;
    function handleScroll() { setRect(null); }
    document.addEventListener("scroll", handleScroll, true);
    return () => document.removeEventListener("scroll", handleScroll, true);
  }, [rect]);

  const className = classNameProp ?? `flex size-7 items-center justify-center rounded-xs transition-colors duration-150 ${
    danger
      ? "text-base-content/70 hover:bg-error/10 hover:text-error"
      : "text-base-content/70 hover:bg-base-200 hover:text-base-content"
  }`;

  const handlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => setRect(e.currentTarget.getBoundingClientRect()),
    onMouseLeave: () => setRect(null),
  };

  const tooltip = rect && typeof document !== "undefined"
    ? createPortal(<IconTooltip rect={rect} label={label} placement={placement} />, document.body)
    : null;

  if (href) {
    return (
      <Link href={href} aria-label={label} className={className} {...handlers}>
        {icon}
        {tooltip}
      </Link>
    );
  }

  return (
    <button type="button" aria-label={label} onClick={onClick} className={className} {...handlers}>
      {icon}
      {tooltip}
    </button>
  );
}
