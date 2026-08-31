"use client";

import type { Editor } from "@tiptap/react";
import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { onCommentsChanged } from "@/lib/comments/comment-events";
import { getClampedLeft } from "@/lib/ui/clamp-to-viewport";
import type { DbBlock } from "./serializer";

const INDICATOR_WIDTH = 52;
const INDICATOR_HEIGHT = 20;

interface BlockCount {
  blockId: string;
  count: number;
}
interface Indicator {
  blockId: string;
  count: number;
  inView: boolean;
  left: number;
  top: number;
}

// Badges are `position: fixed`, so clamping needs the editor's own scroll container (not window)
// or a scrolled-out block would still paint its badge over the topbar.
function getScrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(p).overflowY)) {
      return p;
    }
    p = p.parentElement;
  }
  return null;
}

interface Props {
  activeBlockId: string | null;
  blocksRef: React.MutableRefObject<DbBlock[]>;
  editor: Editor;
  onOpen: (blockId: string) => void;
  pageId: string;
  refresh: number;
}

export function CommentGutter({
  pageId,
  editor,
  blocksRef,
  onOpen,
  activeBlockId,
}: Props) {
  const [counts, setCounts] = useState<BlockCount[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([]);

  // Keep counts accessible inside stable callbacks without recreating them
  const countsRef = useRef<BlockCount[]>([]);
  countsRef.current = counts;

  // ── Fetch comment counts ──────────────────────────────────────────────────
  const fetchCounts = useCallback(() => {
    fetch(`/api/pages/${pageId}/comments`)
      .then((r) => r.json())
      .then((data) => {
        const map = new Map<string, number>();
        for (const t of (data.comments ?? []) as Array<{
          blockId: string | null;
          isResolved: boolean;
          deletedAt: string | null;
        }>) {
          if (t.blockId && !t.isResolved && !t.deletedAt) {
            map.set(t.blockId, (map.get(t.blockId) ?? 0) + 1);
          }
        }
        setCounts(
          Array.from(map.entries()).map(([blockId, count]) => ({
            blockId,
            count,
          }))
        );
      })
      .catch(() => {});
  }, [pageId]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  // Any comment mutation anywhere on this page updates the gutter badges
  // immediately instead of waiting for the card-close refresh bump.
  useEffect(
    () => onCommentsChanged(pageId, fetchCounts),
    [pageId, fetchCounts]
  );

  // ── Stable measure — reads counts from ref, never recreated on count change ──
  const measure = useCallback(() => {
    const currentCounts = countsRef.current;

    // If no comments at all, clear indicators
    if (currentCounts.length === 0) {
      setIndicators([]);
      return;
    }

    const editorEl = editor.view.dom as HTMLElement;
    const editorRect = editorEl.getBoundingClientRect();
    const rawLeft = editorRect.right + 16;
    const left = getClampedLeft(
      {
        top: editorRect.top,
        bottom: editorRect.bottom,
        left: rawLeft,
        right: rawLeft,
      },
      INDICATOR_WIDTH
    );
    const result: Indicator[] = [];

    // Visible band = the editor's scrollport clipped to the viewport. Badges
    // outside it are kept in state (so their positions stay warm) but not
    // painted — see `inView` below.
    const scrollRect = getScrollParent(editorEl)?.getBoundingClientRect();
    const bandTop = Math.max(scrollRect?.top ?? 0, 0);
    const bandBottom = Math.min(
      scrollRect?.bottom ?? window.innerHeight,
      window.innerHeight
    );

    const sorted = [...blocksRef.current].sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    const idToIdx = new Map<string, number>(sorted.map((b, i) => [b.id, i]));
    // Counts blocks we successfully located, regardless of whether they're
    // currently on screen — the "don't wipe on partial failure" guard below
    // keys off this, so scrolling every badge out of view no longer looks
    // like a failed measure.
    let located = 0;

    for (const { blockId, count } of currentCounts) {
      const blockIdx = idToIdx.get(blockId);
      if (blockIdx === undefined) {
        continue;
      }

      // Find the document offset for the nth top-level block
      let nodeOffset: number | null = null;
      editor.state.doc.forEach((_node, offset, docIdx) => {
        if (docIdx === blockIdx) {
          nodeOffset = offset;
        }
      });
      if (nodeOffset === null) {
        continue;
      }

      try {
        const domInfo = editor.view.domAtPos(nodeOffset + 1);
        let el = domInfo.node as HTMLElement;
        if (el.nodeType === Node.TEXT_NODE) {
          el = el.parentElement!;
        }
        while (el.parentElement && el.parentElement !== editorEl) {
          el = el.parentElement;
        }
        const rect = el.getBoundingClientRect();
        const top = rect.top + rect.height / 2 - 10;
        located++;
        const inView =
          // Not below the editor's bottom edge (avoids overlapping page-level comments)
          top <= editorRect.bottom - 10 &&
          // ...and fully inside the scrollport, so badges never paint over the topbar
          top >= bandTop &&
          top + INDICATOR_HEIGHT <= bandBottom;
        result.push({ blockId, count, top, left, inView });
      } catch {
        /* skip this block, don't wipe others */
      }
    }

    // Only update indicators when we located something — never wipe on partial
    // failure (if nothing located, ALL blocks failed to measure — keep old positions)
    if (located > 0) {
      setIndicators(result);
    }
  }, [editor, blocksRef]); // counts is intentionally NOT a dep — we use countsRef

  // ── Re-measure whenever counts change ────────────────────────────────────
  useEffect(() => {
    // countsRef is already updated via the assignment above; run measure now
    measure();
  }, [measure]);

  // ── Register stable event listeners (measure never changes) ──────────────
  useEffect(() => {
    // Use requestAnimationFrame to debounce rapid editor-update calls
    let rafId = 0;
    function debouncedMeasure() {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    }

    editor.on("update", debouncedMeasure);
    // Capture phase: `scroll` doesn't bubble, and the editor lives inside its
    // own `overflow-y-auto` container — a plain window listener never hears
    // that one, which would leave these fixed-position badges stranded at
    // stale coordinates while the content moves under them.
    document.addEventListener("scroll", debouncedMeasure, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", debouncedMeasure, { passive: true });

    // Initial measure
    measure();

    return () => {
      cancelAnimationFrame(rafId);
      editor.off("update", debouncedMeasure);
      document.removeEventListener("scroll", debouncedMeasure, {
        capture: true,
      });
      window.removeEventListener("resize", debouncedMeasure);
    };
  }, [editor, measure]); // stable — measure doesn't change anymore

  // ── Render ────────────────────────────────────────────────────────────────
  // Every commented block shows its badge (not just hover) so comments stay visible without
  // sweeping the mouse; the currently-open block and off-screen badges are filtered out.
  const visible = indicators.filter(
    (i) => i.blockId !== activeBlockId && i.inView
  );

  if (visible.length === 0 || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    visible.map(({ blockId, count, top, left }) => (
      <button
        className="flex items-center gap-1 px-1.5 py-0.5 text-xs font-medium text-base-content/70 bg-base-200 border border-base-300 rounded-xs hover:bg-base-200 hover:text-base-content transition-colors duration-150"
        key={blockId}
        onClick={() => onOpen(blockId)}
        style={{ position: "fixed", top, left, zIndex: 100 }}
        type="button"
      >
        <MessageSquare size={10} />
        {count}
      </button>
    )),
    document.body
  );
}
