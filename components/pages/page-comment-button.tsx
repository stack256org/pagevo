"use client";

import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import {
  RotateCcw as ArrowCounterClockwiseIcon,
  BellOff as BellSlashIcon,
  MessageSquare as ChatTextIcon,
  Check as CheckIcon,
  CornerDownRight,
  MoreHorizontal as DotsThreeIcon,
  FileText,
  Link as LinkIcon,
  MessageCircle,
  Paperclip,
  Pencil as PencilSimpleIcon,
  Tag,
  Trash2 as TrashIcon,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  DropdownItem,
  DropdownSeparator,
  EmojiPicker,
  FileAttachment,
  ImageAttachment,
  SimpleDropdown,
} from "@/components/editor/comment-card";
import { CommentComposer } from "@/components/editor/comment-composer";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { ReactionTooltip } from "@/components/ui/reaction-tooltip";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import {
  emitCommentsChanged,
  onCommentsChanged,
} from "@/lib/comments/comment-events";
import {
  formatReactionTooltip,
  formatReactorNames,
} from "@/lib/comments/format-reaction-tooltip";

interface CommentAuthor {
  id: string | null;
  image: string | null;
  name: string | null;
}

interface CommentReply {
  createdAt: string;
  id: string;
}

interface CommentThread {
  author: CommentAuthor | null;
  blockId: string | null;
  content: Record<string, unknown> | null;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  id: string;
  isResolved: boolean;
  propertyId: string | null;
  propertyName: string | null;
  propertyValueLabel: string | null;
  reactions: Record<string, string[]>;
  replies: CommentReply[];
}

interface Props {
  currentUserId: string;
  isAdmin: boolean;
  pageId: string;
  workspaceId: string;
}

function extractText(node: Record<string, unknown> | null | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return String(node.text ?? "");
  }
  const children = (node.content as Record<string, unknown>[]) ?? [];
  return children.map(extractText).join("");
}

