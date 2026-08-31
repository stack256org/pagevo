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
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { useRef, useState } from "react";
import { BlockHandle } from "@/components/editor/block-handle";
import { BlockIdAttr } from "@/components/editor/extensions/block-id-attr";
import {
  BookmarkBlock,
  EmbedBlock,
} from "@/components/editor/extensions/bookmark-block";
import { Callout } from "@/components/editor/extensions/callout";
import {
  ListItemBlock,
  TaskItemBlock,
} from "@/components/editor/extensions/list-item-keymap";
import {
  Columns,
  TableOfContents,
} from "@/components/editor/extensions/reference-blocks";
import type { SlashSuggestionProps } from "@/components/editor/extensions/slash-commands";
import { SlashCommands } from "@/components/editor/extensions/slash-commands";
import { Toggle, ToggleSummary } from "@/components/editor/extensions/toggle";
import { InlineToolbar } from "@/components/editor/inline-toolbar";
import type { DbBlock } from "@/components/editor/serializer";
import {
  blocksToTiptapDoc,
  tiptapDocToBlocks,
} from "@/components/editor/serializer";
import {
  SlashMenu,
  type SlashMenuHandle,
} from "@/components/editor/slash-menu";
import { TemplateQuickInsert } from "./template-quick-insert";

const lowlight = createLowlight(common);

function serialize(e: { getJSON: () => unknown }): DbBlock[] {
  const raw = tiptapDocToBlocks(
    e.getJSON() as unknown as { content?: never[] },
    "template"
  );
  return raw.map((b, i) => ({
    id: b.id ?? `tmp-${i}`,
    type: b.type,
    content: b.content,
    orderIndex: i,
    parentBlockId: b.parentBlockId,
  }));
}

interface Props {
  initialBlocks: DbBlock[];
  /** Fired once with TipTap's normalized serialization, used as the "unchanged"
   *  baseline since load-time normalization would otherwise look like an edit. */
  onBaseline?: (blocks: DbBlock[]) => void;
  onChange: (blocks: DbBlock[]) => void;
}

export function TemplateEditor({ initialBlocks, onChange, onBaseline }: Props) {
  const [slashProps, setSlashProps] = useState<SlashSuggestionProps | null>(
    null
  );
  const [isEmpty, setIsEmpty] = useState(initialBlocks.length === 0);
  const slashMenuRef = useRef<SlashMenuHandle>(null);
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        link: false,
        underline: false,
        listItem: false,
      }),
      Placeholder.configure({
        placeholder: ({ node }) =>
          node.type.name === "heading"
            ? "Heading"
            : "Start writing template content, or press / to insert a block…",
        includeChildren: false,
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
      TableOfContents,
      Columns,
      BookmarkBlock,
      EmbedBlock,
      BlockIdAttr,
      SlashCommands.configure({
        onUpdate: (props) => setSlashProps(props),
        onKeyDown: (event) => slashMenuRef.current?.onKeyDown(event) ?? false,
      }),
    ],
    editable: true,
    content: blocksToTiptapDoc(initialBlocks),
    onCreate({ editor: e }) {
      onBaseline?.(serialize(e));
    },
    onUpdate({ editor: e }) {
      setIsEmpty(e.isEmpty);
      if (changeTimer.current) {
        clearTimeout(changeTimer.current);
      }
      changeTimer.current = setTimeout(() => onChange(serialize(e)), 300);
    },
  });

  return (
    <div className="relative min-h-140 rounded-md border border-base-300 bg-base-200">
      {editor && <InlineToolbar editor={editor} />}
      {/* Same drag-to-reorder / duplicate / delete grip the page editor uses. */}
      {editor && <BlockHandle editor={editor} />}

      {editor && (
        <div className="flex items-center gap-1 border-b border-base-300 px-4 py-1.5">
          <TemplateQuickInsert editor={editor} variant="toolbar" />
        </div>
      )}

      {/* pl-18: BlockHandle anchors itself 58px to the left of the
          .ProseMirror element (block-handle.tsx getBlockRect). The page editor
          absorbs that in its page margins; here the editor sits in a bordered
          box, so the left padding has to exceed 58px or the grip renders on
          top of — and outside — the border. */}
      <EditorContent
        className="prose prose-neutral dark:prose-invert max-w-none pl-18 pr-10 py-6 text-base focus-within:outline-none [&_.ProseMirror]:min-h-115 [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child]:before:float-left [&_.ProseMirror_p.is-editor-empty:first-child]:before:h-0 [&_.ProseMirror_p.is-editor-empty:first-child]:before:text-base-content/70 [&_.ProseMirror_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)]"
        editor={editor}
      />

      {editor && isEmpty && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pl-18 pr-10 pb-6">
          <p className="mb-2 text-xs text-base-content/70">Or start with:</p>
          <div className="pointer-events-auto">
            <TemplateQuickInsert editor={editor} variant="empty" />
          </div>
        </div>
      )}

      {slashProps && (
        <SlashMenu ref={slashMenuRef} suggestionProps={slashProps} />
      )}
    </div>
  );
}
