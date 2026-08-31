"use client";

import type { NodeViewProps } from "@tiptap/react";
import {
  mergeAttributes,
  Node,
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

// Synced Block v1: source blocks (`sourceBlockId` empty) hold real editable content; reference
// blocks (`sourceBlockId` set) have no children and fetch+render the source read-only on mount (not push-realtime).
// A reference is created by pasting `SYNCED:<id>` as the first text into a fresh synced block.

const SYNCED_PASTE_PATTERN = /^SYNCED:([a-zA-Z0-9_-]{6,})$/;

function ReadOnlyInline({
  node,
}: {
  node: {
    type: string;
    text?: string;
    marks?: { type: string }[];
    content?: unknown[];
  };
}) {
  if (node.type === "text") {
    let el: React.ReactNode = node.text ?? "";
    for (const mark of node.marks ?? []) {
      if (mark.type === "bold") {
        el = <strong>{el}</strong>;
      } else if (mark.type === "italic") {
        el = <em>{el}</em>;
      } else if (mark.type === "underline") {
        el = <u>{el}</u>;
      } else if (mark.type === "strike") {
        el = <s>{el}</s>;
      } else if (mark.type === "code") {
        el = (
          <code className="rounded bg-base-200 px-1 py-0.5 text-[0.85em]">
            {el}
          </code>
        );
      }
    }
    return <>{el}</>;
  }
  return null;
}

// Small, dependency-free renderer for the common text-bearing node types —
// avoids mounting a second full TipTap editor instance just to display
// read-only synced content.
//
// Every child list below is keyed by array index, and each one carries its own
// suppression for noArrayIndexKey. The reason is the same throughout and is
// structural rather than incidental: this walks a ProseMirror document
// fragment, where a node's position in its parent's `content` array *is* its
// identity — that is how ProseMirror addresses nodes, and the nodes have no id
// attribute to key on instead. The render is also read-only and stateless (no
// inputs, no local state, no handlers), so even a full remount on an upstream
// edit is inert. Giving these nodes synthetic ids would mean writing them into
// the stored document JSON, which Hard Rule 5 forbids without a schema_version
// bump and migration.
function ReadOnlyNode({
  node,
}: {
  node: { type: string; content?: unknown[]; attrs?: Record<string, unknown> };
}) {
  const kids = (node.content ?? []) as {
    type: string;
    text?: string;
    marks?: { type: string }[];
    content?: unknown[];
  }[];

  switch (node.type) {
    case "paragraph":
      return (
        <p className="text-sm text-base-content">
          {kids.map((k, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
            <ReadOnlyInline key={i} node={k} />
          ))}
        </p>
      );
    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      return (
        <Tag className="font-semibold text-base-content">
          {kids.map((k, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
            <ReadOnlyInline key={i} node={k} />
          ))}
        </Tag>
      );
    }
    case "bulletList":
      return (
        <ul className="list-disc pl-5 text-sm text-base-content">
          {(
            (node.content as { type: string; content?: unknown[] }[]) ?? []
          ).map((li, i) => (
            <ReadOnlyNode
              // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
              key={i}
              node={{ type: "listItem", content: li.content }}
            />
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol className="list-decimal pl-5 text-sm text-base-content">
          {(
            (node.content as { type: string; content?: unknown[] }[]) ?? []
          ).map((li, i) => (
            <ReadOnlyNode
              // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
              key={i}
              node={{ type: "listItem", content: li.content }}
            />
          ))}
        </ol>
      );
    case "listItem":
      return (
        <li>
          {(
            (node.content as { type: string; content?: unknown[] }[]) ?? []
          ).map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
            <ReadOnlyNode key={i} node={p} />
          ))}
        </li>
      );
    case "blockquote":
      return (
        <blockquote className="border-l-2 border-base-300 pl-3 text-sm italic text-base-content/70">
          {(
            (node.content as { type: string; content?: unknown[] }[]) ?? []
          ).map((p, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
            <ReadOnlyNode key={i} node={p} />
          ))}
        </blockquote>
      );
    default:
      return kids.length ? (
        <p className="text-sm text-base-content">
          {kids.map((k, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
            <ReadOnlyInline key={i} node={k} />
          ))}
        </p>
      ) : null;
  }
}

interface SyncedContentResponse {
  content: {
    type: string;
    content?: unknown[];
    attrs?: Record<string, unknown>;
  }[];
  sourcePageId: string;
  sourcePageTitle: string | null;
}

function SyncedReferenceView({ sourceBlockId }: { sourceBlockId: string }) {
  const [data, setData] = useState<SyncedContentResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/blocks/${sourceBlockId}/synced-content`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: SyncedContentResponse) => {
        if (!cancelled) {
          setData(d);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sourceBlockId]);

  return (
    <NodeViewWrapper contentEditable={false}>
      <div className="my-1 rounded-md border border-base-300 bg-base-200/20 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
          🔄 Synced
          {data?.sourcePageTitle ? ` from ${data.sourcePageTitle}` : ""}
        </p>
        {error && (
          <p className="text-xs text-error">
            Couldn&rsquo;t load synced content — the source may have been
            deleted.
          </p>
        )}
        {!error && !data && (
          <div className="h-4 w-2/3 animate-pulse rounded-xs bg-base-200/40" />
        )}
        {data && (
          <div className="space-y-1.5">
            {data.content.length === 0 && (
              <p className="text-xs text-base-content/70">Empty</p>
            )}
            {data.content.map((node, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: positional ProseMirror node — see the note on ReadOnlyNode.
              <ReadOnlyNode key={i} node={node} />
            ))}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function SyncedSourceView({ node, editor, getPos }: NodeViewProps) {
  const blockId = (node.attrs.blockId as string) || "";

  async function handleCopy() {
    if (!blockId) {
      toast.error("Save the page first, then copy this synced block.");
      return;
    }
    await navigator.clipboard.writeText(`SYNCED:${blockId}`);
    toast.success(
      "Copied — paste into a new Synced block elsewhere to link it here."
    );
  }

  // Detects the freshly-inserted, still-empty synced block being turned into
  // a reference by pasting/typing exactly `SYNCED:<id>` as its only content.
  useEffect(() => {
    function onUpdate() {
      const pos = typeof getPos === "function" ? getPos() : null;
      if (pos == null) {
        return;
      }
      const current = editor.state.doc.nodeAt(pos);
      if (current?.type.name !== "syncedBlock") {
        return;
      }
      const text = current.textContent.trim();
      const match = text.match(SYNCED_PASTE_PATTERN);
      if (!match) {
        return;
      }
      const sourceId = match[1];
      if (sourceId === blockId) {
        return; // can't reference itself
      }
      editor
        .chain()
        .command(({ tr }) => {
          tr.setNodeMarkup(pos, undefined, {
            ...current.attrs,
            sourceBlockId: sourceId,
          });
          // Drop the placeholder text now that this is a reference instance.
          tr.delete(pos + 1, pos + current.nodeSize - 1);
          return true;
        })
        .run();
    }
    editor.on("update", onUpdate);
    return () => {
      editor.off("update", onUpdate);
    };
  }, [editor, getPos, blockId]);

  return (
    <NodeViewWrapper>
      <div className="my-1 rounded-md border border-base-300 bg-base-200/10 p-3">
        <div
          className="mb-2 flex items-center justify-between"
          contentEditable={false}
        >
          <p className="flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-base-content/70">
            🔄 Synced Block
          </p>
          <button
            className="rounded-xs px-2 py-0.5 text-xs text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
            onClick={handleCopy}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            Copy
          </button>
        </div>
        <NodeViewContent className="space-y-1 text-sm text-base-content" />
      </div>
    </NodeViewWrapper>
  );
}

function SyncedBlockView(props: NodeViewProps) {
  const sourceBlockId = (props.node.attrs.sourceBlockId as string) || "";
  if (sourceBlockId) {
    return <SyncedReferenceView sourceBlockId={sourceBlockId} />;
  }
  return <SyncedSourceView {...props} />;
}

export const SyncedBlock = Node.create({
  name: "syncedBlock",
  group: "block",
  content: "block*",
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      sourceBlockId: { default: "" },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-type='syncedBlock']" }];
  },
  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "syncedBlock" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SyncedBlockView);
  },
});
