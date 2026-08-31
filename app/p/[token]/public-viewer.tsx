"use client";

import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableRow } from "@tiptap/extension-table-row";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { common, createLowlight } from "lowlight";
import { Callout } from "@/components/editor/extensions/callout";
import {
  AudioBlock,
  FileBlock,
  ImageBlock,
  VideoBlock,
} from "@/components/editor/extensions/media-blocks";
import { MentionNode } from "@/components/editor/extensions/mention-node";
import {
  Columns,
  InlineDatabase,
  LinkedPage,
  MathBlock,
  TableOfContents,
  TemplateButton,
} from "@/components/editor/extensions/reference-blocks";
import { Toggle, ToggleSummary } from "@/components/editor/extensions/toggle";
import {
  blocksToTiptapDoc,
  type DbBlock,
} from "@/components/editor/serializer";

const lowlight = createLowlight(common);

interface Props {
  blocks: DbBlock[];
}

export function PublicPageViewer({ blocks }: Props) {
  const editor = useEditor({
    immediatelyRender: true,
    editable: false,
    extensions: [
      StarterKit.configure({ codeBlock: false, link: false, underline: false }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Underline,
      Link.configure({ openOnClick: true, autolink: true }),
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
      // Required so TipTap's nodeFromJSON recognizes "mention" nodes, or it blanks the whole document.
      // No workspaceSlug: anonymous viewers can't follow a mention link, so it renders as plain text.
      MentionNode,
      ImageBlock,
      VideoBlock,
      AudioBlock,
      FileBlock,
      LinkedPage,
      InlineDatabase.configure({
        workspaceId: "",
        workspaceSlug: "",
        isEditor: false,
      }),
      TemplateButton,
      TableOfContents,
      MathBlock,
      Columns,
    ],
    content: blocksToTiptapDoc(blocks),
  });

  return (
    <EditorContent
      className="prose prose-sm sm:prose-base max-w-none focus:outline-none"
      editor={editor}
    />
  );
}