// Walks the doc for the first image/file/attachment node (the shapes used
// across this app's composers) so an attachment shows a thumbnail, not just text.
interface FoundAttachment {
  kind: "image" | "file";
  name: string;
  src: string;
}
function extractFirstAttachment(
  node: Record<string, unknown> | null | undefined
): FoundAttachment | null {
  if (!node) {
    return null;
  }
  const type = node.type as string | undefined;
  const attrs = (node.attrs ?? {}) as Record<string, unknown>;
  if (type === "image") {
    const src = attrs.src as string | undefined;
    if (src) {
      return { src, name: (attrs.alt as string) ?? "image", kind: "image" };
    }
  }
  if (type === "file" || type === "attachment") {
    const src =
      (attrs.src as string | undefined) ?? (attrs.url as string | undefined);
    if (src) {
      const mimeType = attrs.mimeType as string | undefined;
      return {
        src,
        name: (attrs.name as string) ?? "file",
        kind: mimeType?.startsWith("image/") ? "image" : "file",
      };
    }
  }
  const children = (node.content as Record<string, unknown>[]) ?? [];
  for (const child of children) {
    const found = extractFirstAttachment(child);
    if (found) {
      return found;
    }
  }
  return null;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  if (mins < 1) {
    return "Just now";
  }
  if (mins < 60) {
    return `${mins}m ago`;
  }
  if (hours < 24) {
    return `${hours}h ago`;
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// Groups threads the way Notion's comment pane does — most recently active
// thread first, bucketed under "Today" / "Yesterday" / an absolute date.
function dateBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (diffDays <= 0) {
    return "Today";
  }
  if (diffDays === 1) {
    return "Yesterday";
  }
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function lastActivity(thread: CommentThread): number {
  const times = [
    new Date(thread.createdAt).getTime(),
    ...thread.replies.map((r) => new Date(r.createdAt).getTime()),
  ];
  return Math.max(...times);
}

// Pure formatting helper — lives at module scope so it is a stable reference and
// the useMemo calls that use it do not need it as a dependency.
function groupByDate(list: CommentThread[]) {
  const sorted = [...list].sort((a, b) => lastActivity(b) - lastActivity(a));
  const buckets = new Map<string, CommentThread[]>();
  for (const t of sorted) {
    const key = dateBucket(new Date(lastActivity(t)).toISOString());
    if (!buckets.has(key)) {
      buckets.set(key, []);
    }
    buckets.get(key)!.push(t);
  }
  return [...buckets.entries()];
}

function ThreadAvatar({
  name,
  image,
}: {
  name?: string | null;
  image?: string | null;
}) {
  if (image) {
    return (
      // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
      <img
        alt={name ?? ""}
        className="size-7 shrink-0 rounded-full object-cover"
        src={image}
      />
    );
  }
  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-content select-none">
      {name?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

// ---------- Discussion item ----------
// Mirrors CommentCard's actions so "All discussions" isn't just a read-only list.

interface DiscussionItemProps {
  currentUserId: string;
  isAdmin: boolean;
  onDeleted: () => void;
  onOpen: () => void;
  onPatch: (patch: Partial<CommentThread>) => void;
  onReactionUserResolved: (id: string, name: string | null) => void;
  pageId: string;
  reactionUsers: Record<string, string | null>;
  thread: CommentThread;
  workspaceId: string;
}

function DiscussionItem({
  thread,
  pageId,
  workspaceId,
  currentUserId,
  isAdmin,
  reactionUsers,
  onReactionUserResolved,
  onOpen,
  onPatch,
  onDeleted,
}: DiscussionItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);

  const isAuthor = thread.author?.id === currentUserId;
  const reactions = thread.reactions ?? {};
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  async function toggleReaction(emoji: string) {
    const hadThisEmoji = (reactions[emoji] ?? []).includes(currentUserId);
    const next: Record<string, string[]> = {};
    for (const [e, userIds] of Object.entries(reactions)) {
      const filtered = userIds.filter((u) => u !== currentUserId);
      if (filtered.length > 0) {
        next[e] = filtered;
      }
    }
    if (!hadThisEmoji) {
      next[emoji] = [...(next[emoji] ?? []), currentUserId];
    }
    onPatch({ reactions: next });
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
      onPatch({ reactions: data.reactions });
      onReactionUserResolved(data.reactorId, data.reactorName);
    }
  }

  // Optimistic instant update here; emitCommentsChanged only fires once the
  // request has actually persisted so other listeners (topbar badge, the
  // page's own inline comment card) can't refetch mid-flight and read stale
  // pre-persist state (see the same fix in comment-card.tsx).
  async function resolveThread() {
    onPatch({ isResolved: true });
    const res = await fetch(`/api/comments/${thread.id}/resolve`, {
      method: "POST",
    });
    if (!res.ok) {
      onPatch({ isResolved: false });
    }
    emitCommentsChanged(pageId);
  }

  async function reopenThread() {
    onPatch({ isResolved: false });
    const res = await fetch(`/api/comments/${thread.id}/reopen`, {
      method: "POST",
    });
    if (!res.ok) {
      onPatch({ isResolved: true });
      return;
    }
    emitCommentsChanged(pageId);
    // Matching Notion — reopening jumps you to the comment's own location
    // (its block, or the page-level thread) instead of leaving you looking
    // at the now-empty spot in the Resolved tab it just disappeared from.
    onOpen();
  }

  async function handleEditSubmit(content: Record<string, unknown>) {
    await fetch(`/api/comments/${thread.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    onPatch({ content, editedAt: new Date().toISOString() });
    setIsEditing(false);
    emitCommentsChanged(pageId);
  }

  async function handleDelete() {
    await fetch(`/api/comments/${thread.id}`, { method: "DELETE" });
    onDeleted();
    emitCommentsChanged(pageId);
  }

  const snippet = thread.deletedAt
    ? "[Comment deleted]"
    : extractText(thread.content).trim() || "…";
  const attachment = thread.deletedAt
    ? null
    : extractFirstAttachment(thread.content);
  const kindLabel = thread.blockId
    ? "Comment on a block"
    : thread.propertyId
      ? `${thread.propertyName ?? "Property"}${thread.propertyValueLabel ? `: ${thread.propertyValueLabel}` : ""}`
      : "Page comment";
  const KindIcon = thread.blockId
    ? MessageCircle
    : thread.propertyId
      ? Tag
      : FileText;

  return (
    <li className="group/discussion relative">
      {!thread.deletedAt && !isEditing && (
        <div className="absolute top-2 right-2 z-10 hidden items-center gap-px rounded-sm border border-base-300 bg-base-100 px-0.5 py-0.5 group-hover/discussion:flex">
          <EmojiPicker
            onMouseEnter={(e) => showTooltip("Add reaction", e)}
            onMouseLeave={hideTooltip}
            onSelect={(emoji) => {
              void toggleReaction(emoji);
            }}
            triggerClassName="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
          />
          {thread.isResolved ? (
            <button
              className="flex size-6 items-center justify-center rounded-sm text-primary hover:bg-base-200 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                void reopenThread();
              }}
              onMouseEnter={(e) => showTooltip("Reopen thread", e)}
              onMouseLeave={hideTooltip}
              type="button"
            >
              <ArrowCounterClockwiseIcon size={12} />
            </button>
          ) : (
            <button
              className="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150"
              onClick={(e) => {
                e.stopPropagation();
                void resolveThread();
              }}
              onMouseEnter={(e) => showTooltip("Resolve thread", e)}
              onMouseLeave={hideTooltip}
              type="button"
            >
              <CheckIcon size={12} />
            </button>
          )}
          <SimpleDropdown
            onMouseEnter={(e) => showTooltip("More options", e)}
            onMouseLeave={hideTooltip}
            triggerClassName="flex size-6 items-center justify-center rounded-sm text-base-content/70 hover:text-base-content hover:bg-base-200 transition-colors duration-150 data-open:bg-base-200 data-open:text-base-content"
            triggerIcon={<DotsThreeIcon size={13} />}
          >
            {isAuthor && (
              <DropdownItem
                icon={<PencilSimpleIcon size={13} />}
                onClick={() => setIsEditing(true)}
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
                onClick={() => setPendingDelete(true)}
              >
                Delete
              </DropdownItem>
            )}
          </SimpleDropdown>
        </div>
      )}

      {isEditing ? (
        <div className="flex items-start gap-2.5 rounded-md px-3 py-2.5">
          <ThreadAvatar
            image={thread.author?.image}
            name={thread.author?.name}
          />
          <div className="min-w-0 flex-1">
            <span className="mb-1 block truncate text-xs font-semibold text-base-content">
              {thread.author?.name ?? "Former Member"}
            </span>
            <CommentComposer
              autoFocus
              initialContent={thread.content ?? undefined}
              mode="edit"
              onCancel={() => setIsEditing(false)}
              onSubmit={handleEditSubmit}
              workspaceId={workspaceId}
            />
          </div>
        </div>
      ) : (
        // The card stays a plain div — the reaction pills and the attachment
        // preview below are independently clickable, and a <button> may not
        // nest another <button>. The "open thread" action is instead a real
        // button stretched over the card: static content sits beneath it (so
        // clicking the text still opens the thread, as before), while the
        // nested controls are positioned above it and keep their own clicks.
        <div className="relative flex w-full cursor-pointer flex-col gap-2 rounded-md border border-transparent px-3 py-2.5 text-left transition-colors duration-150 hover:border-base-300 hover:bg-base-200">
          <button
            aria-label="Open comment thread"
            className="absolute inset-0 rounded-md"
            onClick={onOpen}
            type="button"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1 rounded-xs bg-base-200 px-1.5 py-0.5 text-2xs font-medium text-base-content/70">
              <KindIcon className="shrink-0" size={10} />
              <span className="truncate">{kindLabel}</span>
            </span>
            {thread.isResolved && !thread.deletedAt && (
              <span className="shrink-0 rounded-xs bg-success/10 px-1.5 py-0.5 text-2xs font-semibold text-success">
                Resolved
              </span>
            )}
          </div>
          <div className="flex items-start gap-2.5">
            <ThreadAvatar
              image={thread.author?.image}
              name={thread.author?.name}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-semibold text-base-content">
                  {thread.author?.name ?? "Former Member"}
                </span>
                <span className="shrink-0 text-[11px] text-base-content/70">
                  {timeAgo(thread.createdAt)}
                  {thread.editedAt && !thread.deletedAt ? " (edited)" : ""}
                </span>
              </div>
              <div className="mt-0.5 flex items-start gap-1">
                {attachment?.kind === "file" && (
                  <Paperclip
                    className="mt-0.5 shrink-0 text-base-content/70"
                    size={11}
                  />
                )}
                <p
                  className={`line-clamp-2 min-w-0 flex-1 text-xs leading-relaxed ${thread.deletedAt ? "italic text-base-content/50" : "text-base-content/75"}`}
                >
                  {snippet}
                </p>
              </div>
              {attachment && (
                // Positioned so it paints above the stretched "open thread"
                // button, keeping the thumbnail's own lightbox click intact —
                // this replaces the stopPropagation that used to be needed
                // when the whole card was one bubbling click surface.
                <div className="relative z-10">
                  {attachment.kind === "image" ? (
                    <ImageAttachment
                      alt={attachment.name}
                      src={attachment.src}
                    />
                  ) : (
                    <FileAttachment
                      name={attachment.name}
                      src={attachment.src}
                    />
                  )}
                </div>
              )}
              {Object.keys(reactions).length > 0 && (
                <div className="relative z-10 mt-1 flex flex-wrap gap-1">
                  {Object.entries(reactions).map(([emoji, userIds]) => {
                    const iMine = userIds.includes(currentUserId);
                    return (
                      <button
                        className={`flex items-center gap-0.5 rounded-xs border px-1.5 py-0.5 text-2xs transition-colors duration-150 ${
                          iMine
                            ? "border-primary/30 bg-primary/10 text-primary"
                            : "border-base-300 bg-base-200/50 text-base-content/70 hover:border-base-300 hover:bg-base-200"
                        }`}
                        key={emoji}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleReaction(emoji);
                        }}
                        onMouseEnter={(e) =>
                          showTooltip(
                            formatReactionTooltip(
                              emoji,
                              userIds,
                              reactionUsers
                            ),
                            e,
                            emoji,
                            formatReactorNames(userIds, reactionUsers)
                          )
                        }
                        onMouseLeave={hideTooltip}
                        type="button"
                      >
                        {emoji}
                        <span className="font-semibold">{userIds.length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {thread.replies.length > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[11px] text-base-content/70">
                  <CornerDownRight className="shrink-0" size={10} />
                  {thread.replies.length} repl
                  {thread.replies.length === 1 ? "y" : "ies"}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        confirmLabel="Delete"
        description="The entire thread and all replies will be permanently deleted."
        onConfirm={handleDelete}
        onOpenChange={setPendingDelete}
        open={pendingDelete}
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
    </li>
  );
}

// Topbar "Comments" button: opens a side panel listing every comment on the
// page (page/block/property, "All discussions"-style); clicking an item jumps to it.
export function PageCommentButton({
  pageId,
  workspaceId,
  currentUserId,
  isAdmin,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [threads, setThreads] = useState<CommentThread[]>([]);
  // Reactions only carry reactor user IDs — this resolves them to display
  // names for the "X reacted with 😀" hover tooltip (see format-reaction-tooltip.ts).
  const [reactionUsers, setReactionUsers] = useState<
    Record<string, string | null>
  >({});
  const [unresolvedCount, setUnresolvedCount] = useState<number | null>(null);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  // Two loads can overlap (e.g. opening the sheet right as an emitCommentsChanged
  // fires) — without a sequence guard, an older request that happens to resolve
  // last would overwrite newer state with stale data. requestId tracks which
  // call is the most recent so only its response is applied.
  const requestId = useRef(0);

  function load(showSpinner: boolean) {
    if (showSpinner) {
      setLoading(true);
    }
    const thisRequest = ++requestId.current;
    fetch(`/api/pages/${pageId}/comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data || thisRequest !== requestId.current) {
          return;
        }
        const all = data.comments as CommentThread[];
        setThreads(all);
        setReactionUsers(data.reactionUsers ?? {});
        setUnresolvedCount(
          all.filter((t) => !t.isResolved && !t.deletedAt).length
        );
      })
      .catch(() => {})
      .finally(() => {
        if (thisRequest === requestId.current) {
          setLoading(false);
        }
      });
  }

  // `load` is a plain function declaration, so it is a new value every render.
  // Listing it in the effects below would refetch on every render (load ->
  // setState -> render -> new load -> load...), so they call the latest version
  // through this ref instead.
  const loadRef = useRef(load);
  loadRef.current = load;

  // biome-ignore lint/correctness/useExhaustiveDependencies: pageId is a reset trigger, not a value read here — `load` closes over it, and this effect exists to refetch when the page changes.
  useEffect(() => {
    loadRef.current(false);
  }, [pageId]);

  // A user's *first* reaction on a page won't be in reactionUsers yet (it's
  // only populated from ids already seen in loaded comments) — merge in the
  // reactor's resolved name the instant the react endpoint returns it,
  // rather than waiting on some other mutation to reload the whole list.
  function mergeReactionUser(id: string, name: string | null) {
    setReactionUsers((prev) => ({ ...prev, [id]: name }));
  }

  // Any comment mutation anywhere on this page (block card, page-level
  // thread, property popover, or this panel's own items) re-fetches here too
  // — keeps the badge count and thread list live instead of only refreshing
  // on next mount/open.
  useEffect(
    () => onCommentsChanged(pageId, () => loadRef.current(false)),
    [pageId]
  );

  // Auto-open on arrival — set by "View all in full page" links elsewhere
  // (e.g. the table row's comment popover, once there are more comments than
  // that small popup can comfortably show), so landing here immediately
  // reveals the full thread list instead of requiring an extra click.
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("comments") !== "1") {
      return;
    }
    setOpen(true);
    loadRef.current(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("comments");
    router.replace(url.pathname + url.search, { scroll: false });
  }, [searchParams, router.replace]);

  function patchThread(id: string, patch: Partial<CommentThread>) {
    setThreads((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }

  function removeThread(id: string) {
    setThreads((prev) => prev.filter((t) => t.id !== id));
  }

  function openThread(thread: CommentThread) {
    setOpen(false);
    if (thread.blockId) {
      window.dispatchEvent(
        new CustomEvent("pagevo:jump-to-base-200-comment", {
          detail: { pageId, blockId: thread.blockId },
        })
      );
    } else if (thread.propertyId) {
      window.dispatchEvent(
        new CustomEvent("pagevo:jump-to-base-200-comment", {
          detail: { pageId, propertyId: thread.propertyId },
        })
      );
    } else {
      // The page-level section may not be rendered yet (page-client.tsx hides
      // it until "Add comment" is used or a thread already exists) — ask it
      // to reveal itself first rather than scrolling to an element that may
      // not exist in the DOM.
      window.dispatchEvent(
        new CustomEvent("pagevo:show-page-comments", { detail: { pageId } })
      );
    }
  }

  // Threads with no content left and no replies have nothing left to show or
  // jump to — everything else (including deleted-but-replied-to threads,
  // which still render "[Comment deleted]" the same way the block/page
  // comment threads themselves do) stays visible.
  const visibleThreads = useMemo(
    () => threads.filter((t) => !(t.deletedAt && t.replies.length === 0)),
    [threads]
  );
  const openGrouped = useMemo(
    () => groupByDate(visibleThreads.filter((t) => !t.isResolved)),
    [visibleThreads]
  );
  const resolvedGrouped = useMemo(
    () => groupByDate(visibleThreads.filter((t) => t.isResolved)),
    [visibleThreads]
  );

  const openCount = threads.filter((t) => !t.isResolved && !t.deletedAt).length;
  const resolvedCount = threads.filter(
    (t) => t.isResolved && !t.deletedAt
  ).length;
  const {
    tooltip: triggerTooltip,
    showTooltip: showTriggerTooltip,
    hideTooltip: hideTriggerTooltip,
  } = useHoverTooltip();

  function renderThreadList(
    grouped: [string, CommentThread[]][],
    emptyTitle: string
  ) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-16">
          <div className="h-4 w-4 rounded-full border-2 border-base-300 border-t-primary animate-spin" />
        </div>
      );
    }
    if (grouped.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-lg border border-base-300 bg-base-200/50">
            <MessageCircle className="text-base-content/70" size={22} />
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content/80">
              {emptyTitle}
            </p>
            <p className="mt-1 max-w-55 text-xs leading-relaxed text-base-content/70">
              Comments on this page will show up here.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-5">
        {grouped.map(([label, group]) => (
          <div key={label}>
            <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-base-content/50">
              {label}
            </p>
            <ul className="flex flex-col gap-0.5">
              {group.map((thread) => (
                <DiscussionItem
                  currentUserId={currentUserId}
                  isAdmin={isAdmin}
                  key={thread.id}
                  onDeleted={() => removeThread(thread.id)}
                  onOpen={() => openThread(thread)}
                  onPatch={(patch) => patchThread(thread.id, patch)}
                  onReactionUserResolved={mergeReactionUser}
                  pageId={pageId}
                  reactionUsers={reactionUsers}
                  thread={thread}
                  workspaceId={workspaceId}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }

  return (
    <Sheet
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          load(true);
        }
      }}
      open={open}
    >
      <button
        aria-label="Comments"
        className="relative flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
        onClick={() => setOpen(true)}
        onMouseEnter={(e) => showTriggerTooltip("Comments", e)}
        onMouseLeave={hideTriggerTooltip}
        type="button"
      >
        <ChatTextIcon size={15} />
        {unresolvedCount != null && unresolvedCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.75 min-w-3.75 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold tabular-nums text-primary-content">
            {unresolvedCount}
          </span>
        )}
      </button>

      {triggerTooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip
            label={triggerTooltip.label}
            rect={triggerTooltip.rect}
          />,
          document.body
        )}

      <SheetContent
        className="w-full gap-0 p-0 sm:max-w-sm"
        // Radix listens for Escape at the document level in the capture
        // phase, so it would otherwise close this whole panel before an
        // inline comment composer's own Escape handler (cancel-this-edit)
        // ever gets a chance to run. Let the composer handle it instead.
        onEscapeKeyDown={(e) => {
          if (
            (e.target as HTMLElement)?.closest?.('[contenteditable="true"]')
          ) {
            e.preventDefault();
          }
        }}
        side="right"
      >
        <TabGroup
          className="contents"
          onChange={(i) => setTab(i === 0 ? "open" : "resolved")}
          selectedIndex={tab === "open" ? 0 : 1}
        >
          <SheetHeader className="gap-3 border-b border-base-300 px-5 pb-4 pt-5">
            <SheetTitle className="text-base">Comments</SheetTitle>
            <TabList className="inline-flex w-fit items-center gap-0.5 rounded-sm bg-base-200 p-0.5">
              <Tab className="flex items-center gap-1.5 rounded-xs border border-transparent px-2.5 py-1 text-xs font-medium text-base-content/70 outline-none transition-colors duration-150 hover:text-base-content data-selected:border-base-300 data-selected:bg-base-100 data-selected:text-base-content">
                Open
                <span className="tabular-nums text-[11px] text-base-content/70">
                  {openCount}
                </span>
              </Tab>
              <Tab className="flex items-center gap-1.5 rounded-xs border border-transparent px-2.5 py-1 text-xs font-medium text-base-content/70 outline-none transition-colors duration-150 hover:text-base-content data-selected:border-base-300 data-selected:bg-base-100 data-selected:text-base-content">
                Resolved
                <span className="tabular-nums text-[11px] text-base-content/70">
                  {resolvedCount}
                </span>
              </Tab>
            </TabList>
          </SheetHeader>

          <TabPanels className="flex-1 overflow-y-auto px-3 py-3">
            <TabPanel>
              {renderThreadList(openGrouped, "No open comments")}
            </TabPanel>
            <TabPanel>
              {renderThreadList(resolvedGrouped, "No resolved comments")}
            </TabPanel>
          </TabPanels>
        </TabGroup>
      </SheetContent>
    </Sheet>
  );
}
