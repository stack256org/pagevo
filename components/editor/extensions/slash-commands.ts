import { PluginKey } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/react";
import { Extension } from "@tiptap/react";
import type { SuggestionProps } from "@tiptap/suggestion";
import Suggestion from "@tiptap/suggestion";
import {
  type BlockDefinition,
  getMenuBlocks,
  searchBlocks,
} from "../block-registry";

export type SlashSuggestionProps = SuggestionProps<BlockDefinition>;

// Exported so the editor's autosave can check whether the "/" trigger is
// still live (mid-query, no command picked yet) before persisting — the
// character is real, unstyled paragraph text until a command is chosen, so
// saving while this is active would write a literal "/" to the DB.
export const SLASH_COMMANDS_PLUGIN_KEY = new PluginKey("slashCommands");

export interface SlashCommandsOptions {
  onKeyDown: (event: KeyboardEvent) => boolean;
  onUpdate: (props: SlashSuggestionProps | null) => void;
}

// ProseMirror node each block type resolves to, for the block types inserted
// via a built-in command rather than an explicit node shape. Paired with
// CUSTOM_NODES below, this covers every entry in the block registry.
const NATIVE_NODE_NAME: Record<string, string> = {
  paragraph: "paragraph",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  bullet: "bulletList",
  numbered: "orderedList",
  todo: "taskList",
  quote: "blockquote",
  code: "codeBlock",
  table: "table",
};

const CUSTOM_NODES: Partial<
  Record<string, { type: string } & Record<string, unknown>>
> = {
  divider: { type: "horizontalRule" },
  callout: {
    type: "callout",
    attrs: { icon: "💡", color: "" },
    content: [{ type: "paragraph" }],
  },
  toggle: {
    type: "toggle",
    attrs: { open: true },
    content: [{ type: "toggleSummary", content: [] }, { type: "paragraph" }],
  },
  image: {
    type: "imageBlock",
    attrs: { src: "", caption: "", width: 720 },
  },
  video: { type: "videoBlock", attrs: { src: "", caption: "" } },
  audio: { type: "audioBlock", attrs: { src: "", caption: "" } },
  file: { type: "fileBlock", attrs: { src: "", caption: "" } },
  pdf: { type: "pdfBlock", attrs: { src: "", caption: "" } },
  toc: { type: "tableOfContents" },
  equation: { type: "mathBlock", attrs: { expression: "" } },
  columns: {
    type: "columns",
    attrs: { columnCount: 2 },
    content: [{ type: "paragraph" }, { type: "paragraph" }],
  },
  breadcrumb: { type: "breadcrumbBlock" },
  synced_block: {
    type: "syncedBlock",
    attrs: { sourceBlockId: "" },
    content: [{ type: "paragraph" }],
  },
  linked_page: { type: "linkedPage", attrs: { pageId: "" } },
  sub_page: { type: "subPageBlock", attrs: { pageId: "" } },
  database: {
    type: "inlineDatabase",
    attrs: { databaseId: "", defaultViewId: "" },
  },
  template_button: {
    type: "templateButton",
    attrs: {
      label: "New Entry",
      insertLocation: "below_button",
      templateBlocks: [{ type: "paragraph", text: "" }],
    },
  },
  embed: { type: "embedBlock", attrs: { url: "" } },
  bookmark: { type: "bookmarkBlock", attrs: { url: "" } },
};

// Whether this editor's schema actually has the extension registered — editors with a subset
// of blocks (e.g. the Orbit template editor) would otherwise list "/" items that silently no-op.
export function isBlockAvailable(editor: Editor, type: string): boolean {
  const nodeName = NATIVE_NODE_NAME[type] ?? CUSTOM_NODES[type]?.type;
  if (!nodeName) {
    return true;
  }
  return !!editor.schema.nodes[nodeName];
}

// Block-type → editor command, shared by the "/" menu and quick-insert buttons so both go
// through the same path. `range` (the typed "/query") is only passed by the slash menu.
export function insertBlockType(
  editor: Editor,
  type: string,
  range?: { from: number; to: number }
): void {
  const chain = () =>
    range ? editor.chain().deleteRange(range) : editor.chain().focus();

  const native: Partial<Record<string, () => boolean>> = {
    paragraph: () => chain().setParagraph().run(),
    h1: () => chain().setHeading({ level: 1 }).run(),
    h2: () => chain().setHeading({ level: 2 }).run(),
    h3: () => chain().setHeading({ level: 3 }).run(),
    bullet: () => chain().toggleBulletList().run(),
    numbered: () => chain().toggleOrderedList().run(),
    todo: () => chain().toggleTaskList().run(),
    quote: () => chain().setBlockquote().run(),
    code: () => chain().setCodeBlock().run(),
    table: () =>
      chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  };

  if (native[type]) {
    native[type]!();
    return;
  }

  const content = CUSTOM_NODES[type];
  if (!content) {
    return;
  }

  // Button path: there's no "/query" to consume, and the caret may sit inside
  // real prose — replacing the whole node there would silently destroy it, so
  // only replace when the current block is empty and otherwise insert.
  if (!range) {
    const { $from } = editor.state.selection;
    if ($from.parent.content.size > 0) {
      editor.chain().focus().insertContent(content).run();
      return;
    }
  }

  // Single atomic transaction: delete "/" and replace the entire paragraph
  // node with the new block in one step so no intermediate state (empty
  // paragraph or orphaned "/") is ever saved to the DB.
  const insertChain = editor.chain().focus();
  if (range) {
    insertChain.deleteRange(range);
  }
  insertChain
    .command(({ tr, state }) => {
      const { $from } = state.selection;
      try {
        const node = state.schema.nodeFromJSON(content);
        tr.replaceRangeWith(
          $from.before($from.depth),
          $from.after($from.depth),
          node
        );
        return true;
      } catch {
        // Fallback: plain insert if schema rejects the node shape.
        return false;
      }
    })
    .run();
}

export const SlashCommands = Extension.create<SlashCommandsOptions>({
  name: "slashCommands",

  addOptions() {
    return {
      onUpdate: () => {},
      onKeyDown: () => false,
    };
  },

  addProseMirrorPlugins() {
    // Capture options in a local ref so the render callbacks always call the
    // latest React setters without recreating the plugin on every render.
    const opts = this.options;
    const editor = this.editor;

    return [
      Suggestion<BlockDefinition>({
        pluginKey: SLASH_COMMANDS_PLUGIN_KEY,
        editor,
        char: "/",
        startOfLine: false,
        allowSpaces: false,

        // Returns block items filtered by the user's query, minus any whose
        // extension this editor doesn't register (see isBlockAvailable).
        items: ({ query }) =>
          (query.trim() ? searchBlocks(query) : getMenuBlocks()).filter((def) =>
            isBlockAvailable(editor, def.type)
          ),

        // Called by the menu when the user picks a block.
        // `range` is plugin-maintained and always points at "/" … cursor.
        command: ({ editor, range, props: def }) => {
          insertBlockType(editor, def.type, range);
        },

        render: () => ({
          onStart: (props) => opts.onUpdate(props),
          onUpdate: (props) => opts.onUpdate(props),
          onExit: () => opts.onUpdate(null),
          onKeyDown: ({ event }) => opts.onKeyDown(event),
        }),
      }),
    ];
  },
});
