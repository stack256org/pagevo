"use client";

import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { ArrowUpCircle, AtSign, Paperclip, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ImageLightbox } from "@/components/editor/comment-card";
import {
  MentionCommands,
  type MentionSuggestionProps,
} from "@/components/editor/extensions/mention-extension";
import { MentionNode } from "@/components/editor/extensions/mention-node";
import {
  MentionList,
  type MentionListHandle,
} from "@/components/editor/mention-list";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";

interface CommentComposerProps {
  autoFocus?: boolean;
  initialContent?: Record<string, unknown>;
  mode?: "new" | "reply" | "edit";
  onCancel?: () => void;
  onSubmit: (content: Record<string, unknown>) => Promise<void>;
  placeholder?: string;
  workspaceId: string;
}

type Attachment = { preview: string; name: string; mimeType: string };

const ATTACHMENT_NODE_TYPES = new Set(["image", "file", "attachment"]);

// The tiptap schema has no image/file/attachment node type, so handing one to `content:` would
// throw and silently blank the ENTIRE doc — strip all attachment-like nodes here and re-hydrate only the first into single-slot state.
function extractInitialAttachment(
  initialContent: Record<string, unknown> | undefined
): {
  docContent: Record<string, unknown> | undefined;
  attachment: Attachment | null;
} {
  const doc = initialContent as
    | { type?: string; content?: unknown[] }
    | undefined;
  if (!doc || !Array.isArray(doc.content)) {
    return { docContent: initialContent, attachment: null };
  }

  const attachmentNodes = doc.content.filter((n) => {
    const type = (n as Record<string, unknown> | null)?.type as
      | string
      | undefined;
    return !!type && ATTACHMENT_NODE_TYPES.has(type);
  });
  if (attachmentNodes.length === 0) {
    return { docContent: initialContent, attachment: null };
  }

  const node = attachmentNodes[0] as {
    type: string;
    attrs?: Record<string, unknown>;
  };
  const attrs = node.attrs ?? {};
  const src =
    (attrs.src as string | undefined) ?? (attrs.url as string | undefined);

  let attachment: Attachment | null = null;
  if (src) {
    if (node.type === "attachment") {
      attachment = {
        preview: src,
        name: (attrs.name as string) ?? "attachment",
        mimeType: (attrs.mimeType as string) ?? "application/octet-stream",
      };
    } else if (node.type === "file") {
      attachment = {
        preview: src,
        name: (attrs.name as string) ?? "attachment",
        mimeType: (attrs.mimeType as string) ?? "application/octet-stream",
      };
    } else {
      attachment = {
        preview: src,
        name: (attrs.alt as string) ?? "attachment",
        mimeType: src.match(/^data:([^;]+);/)?.[1] ?? "image/png",
      };
    }
  }

  const remaining = doc.content.filter((n) => {
    const type = (n as Record<string, unknown> | null)?.type as
      | string
      | undefined;
    return !type || !ATTACHMENT_NODE_TYPES.has(type);
  });
  return {
    docContent: {
      ...doc,
      content: remaining.length > 0 ? remaining : [{ type: "paragraph" }],
    },
    attachment,
  };
}

