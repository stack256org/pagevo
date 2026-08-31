"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import { Fragment, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { NodeSelection } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import type { Editor } from "@tiptap/react";
import { Copy, GripVertical, MessageSquare, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

// ProseMirror types `view.dragging` as `{ slice, move } | null`, but its drop
// handler also reads an undocumented `node` field (see handleDragStart). Widen
// just that property rather than casting the whole view to `any`.
type ViewWithDragging = Omit<EditorView, "dragging"> & {
  dragging: { slice: Slice; move: boolean; node?: NodeSelection } | null;
};

interface BlockInfo {
  // True when the editor sits inside a narrow fixed-position panel (e.g. the
  // database entry side panel) that doesn't have the ~58px of margin the full
  // "+" and grip pair needs — see computeHandleLeft below. Drives hiding the
  // "+" button so the remaining grip alone still fits without covering text.
  compact: boolean;
  // Grip button's rendered size in px — GRIP_W normally, shrunk down when even
  // the compact single-grip layout doesn't have GRIP_W + 2*EDGE_GAP to spare
  // (see computeHandleLeft).
  gripSize: number;
  left: number;
  nodePos: number;
  nodeSize: number;
  top: number;
}

const GRIP_W = 20;
const MIN_GRIP = 10; // smallest the grip will shrink to before it'd be too small to hit
const EDGE_GAP = 2; // breathing room kept from both the boundary and the block's own text

// Clamp the handle to the most restrictive ancestor boundary (fixed panel edge or
// bordered card edge) so narrow panels don't get the handle overlapping their own edge or the block's text.
function getHandleLeftBoundary(editorEl: HTMLElement): {
  boundary: number;
  compact: boolean;
} {
  let boundary = 8; // fallback: viewport margin, used when nothing constrains us
  let compact = false;
  let el: HTMLElement | null = editorEl.parentElement;
  while (el && el !== document.body) {
    const cs = getComputedStyle(el);
    const isFixed = cs.position === "fixed";
    const borderW = Number.parseFloat(cs.borderLeftWidth) || 0;
    const hasLeftBorder = borderW > 0 && cs.borderLeftStyle !== "none";
    if (isFixed || hasLeftBorder) {
      const rect = el.getBoundingClientRect();
      const edge = isFixed ? rect.left + 8 : rect.left + borderW;
      if (!compact || edge > boundary) {
        boundary = edge;
      }
      compact = true;
    }
    if (isFixed) {
      break;
    }
    el = el.parentElement;
  }
  return { boundary, compact };
}

function computeHandleLeft(
  editorEl: HTMLElement,
  blockLeft: number
): { left: number; compact: boolean; gripSize: number } {
  const { boundary, compact } = getHandleLeftBoundary(editorEl);
  if (!compact) {
    return {
      left: Math.max(blockLeft - 58, boundary),
      compact: false,
      gripSize: GRIP_W,
    };
  }
  // Compact mode: shrink the grip (down to MIN_GRIP) to fit between boundary and text with EDGE_GAP to spare.
  const available = blockLeft - boundary;
  const gripSize = Math.min(
    GRIP_W,
    Math.max(MIN_GRIP, available - EDGE_GAP * 2)
  );
  return { left: blockLeft - EDGE_GAP - gripSize, compact: true, gripSize };
}

// Resolve the hovered block via DOM traversal + view.nodeDOM rather than posAtCoords/posAtDOM,
// which resolve ambiguously (snapping to the next node) over atom NodeViews like image/video/audio/file.
function resolveBlock(e: MouseEvent, editor: Editor): BlockInfo | null {
  const editorEl = editor.view.dom as HTMLElement;
  const er = editorEl.getBoundingClientRect();

  try {
    let el = document.elementFromPoint(
      e.clientX,
      e.clientY
    ) as HTMLElement | null;
    if (!el) {
      return null;
    }

    // Walk up until we find a direct child of the editor element
    while (el && el.parentElement !== editorEl) {
      el = el.parentElement;
    }
    if (!el || el === editorEl) {
      return null;
    }

    let nodePos = -1;
    let node: PMNode | null = null;
    let offset = 0;
    for (let i = 0; i < editor.state.doc.childCount; i++) {
      const child = editor.state.doc.child(i);
      if (editor.view.nodeDOM(offset) === el) {
        nodePos = offset;
        node = child;
        break;
      }
      offset += child.nodeSize;
    }
    if (nodePos === -1 || !node) {
      return null;
    }

    const br = el.getBoundingClientRect();
    const { left, compact, gripSize } = computeHandleLeft(editorEl, er.left);
    return {
      top: br.top + br.height / 2,
      left,
      compact,
      gripSize,
      nodePos,
      nodeSize: node.nodeSize,
    };
  } catch {
    return null;
  }
}

// Re-measures a block's rect by document position (not mouse coords) to keep the handle
// glued to it during scroll, since scroll doesn't fire mousemove.
function getBlockRect(
  editor: Editor,
  nodePos: number
): { top: number; left: number } | null {
  try {
    const editorEl = editor.view.dom as HTMLElement;
    const er = editorEl.getBoundingClientRect();
    const domInfo = editor.view.domAtPos(nodePos + 1);
    let domNode = domInfo.node as HTMLElement;
    if (domNode.nodeType === Node.TEXT_NODE) {
      domNode = domNode.parentElement!;
    }
    while (domNode.parentElement && domNode.parentElement !== editorEl) {
      domNode = domNode.parentElement;
    }
    const br = domNode.getBoundingClientRect();
    return {
      top: br.top + br.height / 2,
      left: computeHandleLeft(editorEl, er.left).left,
    };
  } catch {
    return null;
  }
}

export function BlockHandle({
  editor,
  onComment,
}: {
  editor: Editor;
  onComment?: (nodePos: number, absoluteY: number) => void;
}) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const [block, setBlock] = useState<BlockInfo | null>(null);

  // Mirrors Menu's open state (no controlled prop, only render-prop — see
  // MenuOpenSync) so hover/scroll-tracking effects below can keep freezing while a menu is open.
  const menuOpenRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );
  // Tracks whether the last interaction was a drag so we don't also open the menu.
  const wasDragRef = useRef(false);
  // Set the instant mousedown lands on the grip (not just once native dragstart
  // fires) — see the mousemove effect below for why the earlier window matters.
  const dragIntentRef = useRef(false);

  // Native HTML5 drag needs the mousedown-ed element to stay put until dragstart fires; freeze
  // mousemove tracking from mousedown (not just dragstart) so resolveBlock can't reposition the grip mid-gesture and silently kill the drag.
  useEffect(() => {
    function onUp() {
      dragIntentRef.current = false;
    }
    document.addEventListener("mouseup", onUp);
    return () => document.removeEventListener("mouseup", onUp);
  }, []);

  // ── Document mousemove ────────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (menuOpenRef.current || dragIntentRef.current) {
        return;
      }

      const editorEl = editor.view.dom as HTMLElement;
      const er = editorEl.getBoundingClientRect();

      const inSafeZone =
        e.clientX >= er.left - 90 &&
        e.clientX <= er.right &&
        e.clientY >= er.top - 10 &&
        e.clientY <= er.bottom + 10;

      if (!inSafeZone) {
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => {
          if (!menuOpenRef.current && !dragIntentRef.current) {
            setBlock(null);
          }
        }, 600);
        return;
      }

      clearTimeout(hideTimer.current);

      // Only reposition when cursor is over the actual editor area
      const overEditor =
        e.clientX >= er.left &&
        e.clientX <= er.right &&
        e.clientY >= er.top &&
        e.clientY <= er.bottom;
      if (!overEditor) {
        return;
      }

      const info = resolveBlock(e, editor);
      if (info) {
        setBlock(info);
      }
    };

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      clearTimeout(hideTimer.current);
    };
  }, [editor]);

  // ── Keep the handle glued to its block while scrolling ────────────────────
  // Scroll events don't fire mousemove, and the handle's ancestor scroll
  // containers (e.g. #page-scroll-container) don't bubble scroll to window,
  // so listen with capture on document to catch scrolling on any ancestor.
  useEffect(() => {
    const onScroll = () => {
      if (menuOpenRef.current || dragIntentRef.current) {
        return;
      }
      setBlock((prev) => {
        if (!prev) {
          return prev;
        }
        const rect = getBlockRect(editor, prev.nodePos);
        if (!rect) {
          return null;
        }

        const editorEl = editor.view.dom as HTMLElement;
        const er = editorEl.getBoundingClientRect();
        if (rect.top < er.top - 10 || rect.top > er.bottom + 10) {
          return null;
        }

        return { ...prev, top: rect.top, left: rect.left };
      });
    };

    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [editor]);

  // ── Block actions ──────────────────────────────────────────────────────────
  // Closing the dropdown is Headless UI's job now (any MenuItem click closes the Menu automatically).
  const deleteBlock = useCallback(() => {
    if (!block) {
      return;
    }
    const { nodePos, nodeSize } = block;
    setBlock(null);
    editor.commands.command(({ tr }) => {
      tr.delete(nodePos, nodePos + nodeSize);
      return true;
    });
  }, [editor, block]);

  const duplicateBlock = useCallback(() => {
    if (!block) {
      return;
    }
    const node = editor.state.doc.nodeAt(block.nodePos);
    if (!node) {
      return;
    }
    editor.commands.command(({ tr }) => {
      tr.insert(block.nodePos + block.nodeSize, node);
      return true;
    });
  }, [editor, block]);

  // Inserts a new empty paragraph below the block (or above, on Alt-click),
  // then types "/" into it — reusing the existing slash-command menu instead
  // of building a second block-type picker for this button.
  const insertBlock = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!block) {
        return;
      }
      const insertPos = e.altKey
        ? block.nodePos
        : block.nodePos + block.nodeSize;
      editor
        .chain()
        .focus()
        .insertContentAt(insertPos, { type: "paragraph" })
        .setTextSelection(insertPos + 1)
        .insertContent("/")
        .run();
      setBlock(null);
    },
    [editor, block]
  );

  const commentBlock = useCallback(() => {
    if (!block || !onComment) {
      return;
    }
    onComment(block.nodePos, block.top);
  }, [block, onComment]);

  // ── Drag handlers ─────────────────────────────────────────────────────────
  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      if (!block) {
        e.preventDefault();
        return;
      }

      const view = editor.view;
      const node = view.state.doc.nodeAt(block.nodePos);
      if (!node) {
        e.preventDefault();
        return;
      }

      wasDragRef.current = true;

      // Select the source node — mirrors what a real in-editor drag would leave
      // selected — and re-focus the editor, since mousedown on the grip (rendered
      // in a portal outside the editor DOM) steals browser focus away from it.
      const nodeSel = NodeSelection.create(view.state.doc, block.nodePos);
      view.dispatch(
        view.state.tr.setSelection(nodeSel).setMeta("addToHistory", false)
      );
      view.dom.focus();

      // Set view.dragging manually since this drag starts on a portal-rendered button, not view.dom.
      // Passing `node` (undocumented but read by PM's drop handler) makes delete-on-drop use the node's own mapped position instead of the live selection.
      const slice = new Slice(Fragment.from(node), 0, 0);
      (view as ViewWithDragging).dragging = {
        slice,
        move: true,
        node: nodeSel,
      };

      e.dataTransfer.effectAllowed = "move";

      // Minimal ghost image so the browser doesn't try to snapshot the portal element.
      const ghost = document.createElement("div");
      ghost.style.cssText =
        "position:absolute;top:-9999px;left:-9999px;" +
        "background:var(--color-base-100);border:1px solid var(--color-base-300);border-radius:6px;" +
        "padding:4px 10px;font-size:13px;color:var(--color-base-content);" +
        "max-width:260px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;";
      ghost.textContent = node.textContent.trim().slice(0, 80) || "Block";
      document.body.appendChild(ghost);
      e.dataTransfer.setDragImage(ghost, 12, 12);
      requestAnimationFrame(() => ghost.remove());
    },
    [block, editor]
  );

  const handleDragEnd = useCallback(
    (e: React.DragEvent<HTMLButtonElement>) => {
      // If the drag was cancelled (Escape / drop outside editor), clear manually.
      if (e.dataTransfer.dropEffect === "none") {
        (editor.view as ViewWithDragging).dragging = null;
      }
      setTimeout(() => {
        wasDragRef.current = false;
      }, 100);
    },
    [editor]
  );

  if (!block || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <>
      <div
        style={{
          position: "fixed",
          top: block.top,
          left: block.left,
          transform: "translateY(-50%)",
          zIndex: 9999,
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* + — insert a new block below (Alt-click: above). Hidden in compact
       mode (narrow fixed panels) — there isn't room for both buttons without
       the pair covering the block's own text. */}
        {!block.compact && (
          <button
            className="flex h-6 w-5 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content/70"
            onClick={insertBlock}
            onMouseEnter={(e) =>
              showTooltip("Click to add below · Alt-click to add above", e)
            }
            onMouseLeave={hideTooltip}
            type="button"
          >
            <Plus size={14} />
          </button>
        )}

        {/* ⠿ grip — drag to reorder, click to open block menu. The grip button
       IS the Headless UI MenuButton (drag props forwarded straight onto it)
       so a click on it is never mistaken for an "outside" click by the
       Menu's own dismiss logic — no separate hidden trigger needed. */}
        <Menu>
          {({ open }) => (
            <MenuOpenSync
              onOpenChange={(o) => {
                menuOpenRef.current = o;
              }}
              open={open}
            >
              <MenuButton
                className="flex h-6 shrink-0 cursor-grab items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content/70 active:cursor-grabbing data-open:bg-base-200 data-open:text-base-content"
                draggable
                onClick={(e) => {
                  // Ignore click if tail-end of a drag — Headless UI merges this handler with its own
                  // open/close toggle and skips it once the event is marked prevented.
                  if (wasDragRef.current) {
                    e.preventDefault();
                  }
                }}
                onDragEnd={handleDragEnd}
                onDragStart={handleDragStart}
                onMouseDown={(e) => {
                  // Do NOT preventDefault here — it blocks the browser's dragstart sequence.
                  // Editor focus is restored automatically after drag ends.
                  e.stopPropagation();
                  dragIntentRef.current = true;
                  // A hide timer may already be pending from just before mousedown; clear it here too
                  // since the guard above only stops new timers, not one in flight (would unmount this button mid-gesture).
                  clearTimeout(hideTimer.current);
                }}
                onMouseEnter={(e) =>
                  showTooltip("Drag to reorder · Click for options", e)
                }
                onMouseLeave={hideTooltip}
                style={{ width: block.gripSize }}
              >
                <GripVertical
                  size={Math.max(10, Math.min(14, block.gripSize - 2))}
                />
              </MenuButton>
              <MenuItems
                anchor={{ to: "right start", gap: 4 }}
                className="z-9999 w-44 overflow-hidden rounded-sm border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                transition
              >
                {onComment && (
                  <MenuItem>
                    <button
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-base-content transition-colors duration-150 data-focus:bg-base-200"
                      onClick={commentBlock}
                      onMouseDown={(e) => e.preventDefault()}
                      type="button"
                    >
                      <MessageSquare
                        className="shrink-0 text-base-content/70"
                        size={14}
                      />
                      Comment
                    </button>
                  </MenuItem>
                )}

                <MenuItem>
                  <button
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-base-content transition-colors data-focus:bg-base-200"
                    onClick={duplicateBlock}
                    onMouseDown={(e) => e.preventDefault()}
                    type="button"
                  >
                    <Copy className="shrink-0 text-base-content/70" size={14} />
                    Duplicate
                  </button>
                </MenuItem>

                <div className="mx-2 my-0.5 h-px bg-base-300" />

                <MenuItem>
                  <button
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-sm text-error transition-colors duration-150 data-focus:bg-error/10"
                    onClick={deleteBlock}
                    onMouseDown={(e) => e.preventDefault()}
                    type="button"
                  >
                    <Trash2 className="shrink-0" size={14} />
                    Delete
                  </button>
                </MenuItem>
              </MenuItems>
            </MenuOpenSync>
          )}
        </Menu>
      </div>
      {tooltip && (
        <IconTooltip
          label={tooltip.label}
          minLeft={
            getHandleLeftBoundary(editor.view.dom as HTMLElement).boundary
          }
          rect={tooltip.rect}
        />
      )}
    </>,
    document.body
  );
}

// Mirrors a Menu's open state up via callback — Menu has no controlled open prop, only a
// render-prop, and calling hooks inside that render-prop would violate rules-of-hooks.
function MenuOpenSync({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    onOpenChange(open);
    return () => onOpenChange(false);
  }, [open, onOpenChange]);
  return <>{children}</>;
}
