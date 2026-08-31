"use client";

import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  RotateCcw as ArrowCounterClockwiseIcon,
  BellOff as BellSlashIcon,
  MessageSquare as ChatTextIcon,
  Check as CheckIcon,
  MoreHorizontal as DotsThreeIcon,
  Download,
  Mail as EnvelopeIcon,
  ExternalLink,
  FileText as FileIcon,
  Link as LinkIcon,
  Paperclip,
  Pencil as PencilSimpleIcon,
  Reply as ReplyIcon,
  Smile as SmileyIcon,
  Trash2 as TrashIcon,
  X as XIcon,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CommentComposer } from "@/components/editor/comment-composer";
import { EmojiGridPicker } from "@/components/pages/emoji-grid-picker";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";
import { ReactionTooltip } from "@/components/ui/reaction-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { emitCommentsChanged } from "@/lib/comments/comment-events";
import {
  formatReactionTooltip,
  formatReactorNames,
} from "@/lib/comments/format-reaction-tooltip";

// ---------- Types ----------

interface CommentAuthor {
  id: string | null;
  image: string | null;
  name: string | null;
}

interface CommentReply {
  author: CommentAuthor | null;
  blockId: string | null;
  content: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  isOrphaned: boolean;
  isResolved: boolean;
  parentId: string | null;
  reactions: Record<string, string[]>;
}

interface CommentThread {
  anchorEnd: number | null;
  anchorStart: number | null;
  author: CommentAuthor | null;
  blockId: string | null;
  content: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  isOrphaned: boolean;
  isResolved: boolean;
  parentId: string | null;
  // Set when this thread was opened from a database property cell (e.g. the
  // "Category" column) rather than the whole page — these are shown in their
  // own property-scoped popover (CellCommentPopover), never in this card's
  // page-level/block-level lists.
  propertyId: string | null;
  reactions: Record<string, string[]>;
  replies: CommentReply[];
  threadNumber: number | null;
}

interface CommentsData {
  comments: CommentThread[];
  // Reactions only carry reactor user IDs — this resolves them to display
  // names for the "X reacted with 😀" hover tooltip (see format-reaction-tooltip.ts).
  reactionUsers?: Record<string, string | null>;
  totalCount: number;
  unresolvedCount: number;
}

// ---------- Helpers ----------

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) {
    return "just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) {
    return `${hrs}h ago`;
  }
  const days = Math.floor(hrs / 24);
  if (days < 7) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// ---------- Image Lightbox ----------

const ZOOM_MIN = 25;
const ZOOM_MAX = 400;
const ZOOM_STEP = 25;
const WHEEL_SENSITIVITY = 0.2; // zoom-percent per deltaY unit

// data: URIs are blobbed first (some browsers ignore `download` on large data: URIs). Real
// http(s) src goes through /api/attachments/download since `download` is silently ignored cross-origin (S3/CDN).
function downloadImage(src: string, filename: string) {
  if (src.startsWith("data:")) {
    fetch(src)
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      });
    return;
  }
  const a = document.createElement("a");
  a.href = `/api/attachments/download?${new URLSearchParams({ url: src, name: filename })}`;
  a.download = filename;
  a.click();
}

// Clamps pan so the image edge is always reachable but never draggable past; mirrors object-contain's
// fit math so the clamp matches what's actually rendered at zoom 100.
function clampPan(
  pan: { x: number; y: number },
  zoomPct: number,
  natural: { w: number; h: number } | null,
  container: HTMLElement | null
): { x: number; y: number } {
  if (!natural || !container) {
    return { x: 0, y: 0 };
  }
  const rect = container.getBoundingClientRect();
  const fitScale = Math.min(rect.width / natural.w, rect.height / natural.h, 1);
  const scaledW = natural.w * fitScale * (zoomPct / 100);
  const scaledH = natural.h * fitScale * (zoomPct / 100);
  const maxX = Math.max(0, (scaledW - rect.width) / 2);
  const maxY = Math.max(0, (scaledH - rect.height) / 2);
  return {
    x: Math.min(maxX, Math.max(-maxX, pan.x)),
    y: Math.min(maxY, Math.max(-maxY, pan.y)),
  };
}

