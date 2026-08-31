// Converts between our DB block format and TipTap JSON.
// DB content shape is defined in doc/Features/editor.md § Data Model.

export type InlineNode =
  | { text: string; marks?: string[]; attrs?: Record<string, unknown> }
  | {
      type: "mention" | "pageMention" | "dateMention";
      attrs: Record<string, unknown>;
    };

export interface BlockContent {
  caption?: string;
  checked?: boolean;
  code?: string;
  color?: string; // for callout bg
  columnCount?: number;
  databaseId?: string;
  defaultViewId?: string;
  description?: string; // for bookmark
  expression?: string;
  favicon?: string; // for bookmark
  fileName?: string; // for embed (uploaded file)
  icon?: string; // for callout
  image?: string; // for bookmark
  insertLocation?: "below_button" | "bottom_of_page"; // for template_button
  label?: string;
  language?: string;
  level?: number;
  lineNumbers?: boolean;
  mimeType?: string; // for embed (uploaded file)
  objectKey?: string;
  open?: boolean; // for toggle — expanded/collapsed state
  pageId?: string;
  siteName?: string; // for bookmark
  sourceBlockId?: string; // for synced_block reference instances
  // Whole table grid stored inline (not as child block rows) since rows/cells aren't
  // independently addressable elsewhere in the app. Mirrors template_button's templateBlocks.
  tableRows?: {
    cells: {
      colspan?: number;
      isHeader?: boolean;
      // One entry per paragraph in the cell — cells hold block content, not
      // raw inline, and are usually but not always a single paragraph.
      paragraphs: InlineNode[][];
      rowspan?: number;
    }[];
  }[];
  templateBlocks?: { type: string; text: string }[]; // for template_button
  text?: InlineNode[];
  title?: string; // for bookmark
  url?: string;
  width?: number;
}

// TipTap mark → our mark string
function tiptapMarkToString(mark: {
  type: string;
  attrs?: Record<string, unknown>;
}): string | { type: string; attrs: Record<string, unknown> } {
  if (mark.type === "link") {
    return { type: "link", attrs: { href: mark.attrs?.href ?? "" } };
  }
  return mark.type; // bold, italic, underline, strike, code, highlight, textStyle
}

// Our mark string → TipTap mark
function stringToTiptapMark(
  mark: string | { type: string; attrs: Record<string, unknown> }
): Record<string, unknown> {
  if (typeof mark === "object") {
    return { type: mark.type, attrs: mark.attrs };
  }
  if (mark === "strikethrough") {
    return { type: "strike" };
  }
  if (mark === "textColor") {
    return { type: "textStyle" };
  }
  return { type: mark };
}

// TipTap inline content array → our InlineNode array
function tiptapContentToInline(nodes: TipTapNode[]): InlineNode[] {
  const result: InlineNode[] = [];
  for (const n of nodes ?? []) {
    if (n.type === "text") {
      result.push({
        text: n.text ?? "",
        marks: (n.marks ?? []).map((m) => {
          const s = tiptapMarkToString(
            m as { type: string; attrs?: Record<string, unknown> }
          );
          return typeof s === "string" ? s : JSON.stringify(s);
        }),
      });
    } else if (
      n.type === "mention" ||
      n.type === "pageMention" ||
      n.type === "dateMention"
    ) {
      result.push({ type: n.type, attrs: n.attrs ?? {} });
    }
  }
  return result;
}

// Our InlineNode array → TipTap inline content array
function inlineToTiptapContent(nodes: InlineNode[]): TipTapNode[] {
  return (nodes ?? []).flatMap((n): TipTapNode[] => {
    if ("type" in n) {
      return [{ type: n.type, attrs: n.attrs }];
    }
    // TipTap/ProseMirror does not allow empty text nodes
    if (!n.text) {
      return [];
    }
    const marks = (n.marks ?? []).map((m) => {
      try {
        const p = JSON.parse(m) as
          | string
          | { type: string; attrs: Record<string, unknown> };
        return stringToTiptapMark(p) as {
          type: string;
          attrs?: Record<string, unknown>;
        };
      } catch {
        return stringToTiptapMark(m) as {
          type: string;
          attrs?: Record<string, unknown>;
        };
      }
    });
    const node: TipTapNode = { type: "text", text: n.text };
    if (marks.length) {
      node.marks = marks;
    }
    return [node];
  });
}

