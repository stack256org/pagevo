"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { Editor } from "@tiptap/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePageDraft } from "@/components/pages/page-draft-context";
import { SaveStatusIndicator } from "@/components/ui/save-status";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { BlockHandle } from "./block-handle";
import { CommentCard } from "./comment-card";
import { CommentGutter } from "./comment-gutter";
import { BlockIdAttr } from "./extensions/block-id-attr";
import { BookmarkBlock, EmbedBlock } from "./extensions/bookmark-block";
import { Callout } from "./extensions/callout";
import {
  CommentHighlight,
  type HighlightComment,
  setCommentHighlights,
} from "./extensions/comment-highlight";
import { ListItemBlock, TaskItemBlock } from "./extensions/list-item-keymap";
import {
  AudioBlock,
  FileBlock,
  ImageBlock,
  PdfBlock,
  VideoBlock,
} from "./extensions/media-blocks";
import {
  MENTION_PLUGIN_KEY,
  MentionCommands,
  type MentionSuggestionProps,
  PAGE_LINK_PLUGIN_KEY,
} from "./extensions/mention-extension";
import { MentionNode } from "./extensions/mention-node";
import {
  BreadcrumbBlock,
  Columns,
  InlineDatabase,
  LinkedPage,
  MathBlock,
  SubPageBlock,
  TableOfContents,
  TemplateButton,
} from "./extensions/reference-blocks";
import {
  SLASH_COMMANDS_PLUGIN_KEY,
  SlashCommands,
  type SlashSuggestionProps,
} from "./extensions/slash-commands";
import { SyncedBlock } from "./extensions/synced-block";
import { Toggle, ToggleSummary } from "./extensions/toggle";
import { InlineToolbar } from "./inline-toolbar";
import { MentionList, type MentionListHandle } from "./mention-list";
import type { DbBlock } from "./serializer";
import { blocksToTiptapDoc, tiptapDocToBlocks } from "./serializer";
import { SlashMenu, type SlashMenuHandle } from "./slash-menu";
import { TableControls } from "./table-controls";

const lowlight = createLowlight(common);

// The "/", "@", and "[[" trigger characters (plus whatever query text follows
// them) are real, live paragraph text until a menu item is chosen — not a
// placeholder. Saving while one of these suggestion popups is open would
// persist that literal trigger text to the DB.
function isSuggestionActive(editor: Editor): boolean {
  return !!(
    SLASH_COMMANDS_PLUGIN_KEY.getState(editor.state)?.active ||
    MENTION_PLUGIN_KEY.getState(editor.state)?.active ||
    PAGE_LINK_PLUGIN_KEY.getState(editor.state)?.active
  );
}

// Stamps a client-generated blockId onto new/duplicate block nodes immediately (rather than
// matching them to DB rows by array position after a save round-trip), since split-block on Enter
// copies the predecessor's blockId onto the new half and a save race could otherwise duplicate content.
function assignMissingBlockIds(editor: Editor): boolean {
  const { state } = editor;
  const tr = state.tr.setMeta("addToHistory", false);
  let mutated = false;
  const seen = new Set<string>();

  function ensureId(node: PMNode, pos: number) {
    if (!node.attrs || !("blockId" in node.attrs)) {
      return;
    }
    const current = node.attrs.blockId as string | null;
    if (!current || seen.has(current)) {
      tr.setNodeMarkup(pos, undefined, {
        ...node.attrs,
        blockId: crypto.randomUUID(),
      });
      mutated = true;
    } else {
      seen.add(current);
    }
  }

  function recurseInto(node: PMNode, pos: number) {
    if (node.type.name === "toggle" && node.childCount > 1) {
      const contentStart = pos + 1;
      let idx = 0;
      node.forEach((child, childOffset) => {
        if (idx > 0) {
          ensureId(child, contentStart + childOffset);
          recurseInto(child, contentStart + childOffset);
        }
        idx++;
      });
    } else if (node.type.name === "columns") {
      const contentStart = pos + 1;
      node.forEach((child, childOffset) => {
        ensureId(child, contentStart + childOffset);
        recurseInto(child, contentStart + childOffset);
      });
    } else if (node.type.name === "syncedBlock" && !node.attrs?.sourceBlockId) {
      const contentStart = pos + 1;
      node.forEach((child, childOffset) => {
        ensureId(child, contentStart + childOffset);
        recurseInto(child, contentStart + childOffset);
      });
    }
  }

  state.doc.forEach((node, offset) => {
    ensureId(node, offset);
    recurseInto(node, offset);
  });

  if (mutated) {
    editor.view.dispatch(tr);
  }
  return mutated;
}