export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  // Locks page scroll behind the overlay for the same reason every other
  // modal in this app does — but also doubles as what makes wheel-to-zoom
  // safe: this listener's own preventDefault (passive: false) stops the
  // native scroll, so the plain onWheel below never has to fight for it.
  useScrollLockWhileOpen(true, () => false);

  const filename = alt || "image";

  function applyZoom(nextZoom: number) {
    const clampedZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, nextZoom));
    setZoom(clampedZoom);
    setPan((p) => clampPan(p, clampedZoom, natural, containerRef.current));
  }

  function onWheel(e: React.WheelEvent) {
    applyZoom(zoom - e.deltaY * WHEEL_SENSITIVITY);
  }

  function onPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (zoom <= 100) {
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  }

  function onPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    if (!dragging) {
      return;
    }
    const { mouseX, mouseY, panX, panY } = dragStartRef.current;
    setPan(
      clampPan(
        { x: panX + (e.clientX - mouseX), y: panY + (e.clientY - mouseY) },
        zoom,
        natural,
        containerRef.current
      )
    );
  }

  function onPointerUp(e: React.PointerEvent<HTMLImageElement>) {
    if (!dragging) {
      return;
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  }

  function onDoubleClick() {
    if (zoom > 100) {
      applyZoom(100);
    } else {
      setZoom(200);
      setPan({ x: 0, y: 0 }); // double-click always re-centers before zooming in
    }
  }

  if (typeof document === "undefined") {
    return null;
  }
  return createPortal(
    <div
      className="fixed inset-0 z-9999 flex flex-col bg-base-200"
      data-comment-exempt
      style={{ pointerEvents: "auto" }} // see EmojiPicker's comment — required inside a modal Sheet/Dialog
    >
      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-base-300 bg-base-100 px-4">
        <div className="flex min-w-0 items-center gap-2">
          <FileIcon className="shrink-0 text-base-content/70" size={15} />
          <span className="truncate text-sm font-medium text-base-content">
            {filename}
          </span>
        </div>
        <div className="flex items-center gap-0.5">
          <IconTooltipButton
            icon={<ZoomOut size={15} />}
            label="Zoom out"
            onClick={() => applyZoom(zoom - ZOOM_STEP)}
          />
          <button
            className="min-w-10.5 rounded-sm px-1.5 py-1.5 text-center text-xs font-medium text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
            onClick={() => applyZoom(100)}
            type="button"
          >
            {Math.round(zoom)}%
          </button>
          <IconTooltipButton
            icon={<ZoomIn size={15} />}
            label="Zoom in"
            onClick={() => applyZoom(zoom + ZOOM_STEP)}
          />
          <div className="mx-1 h-5 w-px bg-base-300" />
          <IconTooltipButton
            icon={<ArrowCounterClockwiseIcon size={14} />}
            label="Reset zoom"
            onClick={() => applyZoom(100)}
          />
          <div className="mx-1 h-5 w-px bg-base-300" />
          <IconTooltipButton
            icon={<Download size={15} />}
            label="Download"
            onClick={() => downloadImage(src, filename)}
          />
          <IconTooltipButton
            icon={<ExternalLink size={14} />}
            label="Open in new tab"
            onClick={() => window.open(src, "_blank", "noopener,noreferrer")}
          />
          <div className="mx-1 h-5 w-px bg-base-300" />
          <IconTooltipButton
            icon={<XIcon size={15} />}
            label="Close"
            onClick={onClose}
          />
        </div>
      </div>

      {/* Image */}
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: lightbox backdrop, not a control — clicking the empty area dismisses, and onWheel zooms. Both are pointer conveniences with keyboard equivalents already present: the Escape listener above closes the lightbox, and the visible Close button is focusable. Making the backdrop itself focusable would put a tab stop in front of the image with no distinct action. */}
      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden"
        onClick={onClose}
        onWheel={onWheel}
        ref={containerRef}
      >
        {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
        {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: pan/zoom surface inside an already-open lightbox, not a control. The handlers are a stopPropagation guard (so clicking the image does not hit the dismiss backdrop), double-click to toggle zoom, and pointer down/move/up to drag the zoomed image — continuous gestures with no single "activation" to bind a key to. Zoom and close are both reachable from the focusable buttons in the lightbox toolbar. */}
        <img
          alt={alt}
          className="max-h-full max-w-full select-none rounded-sm object-contain"
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => {
            e.stopPropagation();
            onDoubleClick();
          }}
          onLoad={(e) =>
            setNatural({
              w: e.currentTarget.naturalWidth,
              h: e.currentTarget.naturalHeight,
            })
          }
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          src={src}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
            transition: dragging ? "none" : "transform 150ms ease-out",
            cursor: zoom > 100 ? (dragging ? "grabbing" : "grab") : "default",
          }}
        />
      </div>
    </div>,
    document.body
  );
}

export function ImageAttachment({ src, alt }: { src: string; alt: string }) {
  const [open, setOpen] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  return (
    <>
      <button
        className="mt-1.5 block focus:outline-none rounded-sm"
        onClick={() => setOpen(true)}
        onMouseEnter={(e) => showTooltip("Click to preview", e)}
        onMouseLeave={hideTooltip}
        type="button"
      >
        {/* biome-ignore lint/performance/noImgElement: src is an uploaded asset served from the configured STORAGE_DRIVER (local or s3/r2 CDN); that host is not in next.config images.remotePatterns */}
        <img
          alt={alt}
          className="h-14 w-auto max-w-30 rounded-sm border border-base-300 object-cover hover:opacity-90 transition-opacity cursor-zoom-in"
          src={src}
        />
      </button>
      {open && (
        <ImageLightbox alt={alt} onClose={() => setOpen(false)} src={src} />
      )}
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </>
  );
}

