"use client";

import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { TextSelection } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Highlighter,
  Italic,
  Link,
  MessageSquare,
  Paintbrush,
  Strikethrough,
  Underline,
} from "lucide-react";
import { useState } from "react";

interface Props {
  editor: Editor;
  onCommentSelection?: (anchorStart: number, anchorEnd: number) => void;
}

const btnBase =
  "flex size-7 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content";
const btnActive = "bg-base-200 text-base-content";

export function InlineToolbar({ editor, onCommentSelection }: Props) {
  const [linkInput, setLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  function applyLink() {
    if (linkUrl) {
      editor.chain().focus().setLink({ href: linkUrl }).run();
    } else {
      editor.chain().focus().unsetLink().run();
    }
    setLinkInput(false);
    setLinkUrl("");
  }

  return (
    <BubbleMenu
      className="flex items-center gap-0.5 rounded-sm border border-base-300 bg-base-100 p-1"
      editor={editor}
      // Default shouldShow only checks that the selection is non-empty, so a
      // NodeSelection on a block (e.g. a clicked-into inline database/embed)
      // satisfies it too — restrict to genuine text selections, keeping the
      // library's other default checks (focus, editability).
      shouldShow={({ view, state }) => {
        const { selection } = state;
        if (selection.empty || !(selection instanceof TextSelection)) {
          return false;
        }
        if (!view.hasFocus() || !editor.isEditable) {
          return false;
        }
        return true;
      }}
    >
      {linkInput ? (
        <div className="flex items-center gap-1 px-1">
          <input
            autoFocus
            className="h-6 w-48 rounded-sm border border-base-300 bg-base-200 px-2 text-xs outline-none"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                applyLink();
              }
              if (e.key === "Escape") {
                setLinkInput(false);
                setLinkUrl("");
              }
            }}
            placeholder="Paste link…"
            type="url"
            value={linkUrl}
          />
          <button
            className="text-xs font-medium text-base-content transition-colors duration-150 hover:text-base-content/70"
            onClick={applyLink}
            type="button"
          >
            Apply
          </button>
        </div>
      ) : (
        <>
          <button
            aria-label="Bold (Ctrl+B)"
            className={`${btnBase} ${editor.isActive("bold") ? btnActive : ""}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            type="button"
          >
            <Bold size={14} />
          </button>
          <button
            aria-label="Italic (Ctrl+I)"
            className={`${btnBase} ${editor.isActive("italic") ? btnActive : ""}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            type="button"
          >
            <Italic size={14} />
          </button>
          <button
            aria-label="Underline (Ctrl+U)"
            className={`${btnBase} ${editor.isActive("underline") ? btnActive : ""}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            type="button"
          >
            <Underline size={14} />
          </button>
          <button
            aria-label="Strikethrough"
            className={`${btnBase} ${editor.isActive("strike") ? btnActive : ""}`}
            onClick={() => editor.chain().focus().toggleStrike().run()}
            type="button"
          >
            <Strikethrough size={14} />
          </button>
          <button
            aria-label="Inline Code (Ctrl+E)"
            className={`${btnBase} ${editor.isActive("code") ? btnActive : ""}`}
            onClick={() => editor.chain().focus().toggleCode().run()}
            type="button"
          >
            <Code size={14} />
          </button>

          <div className="mx-0.5 h-4 w-px bg-base-300" />

          <button
            aria-label="Link (Ctrl+K)"
            className={`${btnBase} ${editor.isActive("link") ? btnActive : ""}`}
            onClick={() => {
              const prev = editor.getAttributes("link").href ?? "";
              setLinkUrl(prev);
              setLinkInput(true);
            }}
            type="button"
          >
            <Link size={14} />
          </button>

          <div className="mx-0.5 h-4 w-px bg-base-300" />

          {/* Text colour — quick swatches */}
          <ColorPicker
            active={editor.isActive("textStyle")}
            onSelect={(color) => editor.chain().focus().setColor(color).run()}
          />
          {/* Highlight */}
          <button
            aria-label="Highlight"
            className={`${btnBase} ${editor.isActive("highlight") ? btnActive : ""}`}
            onClick={() =>
              editor.chain().focus().toggleHighlight({ color: "#fde047" }).run()
            }
            type="button"
          >
            <Highlighter size={14} />
          </button>

          <div className="mx-0.5 h-4 w-px bg-base-300" />

          {/* Comment on selection */}
          <button
            aria-label="Comment (Ctrl+Shift+Alt+X)"
            className={btnBase}
            onClick={() => {
              const { from, to } = editor.state.selection;
              if (onCommentSelection && from !== to) {
                onCommentSelection(from, to);
              }
            }}
            type="button"
          >
            <MessageSquare size={14} />
          </button>
        </>
      )}
    </BubbleMenu>
  );
}

/* Color values are content data stored in the document — editor exception per CLAUDE.md Rule 5 */
const COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#000000",
];

function ColorPicker({
  onSelect,
  active,
}: {
  onSelect: (c: string) => void;
  active: boolean;
}) {
  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton
            aria-label="Text color"
            className={`${btnBase} ${active ? btnActive : ""}`}
          >
            <Paintbrush size={14} />
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: "bottom start", gap: 4 }}
            className="z-600 flex gap-1 rounded-sm border border-base-300 bg-neutral p-1.5 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
            transition
          >
            {COLORS.map((c) => (
              <button
                aria-label={`Set text color ${c}`}
                className="size-4 rounded-full border border-base-300 transition-colors duration-150"
                key={c}
                onClick={() => {
                  onSelect(c);
                  close();
                }}
                style={{ background: c }}
                type="button"
              />
            ))}
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
}
