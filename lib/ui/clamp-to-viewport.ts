/**
 * Positioning math for hand-rolled `position: fixed` popups (anchored via getBoundingClientRect(), not Radix/shadcn).
 * Flips to the side with room instead of rendering off-screen near viewport edges.
 */

export interface AnchorRect {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const DEFAULT_GAP = 6;
const DEFAULT_MARGIN = 8;

/**
 * Vertical position below `anchor`; flips above if it doesn't fit below and there's more room above.
 */
export function getClampedTop(
  anchor: AnchorRect,
  popupHeight: number,
  {
    gap = DEFAULT_GAP,
    margin = DEFAULT_MARGIN,
  }: { gap?: number; margin?: number } = {}
): number {
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;

  const below = anchor.bottom + gap;
  if (below + popupHeight <= vh - margin) {
    return below;
  }

  const spaceAbove = anchor.top;
  const spaceBelow = vh - anchor.bottom;
  if (spaceAbove > spaceBelow) {
    return Math.max(margin, anchor.top - gap - popupHeight);
  }
  return Math.max(margin, Math.min(below, vh - margin - popupHeight));
}

/**
 * Horizontal position for `anchor`; align "start"/"end" matches left or right edges, clamped to viewport.
 */
export function getClampedLeft(
  anchor: AnchorRect,
  popupWidth: number,
  {
    align = "start",
    margin = DEFAULT_MARGIN,
  }: { align?: "start" | "end"; margin?: number } = {}
): number {
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;

  let left = align === "end" ? anchor.right - popupWidth : anchor.left;
  if (left + popupWidth > vw - margin) {
    left = vw - margin - popupWidth;
  }
  if (left < margin) {
    left = margin;
  }
  return left;
}

/** Convenience wrapper for popups that need both axes clamped at once. */
export function getClampedPosition(
  anchor: AnchorRect,
  size: { width: number; height: number },
  opts: { gap?: number; margin?: number; align?: "start" | "end" } = {}
): { top: number; left: number } {
  return {
    top: getClampedTop(anchor, size.height, opts),
    left: getClampedLeft(anchor, size.width, opts),
  };
}