export interface TipTapNode {
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
  type: string;
}

// TipTap table node → our stored grid shape.
function tiptapTableToRows(node: TipTapNode): BlockContent["tableRows"] {
  return (node.content ?? [])
    .filter((row) => row.type === "tableRow")
    .map((row) => ({
      cells: (row.content ?? [])
        .filter(
          (cell) => cell.type === "tableCell" || cell.type === "tableHeader"
        )
        .map((cell) => ({
          colspan: (cell.attrs?.colspan as number) ?? 1,
          isHeader: cell.type === "tableHeader",
          paragraphs: (cell.content ?? [])
            .filter((p) => p.type === "paragraph")
            .map((p) => tiptapContentToInline(p.content ?? [])),
          rowspan: (cell.attrs?.rowspan as number) ?? 1,
        })),
    }));
}

// Our stored grid shape → TipTap table content. ProseMirror's table schema
// requires at least one row, each with at least one cell, each containing at
// least one block — so empty/missing pieces are backfilled rather than emitted
// as-is, which would produce a document TipTap refuses to load.
function rowsToTiptapTable(rows: BlockContent["tableRows"]): TipTapNode[] {
  const src = rows?.length ? rows : [{ cells: [] }];
  return src.map((row) => {
    const cells = row.cells?.length
      ? row.cells
      : [{ isHeader: false, paragraphs: [] as InlineNode[][] }];
    return {
      type: "tableRow",
      content: cells.map((cell) => ({
        type: cell.isHeader ? "tableHeader" : "tableCell",
        attrs: {
          colspan: cell.colspan ?? 1,
          colwidth: null,
          rowspan: cell.rowspan ?? 1,
        },
        content: (cell.paragraphs?.length ? cell.paragraphs : [[]]).map(
          (p) => ({
            type: "paragraph",
            content: inlineToTiptapContent(p),
          })
        ),
      })),
    };
  });
}

export interface DbBlock {
  children?: DbBlock[];
  content: BlockContent;
  id: string;
  orderIndex: number;
  parentBlockId: string | null;
  type: string;
}