export function FileAttachment({ src, name }: { src: string; name: string }) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  function handleClick() {
    if (src.startsWith("data:")) {
      fetch(src)
        .then((r) => r.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        });
    } else {
      window.open(src, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <>
      <button
        className="group mt-1.5 flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-3 py-2 transition-colors duration-150 hover:bg-base-200"
        onClick={handleClick}
        onMouseEnter={(e) => showTooltip(`Open ${name}`, e)}
        onMouseLeave={hideTooltip}
        type="button"
      >
        <Paperclip className="shrink-0 text-base-content/70" size={13} />
        <span className="max-w-45 truncate text-xs text-base-content/80 group-hover:text-base-content">
          {name}
        </span>
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

// ---------- Content renderer ----------

function renderContent(
  content: Record<string, unknown> | null
): React.ReactNode {
  if (!content) {
    return null;
  }
  const parts: React.ReactNode[] = [];
  let key = 0;

  function walk(node: unknown): void {
    if (!node || typeof node !== "object") {
      return;
    }
    const n = node as Record<string, unknown>;

    if (n.type === "text" && typeof n.text === "string") {
      parts.push(<span key={key++}>{n.text}</span>);
    }

    if (n.type === "file") {
      const attrs = n.attrs as { src?: string; name?: string } | undefined;
      if (attrs?.src && attrs?.name) {
        parts.push(
          <FileAttachment key={key++} name={attrs.name} src={attrs.src} />
        );
      }
    }

    if (n.type === "image") {
      const attrs = n.attrs as { src?: string; alt?: string } | undefined;
      if (attrs?.src) {
        const isImage =
          attrs.src.startsWith("data:image/") ||
          /\.(png|jpe?g|gif|webp|svg|avif)(\?|$)/i.test(attrs.src);
        if (isImage) {
          parts.push(
            <ImageAttachment
              alt={attrs.alt ?? "attachment"}
              key={key++}
              src={attrs.src}
            />
          );
        } else {
          parts.push(
            <FileAttachment
              key={key++}
              name={attrs.alt ?? "attachment"}
              src={attrs.src}
            />
          );
        }
      }
    }

    // cell-comment-popover.tsx's composer stores attachments as url/name/mimeType (not image/file's src/alt) —
    // still needs to render correctly wherever else the comment is viewed.
    if (n.type === "attachment") {
      const attrs = n.attrs as
        | { url?: string; name?: string; mimeType?: string }
        | undefined;
      if (attrs?.url) {
        if (attrs.mimeType?.startsWith("image/")) {
          parts.push(
            <ImageAttachment
              alt={attrs.name ?? "attachment"}
              key={key++}
              src={attrs.url}
            />
          );
        } else {
          parts.push(
            <FileAttachment
              key={key++}
              name={attrs.name ?? "attachment"}
              src={attrs.url}
            />
          );
        }
      }
    }

    if (n.type === "mention") {
      const attrs = n.attrs as
        | { mentionType?: string; label?: string }
        | undefined;
      if (attrs?.label) {
        if (attrs.mentionType === "user") {
          parts.push(
            <span
              className="text-primary font-medium bg-primary/5 rounded-xs px-0.5 mx-px"
              key={key++}
            >
              @{attrs.label}
            </span>
          );
        } else if (attrs.mentionType === "page") {
          parts.push(
            <span
              className="text-base-content/80 underline decoration-dotted cursor-pointer"
              key={key++}
            >
              📄 {attrs.label}
            </span>
          );
        } else {
          parts.push(
            <span className="text-primary font-medium" key={key++}>
              @{attrs.label}
            </span>
          );
        }
      }
    }

    if (Array.isArray(n.content)) {
      n.content.forEach(walk);
    }
  }

  walk(content);
  return <>{parts}</>;
}

function UserAvatar({
  name,
  image,
  size = 24,
}: {
  name?: string | null;
  image?: string | null;
  size?: number;
}) {
  const initial = name?.[0]?.toUpperCase() ?? "?";
  const px = `${size}px`;
  if (image) {
    return (
      // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
      <img
        alt={name ?? ""}
        className="rounded-full object-cover shrink-0"
        src={image}
        style={{ width: px, height: px }}
      />
    );
  }
  return (
    <div
      className="rounded-full bg-primary flex items-center justify-center font-semibold text-primary-content shrink-0 select-none"
      style={{ width: px, height: px, fontSize: size <= 24 ? "11px" : "13px" }}
    >
      {initial}
    </div>
  );
}

// ---------- Emoji Picker ----------
// Full searchable/categorized emoji grid (same one used for page icons),
// swapped in for the old fixed 24-emoji reaction grid.

// Popover owns open/close + outside-click/Escape with a scroll-tracking anchor (old manual
// listener/scroll-lock gone); caveat — it portals to document.body which sits outside the
// native <dialog>'s top-layer, so it could render behind the dialog (flagged, unverified).
export function EmojiPicker({
  triggerClassName,
  size = 12,
  onSelect,
  onMouseEnter,
  onMouseLeave,
}: {
  triggerClassName: string;
  size?: number;
  onSelect: (e: string) => void;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
}) {
  return (
    <Popover>
      {({ close }) => (
        <>
          <PopoverButton
            className={triggerClassName}
            onMouseEnter={onMouseEnter}
            onMouseLeave={onMouseLeave}
          >
            <SmileyIcon size={size} />
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom end", gap: 6 }}
            className="z-9999 w-88 overflow-hidden rounded-lg border border-base-300 bg-neutral transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
            data-comment-exempt
            transition
          >
            <EmojiGridPicker
              onClose={close}
              onSelect={(e) => {
                onSelect(e);
                close();
              }}
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}

// ---------- Simple Dropdown ----------

// Headless UI Menu replaces the hand-rolled trigger+portal+cloneElement combo; DropdownItem
// no longer needs a `_close` prop since MenuItem auto-closes on click.
export function SimpleDropdown({
  triggerClassName,
  triggerIcon,
  onMouseEnter,
  onMouseLeave,
  children,
}: {
  triggerClassName: string;
  triggerIcon: React.ReactNode;
  onMouseEnter?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  onMouseLeave?: () => void;
  children: React.ReactNode;
}) {
  return (
    <Menu>
      <MenuButton
        className={triggerClassName}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {triggerIcon}
      </MenuButton>
      <MenuItems
        anchor={{ to: "bottom end", gap: 4 }}
        className="z-9999 w-47 rounded-sm border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
        data-comment-exempt
        transition
      >
        {children}
      </MenuItems>
    </Menu>
  );
}

export function DropdownItem({
  children,
  onClick,
  danger,
  icon,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    // as="div" because DropdownItem doesn't forward arbitrary props (no {...rest}), so MenuItem's
    // default Fragment-merge would silently drop its role/keyboard wiring — see sidebar.tsx's New-menu for the same pattern.
    <MenuItem
      as="div"
      className={`rounded-sm ${danger ? "data-focus:bg-error/10" : "data-focus:bg-base-200"}`}
    >
      <button
        className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm transition-colors duration-150 ${
          danger
            ? "text-error hover:bg-error/10"
            : "text-base-content hover:bg-base-200"
        }`}
        onClick={onClick}
        type="button"
      >
        {icon && (
          <span
            className={`shrink-0 ${danger ? "text-error" : "text-base-content/70"}`}
          >
            {icon}
          </span>
        )}
        {children}
      </button>
    </MenuItem>
  );
}

export function DropdownSeparator() {
  return <div className="my-1 border-t border-base-300" />;
}

// ---------- CommentCard ----------

interface CommentCardProps {
  anchorEnd?: number | null;
  anchorStart?: number | null;
  /** Inline variant only — true when the section was just opened by "Add
   *  comment", so the caret starts in the composer. Left false when it
   *  renders because threads already exist, which would otherwise steal
   *  focus from the document on page load. */
  autoFocusComposer?: boolean;
  blockId: string | null;
  currentUserId: string;
  isAdmin: boolean;
  /** Fired synchronously, from an optimistic local update (no fetch round-trip),
   *  whenever resolving/reopening changes how many active threads remain in
   *  this card's scope — lets a page-level "show the comment section" toggle
   *  react instantly instead of blinking while it waits on its own refetch. */
  onActiveCountChange?: (count: number) => void;
  onClose: () => void;
  pageId: string;
  variant?: "floating" | "inline";
  workspaceId: string;
}

export function CommentCard({
  pageId,
  workspaceId,
  blockId,
  anchorStart,
  anchorEnd,
  currentUserId,
  isAdmin,
  onClose,
  variant = "floating",
  onActiveCountChange,
  autoFocusComposer = false,
}: CommentCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CommentsData | null>(null);
  const [loading, setLoading] = useState(true);

  // Flag set when posting a comment, consumed once the refetched list is committed to the DOM,
  // so the capped-height scroller scrolls to the newly posted comment instead of measuring pre-insert scrollHeight.
  const listRef = useRef<HTMLDivElement>(null);
  const scrollToNewestRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: data is a re-run trigger, not a value read here — the scroll must happen after the refetched list commits to the DOM.
  useEffect(() => {
    if (!scrollToNewestRef.current) {
      return;
    }
    scrollToNewestRef.current = false;
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [data]);

  // `background: true` skips the spinner so post/edit/delete refetches swap data in silently
  // without losing scroll position mid-conversation; a fresh load still shows the spinner.
  const loadComments = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!opts?.background) {
        setLoading(true);
      }
      try {
        const res = await fetch(`/api/pages/${pageId}/comments`);
        if (res.ok) {
          setData(await res.json());
        }
      } finally {
        setLoading(false);
      }
    },
    [pageId]
  );

  // Re-fetch when mounted OR when switching to a different block (card stays open)
  // biome-ignore lint/correctness/useExhaustiveDependencies: blockId is a reset trigger, not a value read here. loadComments is memoized on pageId, so dropping blockId means switching blocks while the card stays open never refetches.
  useEffect(() => {
    setData(null);
    loadComments();
  }, [blockId, loadComments]);

  // Close on click outside (floating only) — but NOT when clicking inside an exempt portal
  useEffect(() => {
    if (variant !== "floating") {
      return;
    }
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (cardRef.current?.contains(target)) {
        return;
      }
      if (target.closest("[data-comment-exempt]")) {
        return;
      }
      onClose();
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, variant]);

  // Close on Escape (floating only)
  useEffect(() => {
    if (variant !== "floating") {
      return;
    }
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose, variant]);

  // Page-level threads (blockId === null) exclude property-scoped comments —
  // those belong to CellCommentPopover / the property row, not this card.
  const threads = (data?.comments ?? []).filter((t) =>
    blockId ? t.blockId === blockId : !t.blockId && !t.propertyId
  );
  const nonOrphaned = threads.filter((t) => !t.isOrphaned);
  const orphaned = threads.filter((t) => t.isOrphaned);

  // Resolved threads are never shown here — matching the inline (page-level)
  // variant and Notion, where a resolved thread disappears from the block/page
  // entirely and is only ever visible via the sidebar "Comments" panel.
  const activeVisible = nonOrphaned.filter((t) => !t.isResolved);

  // Inline variant: let the user back out of a freshly-opened empty composer via Escape/outside-click
  // (matching the floating card) — guarded to no-threads + nothing typed so drafts are never discarded.
  useEffect(() => {
    if (variant !== "inline") {
      return;
    }
    if (activeVisible.length > 0 || orphaned.length > 0) {
      return;
    }
    function composerIsEmpty() {
      const ed = cardRef.current?.querySelector('[contenteditable="true"]');
      const hasText = !!ed && (ed.textContent ?? "").trim() !== "";
      const hasMedia = !!cardRef.current?.querySelector(
        '[contenteditable="true"] img'
      );
      return !hasText && !hasMedia;
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (cardRef.current?.contains(target)) {
        return;
      }
      if (target.closest("[data-comment-exempt]")) {
        return;
      }
      if (composerIsEmpty()) {
        onClose();
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && composerIsEmpty()) {
        onClose();
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [variant, activeVisible.length, orphaned.length, onClose]);

  // Reload this card's own thread list AND tell the rest of the page (header
  // badge, sidebar panel, block gutter) that something changed — without this,
  // those only pick up new comments on their next mount/poll.
  function notifyChanged() {
    loadComments({ background: true });
    emitCommentsChanged(pageId);
  }

  async function createComment(content: Record<string, unknown>) {
    await fetch(`/api/pages/${pageId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blockId: blockId ?? null,
        anchorStart: anchorStart ?? null,
        anchorEnd: anchorEnd ?? null,
        content,
      }),
    });
    // Reveal the just-posted comment: it's appended at the end of a
    // capped-height scroller, so without this it lands below the fold and the
    // user has to scroll to find what they just wrote. Chronological order is
    // kept as-is — newest-first would make an ongoing thread read backwards.
    scrollToNewestRef.current = true;
    notifyChanged();
    // Floating card closes after posting (one-off action); the inline section must NOT close here —
    // its onClose unmounts the whole section, which the parent would immediately remount, causing a list→spinner→list flicker.
    if (variant !== "inline") {
      onClose();
    }
  }

  async function createReply(
    parentId: string,
    content: Record<string, unknown>
  ) {
    await fetch(`/api/pages/${pageId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blockId: blockId ?? null, parentId, content }),
    });
    notifyChanged();
  }

  // Optimistic — no loading flash, no waiting on a refetch before the thread
  // visually resolves/reopens. Computes the new active count from the same
  // local update (not a fresh fetch) so a page-level "hide once nothing's
  // active" toggle can react in the same tick instead of trailing behind.
  function setResolvedLocally(id: string, isResolved: boolean) {
    setData((prev) => {
      if (!prev) {
        return prev;
      }
      const nextComments = prev.comments.map((t) =>
        t.id === id ? { ...t, isResolved } : t
      );
      const scoped = nextComments.filter((t) =>
        blockId ? t.blockId === blockId : !t.blockId && !t.propertyId
      );
      onActiveCountChange?.(
        scoped.filter((t) => !t.isResolved && !t.deletedAt).length
      );
      return { ...prev, comments: nextComments };
    });
  }

  // emitCommentsChanged fires AFTER the request settles — emitting before would let other
  // listeners' refetch race the still-in-flight POST and read pre-persist data.
  async function resolveThread(id: string) {
    setResolvedLocally(id, true);
    const res = await fetch(`/api/comments/${id}/resolve`, { method: "POST" });
    if (!res.ok) {
      loadComments({ background: true }); // rare failure path — fall back to a real reload
    }
    emitCommentsChanged(pageId);
  }

  async function reopenThread(id: string) {
    setResolvedLocally(id, false);
    const res = await fetch(`/api/comments/${id}/reopen`, { method: "POST" });
    if (!res.ok) {
      loadComments({ background: true });
    }
    emitCommentsChanged(pageId);
  }

  // A user's *first* reaction on a page won't be in reactionUsers yet (it's
  // only populated from ids already seen in loaded comments) — merge in the
  // reactor's resolved name the instant the react endpoint returns it, rather
  // than waiting for some other mutation to trigger a full reload.
  function mergeReactionUser(id: string, name: string | null) {
    setData((prev) =>
      prev
        ? { ...prev, reactionUsers: { ...prev.reactionUsers, [id]: name } }
        : prev
    );
  }

  // ── Inline variant — renders inside the Comments panel ───────────────────
  if (variant === "inline") {
    // Resolved threads are never shown inline here, regardless of count — same
    // as Notion, where the only place to see resolved comments is the sidebar
    // "Comments" panel's Resolved tab, not a toggle in the page flow itself.
    const inlineVisible = nonOrphaned.filter((t) => !t.isResolved);
    return (
      <div ref={cardRef}>
        {/* ── Thread list ── */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 rounded-full border-2 border-base-300 border-t-primary animate-spin" />
          </div>
        ) : (
          inlineVisible.length > 0 && (
            <div
              className="max-h-60 divide-y divide-base-300 overflow-y-auto"
              ref={listRef}
            >
              {inlineVisible.map((thread) => (
                <ThreadSection
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  key={thread.id}
                  onMutate={notifyChanged}
                  onReactionUserResolved={mergeReactionUser}
                  onReopen={reopenThread}
                  onReply={createReply}
                  onResolve={resolveThread}
                  reactionUsers={data?.reactionUsers ?? {}}
                  thread={thread}
                  workspaceId={workspaceId}
                />
              ))}
            </div>
          )
        )}

        {orphaned.length > 0 && (
          <div className="mx-4 mb-4 mt-2 rounded-md border border-warning/30 bg-warning/5 px-4 py-3">
            <p className="text-xs font-semibold text-warning mb-2">
              ⚠ Original content removed
            </p>
            {orphaned.map((thread) => (
              <div className="flex items-start gap-2 py-1.5" key={thread.id}>
                <UserAvatar
                  image={thread.author?.image}
                  name={thread.author?.name}
                />
                <p className="text-sm text-base-content/70">
                  {renderContent(thread.content)}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* ── Compose area — adds a new top-level comment, after the list ── */}
        <div
          className={`px-4 pb-4 ${inlineVisible.length > 0 ? "pt-2" : "pt-4"}`}
        >
          <CommentComposer
            autoFocus={autoFocusComposer}
            mode="new"
            onSubmit={createComment}
            placeholder="Write a comment…"
            workspaceId={workspaceId}
          />
        </div>
      </div>
    );
  }

  // ── Floating variant — block-level comment card ───────────────────────────
  // No header/close button (matches Notion) — a corner close button was tried but collided
  // with each thread's own hover action pill; Escape/outside-click close it instead.
  return (
    <div
      className="relative w-95 border border-base-300 bg-base-100 overflow-hidden"
      ref={cardRef}
      style={{ borderRadius: "var(--radius-xl)" }}
    >
      {/* Thread list */}
      <div className="max-h-100 overflow-y-auto">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="h-4 w-4 rounded-full border-2 border-base-300 border-t-primary animate-spin" />
          </div>
        )}
        {!loading && activeVisible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-lg bg-base-200/50 border border-base-300 mb-2.5">
              <ChatTextIcon className="text-base-content/70" size={20} />
            </div>
            <p className="text-sm font-medium text-base-content/70">
              No comments yet
            </p>
            <p className="text-xs text-base-content/70 mt-0.5">
              {blockId ? "Comment on this block" : "Start the conversation"}
            </p>
          </div>
        )}
        {activeVisible.map((thread) => (
          <ThreadSection
            currentUserId={currentUserId}
            isAdmin={isAdmin}
            key={thread.id}
            onMutate={notifyChanged}
            onReactionUserResolved={mergeReactionUser}
            onReopen={reopenThread}
            onReply={createReply}
            onResolve={resolveThread}
            reactionUsers={data?.reactionUsers ?? {}}
            thread={thread}
            workspaceId={workspaceId}
          />
        ))}
        {orphaned.length > 0 && (
          <div className="border-t border-base-300 px-4 pt-2 pb-3">
            <p className="text-xs font-medium text-warning mb-2">
              ⚠ Original content removed
            </p>
            {orphaned.map((thread) => (
              <div className="flex items-start gap-2 py-1.5" key={thread.id}>
                <UserAvatar
                  image={thread.author?.image}
                  name={thread.author?.name}
                />
                <p className="text-sm text-base-content/70">
                  {renderContent(thread.content)}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer — autofocused because this card only ever opens as a
       deliberate "leave a comment here" action, so the caret should already
       be waiting in the box rather than costing a second click. */}
      <div className="border-t border-base-300 bg-base-200/10 px-3 py-2.5">
        <CommentComposer
          autoFocus
          mode="new"
          onSubmit={createComment}
          placeholder={
            blockId ? "Comment on this block…" : "Add a page comment…"
          }
          workspaceId={workspaceId}
        />
      </div>
    </div>
  );
}

// ---------- ThreadSection ----------

interface ThreadSectionProps {
  currentUserId: string;
  isAdmin: boolean;
  onMutate: () => void;
  onReactionUserResolved: (id: string, name: string | null) => void;
  onReopen: (id: string) => void;
  onReply: (
    parentId: string,
    content: Record<string, unknown>
  ) => Promise<void>;
  onResolve: (id: string) => void;
  reactionUsers: Record<string, string | null>;
  thread: CommentThread;
  workspaceId: string;
}

function ThreadSection({
  thread,
  currentUserId,
  isAdmin,
  workspaceId,
  reactionUsers,
  onReactionUserResolved,
  onMutate,
  onResolve,
  onReopen,
  onReply,
}: ThreadSectionProps) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [replyKey, setReplyKey] = useState(0);
  const [reactions, setReactions] = useState<Record<string, string[]>>(
    thread.reactions ?? {}
  );
  const [isUnread, setIsUnread] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pendingDeleteThread, setPendingDeleteThread] = useState(false);
  const [showReplyBox, setShowReplyBox] = useState(false);

  // Sync reactions when the thread data refreshes
  useEffect(() => {
    setReactions(thread.reactions ?? {});
  }, [thread.reactions]);

  async function toggleReaction(emoji: string) {
    // Optimistic update — one reaction per user: strip user from all emojis,
    // then add to the new one unless they already had it (toggle-off).
    setReactions((prev) => {
      const hadThisEmoji = (prev[emoji] ?? []).includes(currentUserId);
      const next: Record<string, string[]> = {};
      for (const [e, users] of Object.entries(prev)) {
        const filtered = users.filter((u) => u !== currentUserId);
        if (filtered.length > 0) {
          next[e] = filtered;
        }
      }
      if (!hadThisEmoji) {
        next[emoji] = [...(next[emoji] ?? []), currentUserId];
      }
      return next;
    });
    // Persist
    const res = await fetch(`/api/comments/${thread.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        reactions: Record<string, string[]>;
        reactorId: string;
        reactorName: string | null;
      };
      setReactions(data.reactions);
      onReactionUserResolved(data.reactorId, data.reactorName);
    }
  }

  const isAuthor = thread.author?.id === currentUserId;

  async function handleEditRoot(content: Record<string, unknown>) {
    await fetch(`/api/comments/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setEditingId(null);
    onMutate();
  }

  async function handleDeleteRoot() {
    await fetch(`/api/comments/${thread.id}`, { method: "DELETE" });
    onMutate();
  }

  async function submitReply(content: Record<string, unknown>) {
    await onReply(thread.id, content);
    setReplyKey((k) => k + 1); // reset the reply composer
  }

  return (
    <div
      className={`group/thread relative border-b border-base-300 last:border-0 transition-colors duration-150 hover:bg-base-200/30 ${thread.isResolved ? "opacity-55" : ""}`}
      id={`comment-${thread.id}`}
    >
      {/* ── Unread indicator — right edge, hidden once the hover pill takes over ── */}
      {isUnread && !thread.deletedAt && editingId !== thread.id && (
        <span
          className="absolute top-4 right-4 z-10 size-2 rounded-full bg-primary group-hover/thread:hidden"
          title="Unread"
        />
      )}

      {/* ── Floating action pill — appears top-right on hover ── */}
      {/* Opacity-based reveal, not `hidden`/`flex` display toggling: the reaction button's
       PopoverPanel portals to document.body (its `anchor` prop forces a portal), so once the
       cursor leaves this row to reach the portaled panel, `group-hover/thread` stops matching.
       A `display:none` toggle would collapse the trigger button's rect to 0x0, which Headless
       UI's PopoverButton watches via ResizeObserver (see `useOnDisappear`) and treats as "the
       button disappeared" — auto-closing the panel out from under the user's cursor. Opacity
       keeps the trigger's layout box (and therefore the panel) alive while it fades from view. */}
      {!thread.deletedAt && editingId !== thread.id && (
        <div className="absolute top-2.5 right-3 z-10 flex items-center gap-px rounded-sm border border-base-300 bg-base-100 px-0.5 py-0.5 opacity-0 transition-opacity duration-150 group-hover/thread:opacity-100">
          {thread.isResolved ? (
            <button
              className="flex size-6 items-center justify-center rounded-sm text-primary hover:bg-base-200 transition-colors duration-150"
              onClick={() => onReopen(thread.id)}
              onMouseEnter={(e) => showTooltip("Reopen thread", e)}
              onMouseLeave={hideTooltip}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={12} />
            </button>
          ) : (
            <button
              className="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150"
              onClick={() => onResolve(thread.id)}
              onMouseEnter={(e) => showTooltip("Resolve thread", e)}
              onMouseLeave={hideTooltip}
              type="button"
            >
              <CheckIcon size={12} />
            </button>
          )}
          <EmojiPicker
            onMouseEnter={(e) => showTooltip("Add reaction", e)}
            onMouseLeave={hideTooltip}
            onSelect={(emoji) => {
              void toggleReaction(emoji);
            }}
            triggerClassName="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
          />
          <SimpleDropdown
            triggerClassName="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
            triggerIcon={<DotsThreeIcon size={13} />}
          >
            {!thread.isResolved && (
              <DropdownItem
                icon={<ReplyIcon size={13} />}
                onClick={() => setShowReplyBox(true)}
              >
                Reply
              </DropdownItem>
            )}
            <DropdownItem
              icon={<EnvelopeIcon size={13} />}
              onClick={() => setIsUnread((v) => !v)}
            >
              {isUnread ? "Mark as read" : "Mark as unread"}
            </DropdownItem>
            {isAuthor && (
              <DropdownItem
                icon={<PencilSimpleIcon size={13} />}
                onClick={() => setEditingId(thread.id)}
              >
                Edit
              </DropdownItem>
            )}
            <DropdownItem
              icon={<LinkIcon size={13} />}
              onClick={() => {
                const url = `${window.location.href.split("#")[0]}#comment-${thread.id}`;
                navigator.clipboard.writeText(url);
              }}
            >
              Copy link
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem
              icon={<BellSlashIcon size={13} />}
              onClick={() => setIsMuted((v) => !v)}
            >
              {isMuted ? "Unmute replies" : "Mute replies"}
            </DropdownItem>
            {(isAuthor || isAdmin) && (
              <DropdownItem
                danger
                icon={<TrashIcon size={13} />}
                onClick={() => setPendingDeleteThread(true)}
              >
                Delete
              </DropdownItem>
            )}
          </SimpleDropdown>
        </div>
      )}

      {/* ── Root comment body ── */}
      <div className="flex items-start gap-2.5 px-4 pt-4 pb-2.5">
        <UserAvatar
          image={thread.author?.image}
          name={thread.author?.name}
          size={28}
        />
        <div className="flex-1 min-w-0 pr-6">
          {/* Name + time row */}
          <div className="flex items-baseline gap-1.5 mb-1">
            <span className="text-sm font-semibold text-base-content leading-tight truncate">
              {thread.author?.name ?? "Former Member"}
            </span>
            <span className="text-xs text-base-content/70 shrink-0">
              {formatTime(thread.createdAt)}
            </span>
            {thread.editedAt && !thread.deletedAt && (
              <span className="text-xs text-base-content/70 shrink-0">
                (edited)
              </span>
            )}
          </div>

          {/* Content */}
          {thread.deletedAt ? (
            <p className="text-sm text-base-content/70 italic">
              [Comment deleted]
            </p>
          ) : editingId === thread.id ? (
            <CommentComposer
              autoFocus
              initialContent={thread.content ?? undefined}
              mode="edit"
              onCancel={() => setEditingId(null)}
              onSubmit={handleEditRoot}
              workspaceId={workspaceId}
            />
          ) : (
            <p className="text-sm text-base-content/85 leading-relaxed whitespace-pre-wrap wrap-break-word">
              {renderContent(thread.content)}
            </p>
          )}

          {/* Reaction badges */}
          {Object.keys(reactions).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {Object.entries(reactions).map(([emoji, userIds]) => {
                const iMine = userIds.includes(currentUserId);
                return (
                  <button
                    className={`flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-xs border transition-colors duration-150 ${
                      iMine
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-base-200/50 hover:bg-base-200 border-base-300 hover:border-base-300 text-base-content/70"
                    }`}
                    key={emoji}
                    onClick={() => {
                      void toggleReaction(emoji);
                    }}
                    onMouseEnter={(e) =>
                      showTooltip(
                        formatReactionTooltip(emoji, userIds, reactionUsers),
                        e,
                        emoji,
                        formatReactorNames(userIds, reactionUsers)
                      )
                    }
                    onMouseLeave={hideTooltip}
                    type="button"
                  >
                    {emoji}
                    <span className="text-xs font-semibold ml-0.5">
                      {userIds.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Replies ── */}
      {thread.replies.length > 0 && (
        <div className="ml-14 mr-4 mb-2 border-l-2 border-base-300 pl-3">
          {thread.replies.map((reply) => (
            <ReplyRow
              currentUserId={currentUserId}
              editingId={editingId}
              isAdmin={isAdmin}
              key={reply.id}
              onMutate={onMutate}
              onReactionUserResolved={onReactionUserResolved}
              reactionUsers={reactionUsers}
              reply={reply}
              setEditingId={setEditingId}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}

      {/* ── Reply input — hidden until "Reply" is chosen from the ⋯ menu ── */}
      {!thread.isResolved && showReplyBox && (
        <div className="pl-14 pr-4 pb-3">
          <CommentComposer
            autoFocus
            key={replyKey}
            mode="reply"
            onSubmit={submitReply}
            placeholder="Reply…"
            workspaceId={workspaceId}
          />
        </div>
      )}

      <ConfirmDialog
        description="The entire thread and all replies will be permanently deleted."
        onConfirm={handleDeleteRoot}
        onOpenChange={setPendingDeleteThread}
        open={pendingDeleteThread}
        title="Delete this comment?"
      />
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          tooltip.emoji ? (
            <ReactionTooltip
              emoji={tooltip.emoji}
              label={tooltip.label}
              rect={tooltip.rect}
              who={tooltip.who}
            />
          ) : (
            <IconTooltip label={tooltip.label} rect={tooltip.rect} />
          ),
          document.body
        )}
    </div>
  );
}

// ---------- ReplyRow ----------

interface ReplyRowProps {
  currentUserId: string;
  editingId: string | null;
  isAdmin: boolean;
  onMutate: () => void;
  onReactionUserResolved: (id: string, name: string | null) => void;
  reactionUsers: Record<string, string | null>;
  reply: CommentReply;
  setEditingId: (id: string | null) => void;
  workspaceId: string;
}

function ReplyRow({
  reply,
  currentUserId,
  isAdmin,
  workspaceId,
  reactionUsers,
  onReactionUserResolved,
  editingId,
  setEditingId,
  onMutate,
}: ReplyRowProps) {
  const isAuthor = reply.author?.id === currentUserId;
  const [pendingDelete, setPendingDelete] = useState(false);
  const [reactions, setReactions] = useState<Record<string, string[]>>(
    reply.reactions ?? {}
  );
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // Sync when the thread data refreshes (e.g. after onMutate's reload)
  useEffect(() => {
    setReactions(reply.reactions ?? {});
  }, [reply.reactions]);

  async function toggleReaction(emoji: string) {
    setReactions((prev) => {
      const hadThisEmoji = (prev[emoji] ?? []).includes(currentUserId);
      const next: Record<string, string[]> = {};
      for (const [e, users] of Object.entries(prev)) {
        const filtered = users.filter((u) => u !== currentUserId);
        if (filtered.length > 0) {
          next[e] = filtered;
        }
      }
      if (!hadThisEmoji) {
        next[emoji] = [...(next[emoji] ?? []), currentUserId];
      }
      return next;
    });
    const res = await fetch(`/api/comments/${reply.id}/react`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ emoji }),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        reactions: Record<string, string[]>;
        reactorId: string;
        reactorName: string | null;
      };
      setReactions(data.reactions);
      onReactionUserResolved(data.reactorId, data.reactorName);
    }
  }

  async function handleEdit(content: Record<string, unknown>) {
    await fetch(`/api/comments/${reply.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    setEditingId(null);
    onMutate();
  }

  async function handleDelete() {
    await fetch(`/api/comments/${reply.id}`, { method: "DELETE" });
    onMutate();
  }

  return (
    <div className="group/reply relative flex items-start gap-2 py-2 rounded-sm hover:bg-base-200/40 transition-colors duration-150">
      <UserAvatar
        image={reply.author?.image}
        name={reply.author?.name}
        size={20}
      />
      <div className="flex-1 min-w-0 pr-7">
        {/* Name + time */}
        <div className="flex items-baseline gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-base-content truncate">
            {reply.author?.name ?? "Former Member"}
          </span>
          <span className="text-xs text-base-content/70 shrink-0">
            {formatTime(reply.createdAt)}
          </span>
          {reply.editedAt && (
            <span className="text-xs text-base-content/70">(edited)</span>
          )}
        </div>

        {reply.deletedAt ? (
          <p className="text-xs text-base-content/70 italic">
            [Comment deleted]
          </p>
        ) : editingId === reply.id ? (
          <CommentComposer
            autoFocus
            initialContent={reply.content ?? undefined}
            mode="edit"
            onCancel={() => setEditingId(null)}
            onSubmit={handleEdit}
            workspaceId={workspaceId}
          />
        ) : (
          <p className="text-sm text-base-content/80 leading-relaxed whitespace-pre-wrap wrap-break-word">
            {renderContent(reply.content)}
          </p>
        )}

        {Object.keys(reactions).length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1.5">
            {Object.entries(reactions).map(([emoji, userIds]) => {
              const iMine = userIds.includes(currentUserId);
              return (
                <button
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 text-xs rounded-xs border transition-colors duration-150 ${
                    iMine
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "bg-base-200/50 hover:bg-base-200 border-base-300 hover:border-base-300 text-base-content/70"
                  }`}
                  key={emoji}
                  onClick={() => {
                    void toggleReaction(emoji);
                  }}
                  onMouseEnter={(e) =>
                    showTooltip(
                      formatReactionTooltip(emoji, userIds, reactionUsers),
                      e,
                      emoji,
                      formatReactorNames(userIds, reactionUsers)
                    )
                  }
                  onMouseLeave={hideTooltip}
                  type="button"
                >
                  {emoji}
                  <span className="text-xs font-semibold ml-0.5">
                    {userIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Hover action — floating dot menu */}
      {!reply.deletedAt && editingId !== reply.id && (
        <div className="absolute top-1.5 right-0 hidden group-hover/reply:flex items-center rounded-sm border border-base-300 bg-base-100 px-0.5 py-0.5">
          <EmojiPicker
            onSelect={(emoji) => {
              void toggleReaction(emoji);
            }}
            size={11}
            triggerClassName="flex size-5 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
          />
          <SimpleDropdown
            triggerClassName="flex size-5 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
            triggerIcon={<DotsThreeIcon size={12} />}
          >
            {isAuthor && (
              <DropdownItem
                icon={<PencilSimpleIcon size={13} />}
                onClick={() => setEditingId(reply.id)}
              >
                Edit
              </DropdownItem>
            )}
            <DropdownItem
              icon={<LinkIcon size={13} />}
              onClick={() =>
                navigator.clipboard.writeText(
                  `${window.location.href.split("#")[0]}#comment-${reply.id}`
                )
              }
            >
              Copy link
            </DropdownItem>
            {(isAuthor || isAdmin) && (
              <>
                <DropdownSeparator />
                <DropdownItem
                  danger
                  icon={<TrashIcon size={13} />}
                  onClick={() => setPendingDelete(true)}
                >
                  Delete
                </DropdownItem>
              </>
            )}
          </SimpleDropdown>
        </div>
      )}

      <ConfirmDialog
        description="This reply will be permanently deleted."
        onConfirm={handleDelete}
        onOpenChange={setPendingDelete}
        open={pendingDelete}
        title="Delete this reply?"
      />
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          tooltip.emoji ? (
            <ReactionTooltip
              emoji={tooltip.emoji}
              label={tooltip.label}
              rect={tooltip.rect}
              who={tooltip.who}
            />
          ) : (
            <IconTooltip label={tooltip.label} rect={tooltip.rect} />
          ),
          document.body
        )}
    </div>
  );
}