interface EditorProps {
  currentUserId?: string;
  fontFamily?: "default" | "serif" | "mono";
  isAdmin?: boolean;
  isDeleted: boolean;
  isEditor: boolean;
  isLocked: boolean;
  isSmallText?: boolean;
  pageId: string;
  workspaceId?: string;
  workspaceSlug?: string;
}

export function PageEditor({
  pageId,
  isLocked,
  isDeleted,
  isEditor,
  isAdmin = false,
  currentUserId = "",
  workspaceId = "",
  workspaceSlug = "",
  fontFamily = "default",
  isSmallText = false,
}: EditorProps) {
  const [saveState, setSaveState] = useState<
    "idle" | "saving" | "saved" | "offline"
  >("idle");
  // "Saved" used to stay on screen forever once shown — the title-save
  // indicator elsewhere (page-client.tsx) already auto-hides after a beat;
  // this matches that instead of leaving a stale confirmation up permanently.
  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }
    const t = setTimeout(() => setSaveState("idle"), 2500);
    return () => clearTimeout(t);
  }, [saveState]);
  const [initialBlocks, setInitialBlocks] = useState<DbBlock[] | null>(null);
  const [slashProps, setSlashProps] = useState<SlashSuggestionProps | null>(
    null
  );
  const [mentionProps, setMentionProps] =
    useState<MentionSuggestionProps | null>(null);
  const mentionListRef = useRef<MentionListHandle>(null);
  const [gutterRefresh, setGutterRefresh] = useState(0);
  const highlightCommentsRef = useRef<HighlightComment[]>([]);

  // Comment card state — which block's card is open, optional text-range anchor, and Y offset
  const [commentCard, setCommentCard] = useState<{
    blockId: string | null;
    anchorStart: number | null;
    anchorEnd: number | null;
    blockY: number; // viewport-absolute Y (px) — matches getBoundingClientRect/coordsAtPos
  } | null>(null);

  // These three are useCallback'd because the effects below depend on them;
  // they only touch setState and refs, so the deps stay empty and the effects
  // keep running exactly as often as they did before.
  const openCommentCard = useCallback(
    (
      blockId: string | null,
      anchorStart: number | null,
      anchorEnd: number | null,
      blockY = 0
    ) => {
      setCommentCard({ blockId, anchorStart, anchorEnd, blockY });
    },
    []
  );
  const closeCommentCard = useCallback(() => {
    setCommentCard(null);
    setGutterRefresh((n) => n + 1);
  }, []);

  // Resolve a block's on-screen Y position (from its persisted order in
  // currentBlocksRef) and open its comment card there — shared by the gutter
  // badge click and by the "jump to this comment" action from the comments panel.
  const openBlockComment = useCallback(
    (blockId: string) => {
      const sorted = [...currentBlocksRef.current].sort(
        (a, b) => a.orderIndex - b.orderIndex
      );
      const idx = sorted.findIndex((b) => b.id === blockId);
      let blockY = 0;
      if (idx >= 0 && editorRef.current) {
        let nodeOffset: number | null = null;
        editorRef.current.state.doc.forEach((_n, offset, di) => {
          if (di === idx) {
            nodeOffset = offset;
          }
        });
        if (nodeOffset !== null) {
          try {
            const editorEl = editorRef.current.view.dom as HTMLElement;
            const domInfo = editorRef.current.view.domAtPos(nodeOffset + 1);
            let el = domInfo.node as HTMLElement;
            if (el.nodeType === Node.TEXT_NODE) {
              el = el.parentElement!;
            }
            while (el.parentElement && el.parentElement !== editorEl) {
              el = el.parentElement;
            }
            blockY = el.getBoundingClientRect().top - 20;
          } catch {
            /* ignore */
          }
        }
      }
      openCommentCard(blockId, null, null, blockY);
    },
    [openCommentCard]
  );

  // Lets the topbar "Comments" panel (which lives outside the editor) jump to
  // a specific block comment without prop-drilling — same effect as clicking
  // that block's gutter badge.
  useEffect(() => {
    function onJumpToComment(e: Event) {
      const detail = (
        e as CustomEvent<{
          pageId: string;
          blockId?: string;
          propertyId?: string;
        }>
      ).detail;
      if (!detail || detail.pageId !== pageId || !detail.blockId) {
        return;
      }
      openBlockComment(detail.blockId);
    }
    window.addEventListener("pagevo:jump-to-base-200-comment", onJumpToComment);
    return () =>
      window.removeEventListener(
        "pagevo:jump-to-base-200-comment",
        onJumpToComment
      );
  }, [pageId, openBlockComment]);

  // `commentCard.blockY` is a one-time pixel offset computed when the card
  // opens — there's no live anchor to reposition from as the page scrolls, so
  // lock scroll instead. Exempt CommentCard's own nested portals (emoji
  // picker, image lightbox — marked `data-comment-exempt`) and confirm dialogs.
  const commentCardRef = useRef<HTMLDivElement>(null);
  useScrollLockWhileOpen(
    !!commentCard,
    (target) =>
      !!commentCardRef.current?.contains(target) ||
      !!target.closest?.('[data-comment-exempt], [role="alertdialog"]')
  );

  // Native <dialog> shell (showModal/close give focus-trap, Escape, ::backdrop for free, same
  // pattern as ui/dialog.tsx); the margin/sidebar-collision positioning math below is untouched, kept as-is per its documented bug history.
  const commentDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = commentDialogRef.current;
    if (!el) {
      return;
    }
    if (commentCard && !el.open) {
      el.showModal();
    } else if (!commentCard && el.open) {
      el.close();
    }
  }, [commentCard]);
  useEffect(() => {
    const el = commentDialogRef.current;
    if (!el) {
      return;
    }
    function handleClose() {
      closeCommentCard();
    }
    el.addEventListener("close", handleClose);
    return () => el.removeEventListener("close", handleClose);
  }, [closeCommentCard]);

  // Belt-and-suspenders: useScrollLockWhileOpen only blocks wheel/touch, which
  // misses scrollbar-drag and keyboard scrolling (Space/PageDown/arrows).
  // Freezing the actual scroll container's overflow catches every input
  // method and always restores cleanly on close via the effect cleanup.
  useEffect(() => {
    if (!commentCard) {
      return;
    }
    const scrollEl = document.getElementById("page-scroll-container");
    if (!scrollEl) {
      return;
    }
    const prevOverflow = scrollEl.style.overflow;
    scrollEl.style.overflow = "hidden";
    return () => {
      scrollEl.style.overflow = prevOverflow;
    };
  }, [commentCard]);

  // Ref to the slash menu component so the TipTap extension can forward keyboard events
  const slashMenuRef = useRef<SlashMenuHandle>(null);

  // Tracks persisted block IDs — updated after every save so we never re-insert existing rows
  const currentBlocksRef = useRef<DbBlock[]>([]);
  const editorRef = useRef<Editor | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<string>("");
  const deletedIds = useRef<string[]>([]);

  const { setIsDraft } = usePageDraft();

  const editable = isEditor && !isLocked && !isDeleted;

  // Load blocks on mount
  useEffect(() => {
    fetch(`/api/pages/${pageId}/blocks`)
      .then((r) => r.json())
      .then((rows: DbBlock[]) => {
        currentBlocksRef.current = rows;
        setInitialBlocks(rows);
      })
      .catch(() => {
        currentBlocksRef.current = [];
        setInitialBlocks([]);
      });
  }, [pageId]);

  const save = useCallback(
    async (docJson: object) => {
      const docStr = JSON.stringify(docJson);
      if (docStr === lastSaved.current && deletedIds.current.length === 0) {
        return;
      }

      setSaveState("saving");
      try {
        const outgoing = tiptapDocToBlocks(
          docJson as { content?: never[] },
          pageId
        );

        // Diff against the last-persisted set to catch blocks removed from the doc — tiptapDocToBlocks
        // only walks the current doc, so a removed block wouldn't otherwise get flagged for server-side deletion.
        const outgoingIds = new Set(
          outgoing.map((b) => b.id).filter((id): id is string => !!id)
        );
        const missingIds = currentBlocksRef.current
          .map((b) => b.id)
          .filter((id) => !outgoingIds.has(id));
        if (missingIds.length > 0) {
          deletedIds.current = Array.from(
            new Set([...deletedIds.current, ...missingIds])
          );
        }

        const res = await fetch("/api/blocks/batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pageId,
            blocks: outgoing,
            deletedIds: deletedIds.current,
          }),
        });

        if (!res.ok) {
          throw new Error("save failed");
        }

        const data = (await res.json()) as {
          ok: boolean;
          blocks?: DbBlock[];
          promoted?: boolean;
        };
        if (data.blocks) {
          currentBlocksRef.current = data.blocks;
        }
        if (data.promoted) {
          setIsDraft(false);
        }

        deletedIds.current = [];
        // No blockId sync-back needed — assignMissingBlockIds stamps ids client-side before save,
        // so the server upserts by that id directly and what was sent already matches the live doc.
        lastSaved.current = docStr;

        setSaveState("saved");
      } catch {
        setSaveState(navigator.onLine ? "idle" : "offline");
      }
    },
    [pageId, setIsDraft]
  );

  const editor = useEditor(
    {
      immediatelyRender: true,
      extensions: [
        StarterKit.configure({
          codeBlock: false,
          link: false,
          underline: false,
          // Replaced below with ListItemBlock — stock listItem's Enter/Tab
          // keymap (splitListItem/sinkListItem) creates multi-item and nested
          // lists that this app's one-block-per-list-item serializer can't
          // represent, silently dropping content on the next reload.
          listItem: false,
        }),
        Placeholder.configure({
          placeholder: ({ editor, node, pos }) => {
            if (node.type.name === "heading") {
              return "Heading";
            }
            if (node.type.name === "toggleSummary") {
              return "Toggle";
            }
            // Table cells share this callback via includeChildren, but a
            // paragraph inside a <td>/<th> shouldn't show the doc-level hint.
            const resolved = editor.state.doc.resolve(pos);
            for (let depth = resolved.depth; depth >= 0; depth--) {
              const ancestorType = resolved.node(depth).type.name;
              if (
                ancestorType === "tableCell" ||
                ancestorType === "tableHeader"
              ) {
                return "";
              }
            }
            return "Start writing, or press / to insert a block…";
          },
          includeChildren: true,
        }),
        ListItemBlock,
        TaskList,
        TaskItemBlock.configure({ nested: false }),
        Underline,
        Link.configure({ openOnClick: false, autolink: true }),
        TextStyle,
        Color,
        Highlight.configure({ multicolor: true }),
        CodeBlockLowlight.configure({ lowlight }),
        Table.configure({ resizable: false }),
        TableRow,
        TableHeader,
        TableCell,
        Callout,
        Toggle,
        ToggleSummary,
        ImageBlock,
        VideoBlock,
        AudioBlock,
        FileBlock,
        PdfBlock.configure({ workspaceId, pageId }),
        LinkedPage.configure({ workspaceId, workspaceSlug }),
        SubPageBlock.configure({
          workspaceId,
          workspaceSlug,
          currentPageId: pageId,
        }),
        InlineDatabase.configure({ workspaceId, workspaceSlug, isEditor }),
        TemplateButton,
        TableOfContents,
        BreadcrumbBlock.configure({ workspaceSlug, currentPageId: pageId }),
        SyncedBlock,
        MathBlock,
        Columns,
        BookmarkBlock,
        EmbedBlock.configure({
          workspaceId,
          pageId,
          onComment: (blockId: string, blockY: number) =>
            openCommentCard(blockId, null, null, blockY),
        }),
        CommentHighlight,
        // Slash command menu — uses @tiptap/suggestion so the range is always
        // maintained by the ProseMirror plugin (no manual position tracking).
        BlockIdAttr,
        MentionNode.configure({ workspaceSlug }),
        SlashCommands.configure({
          onUpdate: (props) => setSlashProps(props),
          onKeyDown: (event) => slashMenuRef.current?.onKeyDown(event) ?? false,
        }),
        // @mention extension — @name / @page / @date
        ...(workspaceId
          ? [
              MentionCommands.configure({
                workspaceId,
                currentPageId: pageId,
                onUpdate: (props) => setMentionProps(props),
                onKeyDown: (event) =>
                  mentionListRef.current?.onKeyDown(event) ?? false,
              }),
            ]
          : []),
      ],
      editable,
      content: initialBlocks ? blocksToTiptapDoc(initialBlocks) : undefined,
      onUpdate({ editor: e }) {
        if (!editable) {
          return;
        }
        // Dispatching here retriggers onUpdate with ids now in place — return
        // and let that second pass (which will find nothing left to assign)
        // schedule the actual save, rather than doing both in one pass.
        if (assignMissingBlockIds(e)) {
          return;
        }
        if (saveTimer.current) {
          clearTimeout(saveTimer.current);
        }
        const trySave = () => {
          if (isSuggestionActive(e)) {
            saveTimer.current = setTimeout(trySave, 300);
            return;
          }
          save(e.getJSON());
        };
        saveTimer.current = setTimeout(trySave, 1000);
      },
    },
    [initialBlocks]
  );

  // Keep editorRef current for the comment-scroll lookup above and other imperative access
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // Sync editable flag when props change (e.g. page is locked after load)
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Flush pending save timer on unmount
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    },
    []
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: gutterRefresh is a refetch trigger, not a value read here — closeCommentCard() bumps it so the highlight set reloads after a comment is added or resolved. Dropping it would leave stale highlights in the doc.
  useEffect(() => {
    if (!editor) {
      return;
    }
    let cancelled = false;
    fetch(`/api/pages/${pageId}/comments`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) {
          return;
        }
        const textRange: HighlightComment[] = (data.comments ?? []).flatMap(
          (t: {
            id: string;
            blockId: string | null;
            anchorStart: number | null;
            anchorEnd: number | null;
            isResolved: boolean;
            deletedAt: string | null;
          }) => {
            if (!t.anchorStart || !t.anchorEnd || t.isResolved || t.deletedAt) {
              return [];
            }
            return [
              {
                id: t.id,
                blockId: t.blockId,
                anchorStart: t.anchorStart,
                anchorEnd: t.anchorEnd,
              },
            ];
          }
        );
        highlightCommentsRef.current = textRange;
        try {
          setCommentHighlights(editor.view, textRange);
        } catch {
          /* editor not yet mounted */
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pageId, editor, gutterRefresh]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }
    let editorEl: HTMLElement;
    try {
      if (!editor.view?.dom) {
        return;
      }
      editorEl = editor.view.dom as HTMLElement;
    } catch {
      return;
    }
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const highlighted = target.closest(
        ".comment-highlight"
      ) as HTMLElement | null;
      if (!highlighted) {
        return;
      }
      const commentId = highlighted.dataset.commentId;
      if (!commentId) {
        return;
      }
      const comment = highlightCommentsRef.current.find(
        (c) => c.id === commentId
      );
      if (!comment) {
        return;
      }
      const hit = editor.view.posAtCoords({ left: e.clientX, top: e.clientY });
      const blockY = hit
        ? editor.view.coordsAtPos(hit.pos).top - 20
        : e.clientY - 20;
      openCommentCard(
        comment.blockId,
        comment.anchorStart,
        comment.anchorEnd,
        blockY
      );
    }
    editorEl.addEventListener("click", handleClick);
    return () => editorEl.removeEventListener("click", handleClick);
  }, [editor, openCommentCard]);

  // Ctrl+Shift+Alt+X → open comment card on active block
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.altKey && e.key === "X") {
        e.preventDefault();
        openCommentCard(null, null, null); // page-level comment (no specific block)
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openCommentCard]);

  if (initialBlocks === null) {
    return (
      <div className="space-y-3 animate-pulse">
        {[90, 60, 75, 45].map((w) => (
          <div
            className="h-4 rounded bg-base-content/8"
            key={w}
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    );
  }

  const fontClass =
    fontFamily === "serif"
      ? "font-serif"
      : fontFamily === "mono"
        ? "font-mono"
        : "";
  const sizeClass = isSmallText ? "text-sm" : "text-base";

  return (
    <div className="relative">
      <div className="absolute -top-8 right-0">
        <SaveStatusIndicator state={saveState} />
      </div>

      {/* Inline formatting toolbar (BubbleMenu) — includes Comment button */}
      {editor && editable && (
        <InlineToolbar
          editor={editor}
          onCommentSelection={(anchorStart, anchorEnd) => {
            // Position the card near the current selection
            const { from } = editor.state.selection;
            const coords = editor.view.coordsAtPos(from);
            const blockY = coords.top - 20;
            openCommentCard(null, anchorStart, anchorEnd, blockY);
          }}
        />
      )}

      {/* Per-block handle — ⠿ grip button that appears on hover */}
      {editor && editable && (
        <BlockHandle
          editor={editor}
          onComment={(nodePos, absoluteY) => {
            const blockY = absoluteY - 20;

            // Custom nodes store blockId in attrs; standard nodes need index-based lookup
            const doc = editor.state.doc;
            const node = doc.nodeAt(nodePos);
            const attrId = node?.attrs?.blockId as string | undefined;
            if (attrId) {
              openCommentCard(attrId, null, null, blockY);
              return;
            }

            let foundIdx = -1;
            doc.forEach((_child, offset, idx) => {
              if (offset === nodePos) {
                foundIdx = idx;
              }
            });
            if (foundIdx >= 0) {
              const sorted = [...currentBlocksRef.current].sort(
                (a, b) => a.orderIndex - b.orderIndex
              );
              const blockId = sorted[foundIdx]?.id;
              if (blockId) {
                openCommentCard(blockId, null, null, blockY);
              }
            }
          }}
        />
      )}

      {/* Table row/column "+" controls — appear on hover over a table */}
      {editor && editable && <TableControls editor={editor} />}

      {/* Slash command popup — rendered when suggestion is active */}
      {slashProps && editable && (
        <SlashMenu ref={slashMenuRef} suggestionProps={slashProps} />
      )}

      {/* @mention popup */}
      {mentionProps && editable && (
        <MentionList ref={mentionListRef} suggestionProps={mentionProps} />
      )}

      <EditorContent
        className={[
          "outline-none [&_.ProseMirror]:min-h-30",
          fontClass,
          sizeClass,
        ].join(" ")}
        editor={editor}
      />

      {/* Comment gutter — speech-bubble badges in right margin, hidden for the open card's block */}
      {editor && workspaceId && (
        <CommentGutter
          activeBlockId={commentCard?.blockId ?? null}
          blocksRef={currentBlocksRef}
          editor={editor}
          onOpen={openBlockComment}
          pageId={pageId}
          refresh={gutterRefresh}
        />
      )}

      {/* Floating comment card — anchored just right of the editor column,
          next to the block it was opened from, clamped to stay on-screen.
          Native <dialog> shell (Escape + ::backdrop for free); the anchor
          math below is unchanged custom positioning, not a Headless UI
          anchor — this popup has no single DOM trigger element common to its
          4 open paths (gutter badge, block handle, inline-toolbar selection,
          keyboard shortcut) for a library to anchor against. */}
      {workspaceId &&
        editor &&
        typeof document !== "undefined" &&
        (() => {
          const CARD_WIDTH = 380;
          const CARD_MAX_HEIGHT = 550; // header + capped thread list + composer
          const VIEWPORT_MARGIN = 16;
          const CARD_GAP = 20;

          let left = 0;
          let top = 0;
          if (commentCard) {
            const editorRect = editor.view.dom.getBoundingClientRect();

            // Measure free space from the sidebar's right edge, not x=0, or a left-anchored card
            // could land partly hidden underneath the sidebar.
            const sidebarRight =
              document
                .getElementById("workspace-sidebar")
                ?.getBoundingClientRect().right ?? 0;

            // Anchor beside the editor column, preferring whichever margin has more room; no centered
            // fallback since that made the card's position feel inconsistent between opens.
            const spaceRight =
              window.innerWidth - editorRect.right - VIEWPORT_MARGIN;
            const spaceLeft = editorRect.left - sidebarRight - VIEWPORT_MARGIN;
            left =
              spaceRight >= spaceLeft
                ? editorRect.right + CARD_GAP
                : editorRect.left - CARD_GAP - CARD_WIDTH;
            left = Math.min(
              left,
              window.innerWidth - CARD_WIDTH - VIEWPORT_MARGIN
            );
            left = Math.max(left, sidebarRight + VIEWPORT_MARGIN);

            const maxTop = Math.max(
              VIEWPORT_MARGIN,
              window.innerHeight - CARD_MAX_HEIGHT - VIEWPORT_MARGIN
            );
            top = Math.min(
              Math.max(VIEWPORT_MARGIN, commentCard.blockY),
              maxTop
            );
          }

          return (
            // biome-ignore lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: click-outside-to-dismiss on a native <dialog>. The handler fires only when the target is the dialog element itself (the backdrop area), never a child, so it is a dismissal shortcut rather than a control. The keyboard equivalent already exists and is provided by the platform: <dialog> closes on Escape without any handler of ours.
            <dialog
              className="m-0 max-w-none border-none bg-transparent p-0 outline-none backdrop:bg-black/5 dark:backdrop:bg-black/20"
              onClick={(e) => {
                if (e.target === commentDialogRef.current) {
                  closeCommentCard();
                }
              }}
              ref={commentDialogRef}
              style={{ position: "fixed", left, top }}
            >
              {commentCard && (
                <div ref={commentCardRef}>
                  <CommentCard
                    anchorEnd={commentCard.anchorEnd}
                    anchorStart={commentCard.anchorStart}
                    blockId={commentCard.blockId}
                    currentUserId={currentUserId}
                    isAdmin={isAdmin}
                    onClose={closeCommentCard}
                    pageId={pageId}
                    workspaceId={workspaceId}
                  />
                </div>
              )}
            </dialog>
          );
        })()}
    </div>
  );
}
