"use client";

import type { Editor } from "@tiptap/react";
import {
  BLOCK_REGISTRY,
  type BlockType,
} from "@/components/editor/block-registry";
import { insertBlockType } from "@/components/editor/extensions/slash-commands";

// The blocks worth a one-click affordance when authoring a template. Kept to
// what the template editor actually registers as extensions — database views
// (board/calendar/gallery) need a real database page, so they have no slash
// command to call and are deliberately absent.
const QUICK_BLOCKS: BlockType[] = [
  "paragraph",
  "h1",
  "todo",
  "table",
  "quote",
  "callout",
  "divider",
];

// Labels come from BLOCK_REGISTRY so these buttons stay in lockstep with the
// "/" menu, except where the registry's page-editor wording is longer than a
// compact button warrants.
const SHORT_LABEL: Partial<Record<BlockType, string>> = {
  h1: "Heading",
  todo: "Checklist",
  table: "Table",
};

interface Props {
  editor: Editor;
  /** "toolbar" is the compact row above the editor; "empty" is the larger
   *  prompt shown inside an otherwise-blank editor. */
  variant: "toolbar" | "empty";
}

export function TemplateQuickInsert({ editor, variant }: Props) {
  const isEmpty = variant === "empty";

  return (
    <div
      className={
        isEmpty ? "flex flex-wrap gap-1.5" : "flex flex-wrap items-center gap-1"
      }
    >
      {QUICK_BLOCKS.map((type) => {
        const def = BLOCK_REGISTRY[type];
        return (
          <button
            className={[
              "flex items-center gap-1.5 rounded-sm border text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content",
              isEmpty
                ? "border-base-300 bg-base-200 px-2.5 py-1.5 text-xs"
                : "border-transparent px-2 py-1 text-xs",
            ].join(" ")}
            key={type}
            onClick={() => insertBlockType(editor, type)}
            // Keep the caret where it is — mousedown would otherwise blur the
            // editor and the insert would land at the wrong position.
            onMouseDown={(e) => e.preventDefault()}
            title={def.description}
            type="button"
          >
            <span
              aria-hidden
              className="text-[13px] leading-none text-base-content/70"
            >
              {def.icon}
            </span>
            {SHORT_LABEL[type] ?? def.label}
          </button>
        );
      })}
    </div>
  );
}