// Convert one DB block → TipTap node
export function blockToTipTapNode(block: DbBlock): TipTapNode {
  const c = (block.content ?? {}) as BlockContent;
  const id = block.id;

  switch (block.type) {
    case "paragraph":
      return {
        type: "paragraph",
        attrs: { blockId: id },
        content: inlineToTiptapContent(c.text ?? []),
      };

    case "h1":
      return {
        type: "heading",
        attrs: { level: 1, blockId: id },
        content: inlineToTiptapContent(c.text ?? []),
      };
    case "h2":
      return {
        type: "heading",
        attrs: { level: 2, blockId: id },
        content: inlineToTiptapContent(c.text ?? []),
      };
    case "h3":
      return {
        type: "heading",
        attrs: { level: 3, blockId: id },
        content: inlineToTiptapContent(c.text ?? []),
      };

    case "bullet":
      return {
        type: "bulletList",
        attrs: { blockId: id },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: inlineToTiptapContent(c.text ?? []),
              },
            ],
          },
        ],
      };

    case "numbered":
      return {
        type: "orderedList",
        attrs: { blockId: id },
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: inlineToTiptapContent(c.text ?? []),
              },
            ],
          },
        ],
      };

    case "todo":
      return {
        type: "taskList",
        attrs: { blockId: id },
        content: [
          {
            type: "taskItem",
            attrs: { checked: c.checked ?? false },
            content: [
              {
                type: "paragraph",
                content: inlineToTiptapContent(c.text ?? []),
              },
            ],
          },
        ],
      };

    case "quote":
      return {
        type: "blockquote",
        attrs: { blockId: id },
        content: [
          { type: "paragraph", content: inlineToTiptapContent(c.text ?? []) },
        ],
      };

    case "callout":
      return {
        type: "callout",
        attrs: { blockId: id, icon: c.icon ?? "💡", color: c.color ?? "" },
        content: [
          { type: "paragraph", content: inlineToTiptapContent(c.text ?? []) },
        ],
      };

    case "toggle":
      return {
        type: "toggle",
        attrs: { blockId: id, open: c.open ?? false },
        content: [
          {
            type: "toggleSummary",
            content: inlineToTiptapContent(c.text ?? []),
          },
          ...(block.children ?? []).map(blockToTipTapNode),
        ],
      };

    case "divider":
      return { type: "horizontalRule", attrs: { blockId: id } };

    case "code": {
      const codeText = c.code ?? "";
      return {
        type: "codeBlock",
        attrs: { language: c.language ?? "", blockId: id },
        content: codeText ? [{ type: "text", text: codeText }] : [],
      };
    }

    case "equation":
      return {
        type: "mathBlock",
        attrs: { expression: c.expression ?? "", blockId: id },
      };

    case "image":
      return {
        type: "imageBlock",
        attrs: {
          src: c.url ?? "",
          caption: c.caption ?? "",
          width: c.width ?? 720,
          objectKey: c.objectKey ?? "",
          blockId: id,
        },
      };

    case "video":
      return {
        type: "videoBlock",
        attrs: { src: c.url ?? "", caption: c.caption ?? "", blockId: id },
      };

    case "audio":
      return {
        type: "audioBlock",
        attrs: { src: c.url ?? "", caption: c.caption ?? "", blockId: id },
      };

    case "file":
      return {
        type: "fileBlock",
        attrs: {
          src: c.url ?? "",
          caption: c.caption ?? "",
          objectKey: c.objectKey ?? "",
          blockId: id,
        },
      };

    case "pdf":
      return {
        type: "pdfBlock",
        attrs: {
          src: c.url ?? "",
          caption: c.caption ?? "",
          objectKey: c.objectKey ?? "",
          blockId: id,
        },
      };

    case "embed":
      return {
        type: "embedBlock",
        attrs: {
          url: c.url ?? "",
          fileName: c.fileName ?? "",
          mimeType: c.mimeType ?? "",
          blockId: id,
        },
      };

    case "bookmark":
      return {
        type: "bookmarkBlock",
        attrs: {
          url: c.url ?? "",
          title: c.title ?? "",
          description: c.description ?? "",
          image: c.image ?? "",
          favicon: c.favicon ?? "",
          siteName: c.siteName ?? "",
          blockId: id,
        },
      };

    case "toc":
      return { type: "tableOfContents", attrs: { blockId: id } };

    case "columns":
      return {
        type: "columns",
        attrs: { columnCount: c.columnCount ?? 2, blockId: id },
        content: block.children?.map(blockToTipTapNode) ?? [],
      };

    case "linked_page":
      return {
        type: "linkedPage",
        attrs: { pageId: c.pageId ?? "", blockId: id },
      };

    case "sub_page":
      return {
        type: "subPageBlock",
        attrs: { pageId: c.pageId ?? "", blockId: id },
      };

    case "breadcrumb":
      return { type: "breadcrumbBlock", attrs: { blockId: id } };

    case "synced_block":
      return {
        type: "syncedBlock",
        attrs: { sourceBlockId: c.sourceBlockId ?? "", blockId: id },
        content: block.children?.map(blockToTipTapNode) ?? [],
      };

    case "database":
      return {
        type: "inlineDatabase",
        attrs: {
          databaseId: c.databaseId ?? "",
          defaultViewId: c.defaultViewId ?? "",
          blockId: id,
        },
      };

    case "template_button":
      return {
        type: "templateButton",
        attrs: {
          label: c.label ?? "Template",
          insertLocation: c.insertLocation ?? "below_button",
          templateBlocks: c.templateBlocks ?? [{ type: "paragraph", text: "" }],
          blockId: id,
        },
      };

    case "table":
      return {
        type: "table",
        attrs: { blockId: id },
        content: rowsToTiptapTable(c.tableRows),
      };

    default:
      return { type: "paragraph", attrs: { blockId: id }, content: [] };
  }
}