export function CommentComposer({
  workspaceId,
  placeholder = "Add a comment…",
  initialContent,
  mode = "new",
  onSubmit,
  onCancel,
  autoFocus = false,
}: CommentComposerProps) {
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Computed once per mount (this component remounts fresh each time edit
  // mode opens on a comment) — see extractInitialAttachment above.
  const [initial] = useState(() => extractInitialAttachment(initialContent));
  const [attachment, setAttachment] = useState<Attachment | null>(
    initial.attachment
  );
  const [attachLoading, setAttachLoading] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [editorEmpty, setEditorEmpty] = useState(true);

  const mentionListRef = useRef<MentionListHandle>(null);
  const [mentionProps, setMentionProps] =
    useState<MentionSuggestionProps | null>(null);
  // Ref so handleKeyDown (inside useEditor) always reads the current value without stale closure
  const mentionActiveRef = useRef(false);
  mentionActiveRef.current = !!mentionProps;

  useEffect(
    () => () => {
      if (attachment?.preview.startsWith("blob:")) {
        URL.revokeObjectURL(attachment.preview);
      }
    },
    [attachment]
  );

  function handleFile(file: File) {
    setAttachLoading(true);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      setAttachment({ preview: base64, name: file.name, mimeType: file.type });
      setAttachLoading(false);
    };
    reader.onerror = () => setAttachLoading(false);
    reader.readAsDataURL(file);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) {
      return;
    }
    handleFile(file);
  }

  const editor = useEditor({
    immediatelyRender: true,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        horizontalRule: false,
        link: false,
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder }),
      // MentionNode must come before MentionCommands so the node type is
      // registered before the suggestion plugin tries to insert mention nodes.
      MentionNode,
      MentionCommands.configure({
        workspaceId,
        onUpdate: (props) => setMentionProps(props),
        onKeyDown: (event) => mentionListRef.current?.onKeyDown(event) ?? false,
      }),
    ],
    content: initial.docContent ?? "",
    autofocus: autoFocus ? "end" : false,
    onUpdate({ editor: e }) {
      setEditorEmpty(e.isEmpty);
    },
    onCreate({ editor: e }) {
      setEditorEmpty(e.isEmpty);
    },
    editorProps: {
      attributes: {
        class: [
          "text-sm text-base-content leading-5 focus:outline-none",
          "min-h-6 max-h-30 overflow-y-auto px-3 pt-2.5 pb-1",
          "[&_p.is-empty:first-child]:before:content-[attr(data-placeholder)]",
          "[&_p.is-empty:first-child]:before:text-base-content/70",
          "[&_p.is-empty:first-child]:before:pointer-events-none",
          "[&_p.is-empty:first-child]:before:float-left",
          "[&_p.is-empty:first-child]:before:h-0",
        ].join(" "),
      },
      handleKeyDown(_view, event) {
        // When the @mention dropdown is open, let it handle navigation keys first.
        // Return false for Escape so the suggestion plugin can close the dropdown
        // instead of onCancel() firing.
        if (mentionActiveRef.current && mentionListRef.current) {
          if (
            event.key === "ArrowUp" ||
            event.key === "ArrowDown" ||
            event.key === "Enter"
          ) {
            const handled = mentionListRef.current.onKeyDown(event);
            if (handled) {
              event.preventDefault();
              return true;
            }
          }
          if (event.key === "Escape") {
            return false;
          }
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          handleSubmit();
          return true;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel?.();
          return true;
        }
        return false;
      },
      handlePaste(_view, event) {
        const file = event.clipboardData?.files?.[0];
        if (!file) {
          return false;
        }
        event.preventDefault();
        handleFile(file);
        return true;
      },
    },
  });

  async function handleSubmit() {
    if (editorEmpty && !attachment) {
      return;
    }

    const rawContent = editor?.getJSON() as Record<string, unknown> | undefined;
    let content: Record<string, unknown>;

    if (rawContent) {
      const doc = rawContent as { type: string; content?: unknown[] };
      if (attachment) {
        const isImage = attachment.mimeType.startsWith("image/");
        const attachNode = isImage
          ? {
              type: "image",
              attrs: { src: attachment.preview, alt: attachment.name },
            }
          : {
              type: "file",
              attrs: {
                src: attachment.preview,
                name: attachment.name,
                mimeType: attachment.mimeType,
              },
            };
        doc.content = [...(doc.content ?? []), attachNode];
      }
      content = doc as Record<string, unknown>;
    } else {
      const isImage = attachment?.mimeType.startsWith("image/") ?? false;
      content = {
        type: "doc",
        content: attachment
          ? [
              isImage
                ? {
                    type: "image",
                    attrs: { src: attachment.preview, alt: attachment.name },
                  }
                : {
                    type: "file",
                    attrs: {
                      src: attachment.preview,
                      name: attachment.name,
                      mimeType: attachment.mimeType,
                    },
                  },
            ]
          : [],
      };
    }

    await onSubmit(content);
    editor?.commands.clearContent();
    setAttachment(null);
  }

  const isEmpty = editorEmpty && !attachment;

  const containerCls =
    mode === "edit"
      ? "border-primary/40 bg-primary/5 focus-within:border-primary/60"
      : "border-transparent bg-base-100 focus-within:border-base-300";

  return (
    <div
      className={`relative rounded-md border transition-colors duration-150 ${containerCls}`}
    >
      {onCancel && (
        <button
          className="absolute -top-2 -right-2 h-5 w-5 rounded-full border border-base-300 bg-base-100 text-base-content/70 hover:text-error hover:border-error/40 flex items-center justify-center shadow-sm transition-colors duration-150 z-10"
          onClick={onCancel}
          onMouseEnter={(e) => showTooltip("Cancel (Esc)", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <X size={11} />
        </button>
      )}

      {/* Hidden file input */}
      <input
        accept="image/*,application/pdf,.doc,.docx,.txt"
        className="hidden"
        onChange={handleFileChange}
        ref={fileInputRef}
        type="file"
      />

      <EditorContent editor={editor} />

      {/* @mention suggestion dropdown */}
      {mentionProps && (
        <MentionList ref={mentionListRef} suggestionProps={mentionProps} />
      )}

      {/* Attachment preview */}
      {(attachment || attachLoading) && (
        <div className="px-3 pb-2">
          {attachLoading ? (
            <div className="flex items-center gap-2 p-2 rounded-sm bg-base-200 border border-base-300">
              <div className="h-3 w-3 rounded-full border-2 border-base-300 border-t-primary animate-spin" />
              <span className="text-xs text-base-content/70">Loading…</span>
            </div>
          ) : attachment ? (
            <div className="relative inline-block group">
              {attachment.preview.startsWith("data:image") ? (
                <button
                  className="block focus:outline-none cursor-zoom-in"
                  onClick={() => setPreviewOpen(true)}
                  type="button"
                >
                  {/* biome-ignore lint/performance/noImgElement: src can be a blob: object URL from URL.createObjectURL, which next/image cannot optimize */}
                  <img
                    alt={attachment.name}
                    className="max-w-full max-h-45 rounded-sm border border-base-300 object-cover"
                    src={attachment.preview}
                  />
                </button>
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 rounded-sm bg-base-200 border border-base-300">
                  <Paperclip className="text-base-content/70" size={14} />
                  <span className="text-xs text-base-content/70 truncate max-w-50">
                    {attachment.name}
                  </span>
                </div>
              )}
              <button
                className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-sm bg-base-content/70 text-base-200 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                onClick={() => setAttachment(null)}
                type="button"
              >
                <X size={9} />
              </button>
              {previewOpen && (
                <ImageLightbox
                  alt={attachment.name}
                  onClose={() => setPreviewOpen(false)}
                  src={attachment.preview}
                />
              )}
            </div>
          ) : null}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between px-2 pb-1.5 pt-0.5">
        <div className="flex items-center gap-0.5">
          <button
            className="p-1 rounded-sm text-base-content/70 hover:text-base-content/70 hover:bg-base-200 transition-colors duration-150"
            onClick={() => fileInputRef.current?.click()}
            onMouseEnter={(e) => showTooltip("Attach image or file", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <Paperclip size={13} />
          </button>

          <button
            className="p-1 rounded-sm text-base-content/70 hover:text-base-content/70 hover:bg-base-200 transition-colors duration-150"
            onClick={() => {
              editor?.commands.focus("end");
              editor?.commands.insertContent("@");
            }}
            onMouseEnter={(e) => showTooltip("Mention (@)", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            <AtSign size={13} />
          </button>
        </div>

        <button
          className={`p-1 rounded-sm transition-colors duration-150 ${
            isEmpty
              ? "text-base-content/70 cursor-not-allowed"
              : "text-primary hover:text-primary hover:bg-base-200"
          }`}
          disabled={isEmpty}
          onClick={handleSubmit}
          onMouseEnter={(e) => showTooltip("Submit (Enter)", e)}
          onMouseLeave={hideTooltip}
          type="button"
        >
          <ArrowUpCircle size={16} />
        </button>
      </div>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}
