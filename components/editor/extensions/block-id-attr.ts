import { Extension } from "@tiptap/react";

// Registers `blockId` as a known attr on StarterKit-based node types that don't
// define it natively. Without this, TipTap silently drops the attr when loading
// content from JSON, causing tiptapDocToBlocks to treat every existing block as
// a new insert (id: null) on each save → duplicate DB rows after refresh.
export const BlockIdAttr = Extension.create({
  name: "blockIdAttr",
  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "blockquote",
          "codeBlock",
          "bulletList",
          "orderedList",
          "taskList",
          "horizontalRule",
          "table",
        ],
        attributes: {
          blockId: {
            default: null,
            // Not persisted to HTML — purely internal JSON state tracking.
            parseHTML: () => null,
            renderHTML: () => ({}),
          },
        },
      },
    ];
  },
});