// Convert TipTap node → DB block content shape
export function tiptapNodeToBlockContent(node: TipTapNode): {
  type: string;
  content: BlockContent;
} {
  switch (node.type) {
    case "paragraph":
      return {
        type: "paragraph",
        content: { text: tiptapContentToInline(node.content ?? []) },
      };

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const t = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
      return {
        type: t,
        content: { text: tiptapContentToInline(node.content ?? []) },
      };
    }

    case "bulletList": {
      const inner = node.content?.[0]?.content?.[0];
      return {
        type: "bullet",
        content: { text: tiptapContentToInline(inner?.content ?? []) },
      };
    }

    case "orderedList": {
      const inner = node.content?.[0]?.content?.[0];
      return {
        type: "numbered",
        content: { text: tiptapContentToInline(inner?.content ?? []) },
      };
    }

    case "taskList": {
      // `checked` lives on the taskItem itself, not the taskList container
      // (the container has no such attr at all — reading it there always
      // silently resolves to false, regardless of the item's real state).
      const taskItem = node.content?.[0];
      const inner = taskItem?.content?.[0];
      return {
        type: "todo",
        content: {
          checked: (taskItem?.attrs?.checked as boolean) ?? false,
          text: tiptapContentToInline(inner?.content ?? []),
        },
      };
    }

    case "blockquote": {
      const inner = node.content?.[0];
      return {
        type: "quote",
        content: { text: tiptapContentToInline(inner?.content ?? []) },
      };
    }

    case "callout": {
      const inner = node.content?.[0];
      return {
        type: "callout",
        content: {
          icon: (node.attrs?.icon as string) ?? "💡",
          color: (node.attrs?.color as string) ?? "",
          text: tiptapContentToInline(inner?.content ?? []),
        },
      };
    }

    case "toggle": {
      const summary = node.content?.[0];
      return {
        type: "toggle",
        content: {
          text: tiptapContentToInline(summary?.content ?? []),
          open: (node.attrs?.open as boolean) ?? false,
        },
      };
    }

    case "horizontalRule":
      return { type: "divider", content: {} };

    case "codeBlock":
      return {
        type: "code",
        content: {
          language: (node.attrs?.language as string) ?? "",
          code: node.content?.[0]?.text ?? "",
          lineNumbers: true,
        },
      };

    case "mathBlock":
      return {
        type: "equation",
        content: { expression: (node.attrs?.expression as string) ?? "" },
      };

    case "imageBlock":
      return {
        type: "image",
        content: {
          url: (node.attrs?.src as string) ?? "",
          caption: (node.attrs?.caption as string) ?? "",
          width: (node.attrs?.width as number) ?? 720,
          objectKey: (node.attrs?.objectKey as string) ?? "",
        },
      };

    case "videoBlock":
      return {
        type: "video",
        content: {
          url: (node.attrs?.src as string) ?? "",
          caption: (node.attrs?.caption as string) ?? "",
        },
      };

    case "audioBlock":
      return {
        type: "audio",
        content: {
          url: (node.attrs?.src as string) ?? "",
          caption: (node.attrs?.caption as string) ?? "",
        },
      };

    case "fileBlock":
      return {
        type: "file",
        content: {
          url: (node.attrs?.src as string) ?? "",
          caption: (node.attrs?.caption as string) ?? "",
          objectKey: (node.attrs?.objectKey as string) ?? "",
        },
      };

    case "pdfBlock":
      return {
        type: "pdf",
        content: {
          url: (node.attrs?.src as string) ?? "",
          caption: (node.attrs?.caption as string) ?? "",
          objectKey: (node.attrs?.objectKey as string) ?? "",
        },
      };

    case "embedBlock":
      return {
        type: "embed",
        content: {
          url: (node.attrs?.url as string) ?? "",
          fileName: (node.attrs?.fileName as string) ?? "",
          mimeType: (node.attrs?.mimeType as string) ?? "",
        },
      };

    case "bookmarkBlock":
      return {
        type: "bookmark",
        content: {
          url: (node.attrs?.url as string) ?? "",
          title: (node.attrs?.title as string) ?? "",
          description: (node.attrs?.description as string) ?? "",
          image: (node.attrs?.image as string) ?? "",
          favicon: (node.attrs?.favicon as string) ?? "",
          siteName: (node.attrs?.siteName as string) ?? "",
        },
      };

    case "tableOfContents":
      return { type: "toc", content: {} };

    case "columns":
      return {
        type: "columns",
        content: { columnCount: (node.attrs?.columnCount as number) ?? 2 },
      };

    case "linkedPage":
      return {
        type: "linked_page",
        content: { pageId: (node.attrs?.pageId as string) ?? "" },
      };

    case "subPageBlock":
      return {
        type: "sub_page",
        content: { pageId: (node.attrs?.pageId as string) ?? "" },
      };

    case "breadcrumbBlock":
      return { type: "breadcrumb", content: {} };

    case "syncedBlock":
      return {
        type: "synced_block",
        content: { sourceBlockId: (node.attrs?.sourceBlockId as string) ?? "" },
      };

    case "inlineDatabase":
      return {
        type: "database",
        content: {
          databaseId: (node.attrs?.databaseId as string) ?? "",
          defaultViewId: (node.attrs?.defaultViewId as string) ?? "",
        },
      };

    case "templateButton":
      return {
        type: "template_button",
        content: {
          label: (node.attrs?.label as string) ?? "Template",
          insertLocation:
            (node.attrs?.insertLocation as "below_button" | "bottom_of_page") ??
            "below_button",
          templateBlocks: (node.attrs?.templateBlocks as {
            type: string;
            text: string;
          }[]) ?? [{ type: "paragraph", text: "" }],
        },
      };

    // Without this, a table fell through to the `default` below and was
    // persisted as an empty paragraph — the whole grid was silently destroyed
    // on the first autosave after it was inserted.
    case "table":
      return {
        type: "table",
        content: { tableRows: tiptapTableToRows(node) },
      };

    default:
      return { type: "paragraph", content: { text: [] } };
  }
}

// Build a flat list of DB blocks from TipTap document JSON (top-level only; nested handled recursively)
//
// Every node's `blockId` is trusted directly (already stamped client-side by editor.tsx's
// assignMissingBlockIds before this runs) rather than matched to a server-confirmed list by array position.
export function tiptapDocToBlocks(
  doc: { content?: TipTapNode[] },
  pageId: string
): Array<{
  id: string | null;
  pageId: string;
  parentBlockId: string | null;
  type: string;
  content: BlockContent;
  orderIndex: number;
  schemaVersion: number;
}> {
  const result: Array<{
    id: string | null;
    pageId: string;
    parentBlockId: string | null;
    type: string;
    content: BlockContent;
    orderIndex: number;
    schemaVersion: number;
  }> = [];

  function walk(
    nodes: TipTapNode[],
    parentBlockId: string | null,
    startIndex: number
  ) {
    nodes.forEach((node, i) => {
      const blockId = (node.attrs?.blockId as string) ?? null;
      const { type, content } = tiptapNodeToBlockContent(node);

      result.push({
        id: blockId,
        pageId,
        parentBlockId,
        type,
        content,
        orderIndex: startIndex + i,
        schemaVersion: 1,
      });

      // Walk children for toggle and columns
      if (node.type === "toggle" && node.content && node.content.length > 1) {
        walk(node.content.slice(1), blockId, 0);
      }
      if (node.type === "columns" && node.content) {
        walk(node.content, blockId, 0);
      }
      // Synced-block children are only persisted for the source instance
      // (no sourceBlockId) — reference instances render read-only content
      // fetched from the source at render time, not stored as their own rows.
      if (
        node.type === "syncedBlock" &&
        !node.attrs?.sourceBlockId &&
        node.content
      ) {
        walk(node.content, blockId, 0);
      }
    });
  }

  walk(doc.content ?? [], null, 0);
  return result;
}

// Convert flat DB blocks to TipTap document JSON
// Resolve the TipTap node array for one level of a block tree, rooted at `rootParentBlockId`
// (null = top-level). Shared by blocksToTiptapDoc and the synced-block reference resolver, rooted at a source block instead.
export function blocksToTiptapNodes(
  blocks: DbBlock[],
  rootParentBlockId: string | null
): TipTapNode[] {
  const roots = blocks
    .filter((b) => b.parentBlockId === rootParentBlockId)
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const childMap = new Map<string, DbBlock[]>();
  for (const b of blocks) {
    if (b.parentBlockId) {
      const arr = childMap.get(b.parentBlockId) ?? [];
      arr.push(b);
      childMap.set(b.parentBlockId, arr);
    }
  }

  function buildNode(block: DbBlock): TipTapNode {
    const children = (childMap.get(block.id) ?? []).sort(
      (a, b) => a.orderIndex - b.orderIndex
    );
    return blockToTipTapNode({ ...block, children });
  }

  return roots.map(buildNode);
}

export function blocksToTiptapDoc(blocks: DbBlock[]): {
  type: "doc";
  content: TipTapNode[];
} {
  return { type: "doc", content: blocksToTiptapNodes(blocks, null) };
}
