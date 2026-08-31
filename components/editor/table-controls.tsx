"use client";

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Selection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TableInfo {
  rect: { top: number; left: number; width: number; height: number };
  tableNode: PMNode;
  tablePos: number;
}

// Which row/column the cursor is currently over, if any — drives showing a
// single contextual handle for that one row/column instead of a grid of
// always-visible buttons on every row and column at once.
interface HoverTarget {
  colIndex: number | null;
  rowIndex: number | null;
}

const CONTROL_SIZE = 18;
const MENU_WIDTH = 200;

// Resolves the nearest ancestor <table> under the cursor (if any) to its
// ProseMirror position — tables can sit nested inside other blocks (e.g.
// callouts, columns), so this walks up from the DOM hit rather than assuming
// tables are always top-level doc children.
function resolveTable(e: MouseEvent, editor: Editor): TableInfo | null {
  const editorEl = editor.view.dom as HTMLElement;
  try {
    const el = document.elementFromPoint(
      e.clientX,
      e.clientY
    ) as HTMLElement | null;
    const tableEl = el?.closest("table");
    if (!tableEl || !editorEl.contains(tableEl)) {
      return null;
    }

    const pos = editor.view.posAtDOM(tableEl, 0);
    const $pos = editor.state.doc.resolve(pos);
    for (let d = $pos.depth; d >= 0; d--) {
      if ($pos.node(d).type.name === "table") {
        const r = tableEl.getBoundingClientRect();
        return {
          tablePos: $pos.before(d),
          tableNode: $pos.node(d),
          rect: { top: r.top, left: r.left, width: r.width, height: r.height },
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

// nodeDOM(tablePos) returns the table node's NodeView root, which TipTap's
// table extension wraps in a scroll-container <div> — not the <table> itself
// — so drill into it for the element that actually has .rows.
function getTableElement(
  editor: Editor,
  tablePos: number
): HTMLTableElement | null {
  try {
    const root = editor.view.nodeDOM(tablePos) as HTMLElement | null;
    if (!root) {
      return null;
    }
    return root.tagName === "TABLE"
      ? (root as HTMLTableElement)
      : root.querySelector("table");
  } catch {
    return null;
  }
}

// Re-measures a tracked table's on-screen rect by its document position
// rather than the mouse — used to keep the controls glued to the table while
// scrolling, since scroll doesn't fire mousemove.
function getTableRect(
  editor: Editor,
  tablePos: number
): TableInfo["rect"] | null {
  const el = getTableElement(editor, tablePos);
  if (!el) {
    return null;
  }
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Moves the selection into the given cell (snapping to the nearest valid
// text position inside it) before running a table command — every
// addRow/addColumn/deleteRow/deleteColumn command acts relative to whatever
// cell the selection is currently in.
function selectCell(
  editor: Editor,
  tablePos: number,
  tableNode: PMNode,
  row: number,
  col: number
) {
  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const cellStart = tableStart + map.positionAt(row, col, tableNode);
  const $pos = editor.state.doc.resolve(
    Math.min(cellStart + 1, editor.state.doc.content.size)
  );
  const selection = Selection.near($pos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
}

// Reads a row's cell text so "Duplicate row" can re-enter it into the freshly
// inserted (empty) row — ProseMirror's addRowAfter only ever inserts blanks,
// there's no built-in duplicate.
function readRowText(editor: Editor, tablePos: number, row: number): string[] {
  const el = getTableElement(editor, tablePos);
  const tr = el?.rows[row];
  if (!tr) {
    return [];
  }
  return Array.from(tr.cells).map((c) => c.textContent ?? "");
}

function readColumnText(
  editor: Editor,
  tablePos: number,
  col: number
): string[] {
  const el = getTableElement(editor, tablePos);
  if (!el) {
    return [];
  }
  return Array.from(el.rows).map((r) => r.cells[col]?.textContent ?? "");
}

// Writes text into the cells of an existing row/column, one cell at a time.
// Re-resolves the table node before each write since every insertion shifts
// the positions of everything after it.
function fillCells(
  editor: Editor,
  tablePos: number,
  cells: Array<{ col: number; row: number; text: string }>
) {
  for (const { row, col, text } of cells) {
    if (!text) {
      continue;
    }
    const node = editor.state.doc.nodeAt(tablePos);
    if (!node) {
      return;
    }
    const map = TableMap.get(node);
    if (row >= map.height || col >= map.width) {
      continue;
    }
    const cellStart = tablePos + 1 + map.positionAt(row, col, node);
    const cellNode = editor.state.doc.nodeAt(cellStart);
    if (!cellNode) {
      continue;
    }
    editor
      .chain()
      .insertContentAt(
        { from: cellStart + 1, to: cellStart + cellNode.nodeSize - 1 },
        text
      )
      .run();
  }
}

export function TableControls({ editor }: { editor: Editor }) {
  const [table, setTable] = useState<TableInfo | null>(null);
  const [hover, setHover] = useState<HoverTarget>({
    colIndex: null,
    rowIndex: null,
  });
  // Tracks whether either grip's Menu is open, mirrored into a ref so the mousemove listener
  // below doesn't need to resubscribe on every open/close.
  const [menuOpen, setMenuOpen] = useState(false);
  const tableRef = useRef<TableInfo | null>(null);
  const menuOpenRef = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  );

  useEffect(() => {
    tableRef.current = table;
  }, [table]);
  useEffect(() => {
    menuOpenRef.current = menuOpen;
  }, [menuOpen]);

  // Track which table is hovered, and which row/column within it — the whole
  // point of the contextual-handle design is that only the hovered row and
  // hovered column get a control, so this replaces the old "render a button
  // for every row and every column" approach.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Freeze tracking while a menu is open so the handle it's anchored to
      // can't disappear (or switch rows) out from under the open menu.
      if (menuOpenRef.current) {
        return;
      }

      const info = resolveTable(e, editor);
      if (info) {
        clearTimeout(hideTimer.current);
        setTable(info);

        const el = getTableElement(editor, info.tablePos);
        if (el) {
          const rowIndex = Array.from(el.rows).findIndex((r) => {
            const b = r.getBoundingClientRect();
            return e.clientY >= b.top && e.clientY <= b.bottom;
          });
          const firstRow = el.rows[0];
          const colIndex = firstRow
            ? Array.from(firstRow.cells).findIndex((c) => {
                const b = c.getBoundingClientRect();
                return e.clientX >= b.left && e.clientX <= b.right;
              })
            : -1;
          setHover({
            colIndex: colIndex >= 0 ? colIndex : null,
            rowIndex: rowIndex >= 0 ? rowIndex : null,
          });
        }
        return;
      }

      const prev = tableRef.current;
      if (!prev) {
        return;
      }

      // Keep the controls up while the cursor is over the handles/add-bars
      // themselves rather than the table — otherwise moving toward one of
      // them hides it before it can be clicked.
      const { top, left, width, height } = prev.rect;
      const pad = CONTROL_SIZE + 6;
      const withinGutter =
        e.clientX >= left - pad &&
        e.clientX <= left + width + pad &&
        e.clientY >= top - pad &&
        e.clientY <= top + height + pad;
      if (withinGutter) {
        clearTimeout(hideTimer.current);
        return;
      }

      clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        setTable(null);
        setHover({ colIndex: null, rowIndex: null });
      }, 200);
    };

    document.addEventListener("mousemove", onMove);
    return () => {
      document.removeEventListener("mousemove", onMove);
      clearTimeout(hideTimer.current);
    };
  }, [editor]);

  useEffect(() => {
    const onScroll = () => {
      // Re-measure so the position:fixed handles don't drift on scroll; the Menu itself doesn't
      // need this since its anchor prop repositions it live against the MenuButton.
      setTable((prev) => {
        if (!prev) {
          return prev;
        }
        const rect = getTableRect(editor, prev.tablePos);
        if (!rect) {
          return null;
        }
        return { ...prev, rect };
      });
    };
    document.addEventListener("scroll", onScroll, true);
    return () => document.removeEventListener("scroll", onScroll, true);
  }, [editor]);

  // Every action re-reads `tableRef` rather than closing over `table` so the
  // handlers stay stable across re-renders while the menu is open. Closing
  // the menu itself is handled by Headless UI (any MenuItem click closes it).
  const run = useCallback(
    (fn: (t: TableInfo) => void) => {
      const t = tableRef.current;
      if (!t) {
        return;
      }
      fn(t);
      // The table's geometry changed — re-measure so the handles/add-bars
      // don't sit at stale coordinates until the next mousemove.
      requestAnimationFrame(() => {
        setTable((prev) => {
          if (!prev) {
            return prev;
          }
          const rect = getTableRect(editor, prev.tablePos);
          return rect ? { ...prev, rect } : null;
        });
      });
    },
    [editor]
  );

  if (!table || typeof document === "undefined") {
    return null;
  }

  const map = TableMap.get(table.tableNode);
  const { top, left, width, height } = table.rect;
  const tableEl = getTableElement(editor, table.tablePos);
  const hoveredRowRect =
    hover.rowIndex === null
      ? null
      : (tableEl?.rows[hover.rowIndex]?.getBoundingClientRect() ?? null);
  const hoveredColRect =
    hover.colIndex === null
      ? null
      : (tableEl?.rows[0]?.cells[hover.colIndex]?.getBoundingClientRect() ??
        null);

  const rowItems = [
    {
      Icon: ArrowUp,
      label: "Insert row above",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, hover.rowIndex ?? 0, 0);
          editor.chain().focus().addRowBefore().run();
        }),
    },
    {
      Icon: ArrowDown,
      label: "Insert row below",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, hover.rowIndex ?? 0, 0);
          editor.chain().focus().addRowAfter().run();
        }),
    },
    {
      Icon: Copy,
      label: "Duplicate row",
      onClick: () =>
        run((t) => {
          const rowIdx = hover.rowIndex ?? 0;
          const text = readRowText(editor, t.tablePos, rowIdx);
          selectCell(editor, t.tablePos, t.tableNode, rowIdx, 0);
          editor.chain().focus().addRowAfter().run();
          fillCells(
            editor,
            t.tablePos,
            text.map((s, col) => ({ col, row: rowIdx + 1, text: s }))
          );
        }),
    },
    {
      danger: true,
      Icon: Trash2,
      label: "Delete row",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, hover.rowIndex ?? 0, 0);
          editor.chain().focus().deleteRow().run();
        }),
      disabled: map.height <= 1,
    },
  ];

  const columnItems = [
    {
      Icon: ArrowLeft,
      label: "Insert column left",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, 0, hover.colIndex ?? 0);
          editor.chain().focus().addColumnBefore().run();
        }),
    },
    {
      Icon: ArrowRight,
      label: "Insert column right",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, 0, hover.colIndex ?? 0);
          editor.chain().focus().addColumnAfter().run();
        }),
    },
    {
      Icon: Pencil,
      label: "Rename column",
      // No separate rename UI — the header cell is itself editable text, so
      // "rename" just means putting the caret in it (and selecting what's
      // there) rather than opening a dialog that writes the same content.
      onClick: () =>
        run((t) => {
          const col = hover.colIndex ?? 0;
          const node = editor.state.doc.nodeAt(t.tablePos);
          if (!node) {
            return;
          }
          const m = TableMap.get(node);
          const cellStart = t.tablePos + 1 + m.positionAt(0, col, node);
          const cellNode = editor.state.doc.nodeAt(cellStart);
          if (!cellNode) {
            return;
          }
          editor
            .chain()
            .focus()
            .setTextSelection({
              from: cellStart + 1,
              to: cellStart + cellNode.nodeSize - 1,
            })
            .run();
        }),
    },
    {
      Icon: Copy,
      label: "Duplicate column",
      onClick: () =>
        run((t) => {
          const colIdx = hover.colIndex ?? 0;
          const text = readColumnText(editor, t.tablePos, colIdx);
          selectCell(editor, t.tablePos, t.tableNode, 0, colIdx);
          editor.chain().focus().addColumnAfter().run();
          fillCells(
            editor,
            t.tablePos,
            text.map((s, row) => ({ col: colIdx + 1, row, text: s }))
          );
        }),
    },
    {
      danger: true,
      Icon: Trash2,
      label: "Delete column",
      onClick: () =>
        run((t) => {
          selectCell(editor, t.tablePos, t.tableNode, 0, hover.colIndex ?? 0);
          editor.chain().focus().deleteColumn().run();
        }),
      disabled: map.width <= 1,
    },
  ];

  return createPortal(
    <>
      {/* Row handle — one only, on the row currently under the cursor. The
          grip button doubles as the Headless UI MenuButton; MenuItems uses
          `anchor` instead of the old hand-written viewport-clamp math. */}
      {hoveredRowRect && (
        <Menu>
          {({ open }) => (
            <MenuOpenSync onOpenChange={setMenuOpen} open={open}>
              <MenuButton
                aria-label="Row options"
                className="flex items-center justify-center rounded-sm text-base-content/70 opacity-60 transition-opacity duration-100 hover:bg-base-200 hover:text-base-content hover:opacity-100 data-open:opacity-100 data-open:bg-base-200"
                style={{
                  position: "fixed",
                  top: hoveredRowRect.top,
                  left: left - CONTROL_SIZE - 4,
                  width: CONTROL_SIZE,
                  height: hoveredRowRect.height,
                  zIndex: 40,
                }}
              >
                <GripVertical size={12} />
              </MenuButton>
              <MenuItems
                anchor={{ to: "right start", gap: 4 }}
                className="z-300 overflow-hidden rounded-md border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                style={{ width: MENU_WIDTH }}
                transition
              >
                {renderMenuItems(rowItems)}
              </MenuItems>
            </MenuOpenSync>
          )}
        </Menu>
      )}

      {/* Column handle — one only, on the column currently under the cursor */}
      {hoveredColRect && (
        <Menu>
          {({ open }) => (
            <MenuOpenSync onOpenChange={setMenuOpen} open={open}>
              <MenuButton
                aria-label="Column options"
                className="flex items-center justify-center rounded-sm text-base-content/70 opacity-60 transition-opacity duration-100 hover:bg-base-200 hover:text-base-content hover:opacity-100 data-open:opacity-100 data-open:bg-base-200"
                style={{
                  position: "fixed",
                  top: top - CONTROL_SIZE - 4,
                  left: hoveredColRect.left,
                  width: hoveredColRect.width,
                  height: CONTROL_SIZE,
                  zIndex: 40,
                }}
              >
                <GripVertical
                  size={12}
                  style={{ transform: "rotate(90deg)" }}
                />
              </MenuButton>
              <MenuItems
                anchor={{ to: "bottom start", gap: 4 }}
                className="z-300 overflow-hidden rounded-md border border-base-300 bg-neutral py-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
                style={{ width: MENU_WIDTH }}
                transition
              >
                {renderMenuItems(columnItems)}
              </MenuItems>
            </MenuOpenSync>
          )}
        </Menu>
      )}

      {/* Add row — a single bar along the table's bottom edge */}
      <button
        className="flex items-center justify-center gap-1 rounded-sm text-base-content/70 opacity-40 transition-opacity duration-100 hover:bg-base-200 hover:text-base-content hover:opacity-100"
        onClick={() =>
          run((t) => {
            selectCell(
              editor,
              t.tablePos,
              t.tableNode,
              TableMap.get(t.tableNode).height - 1,
              0
            );
            editor.chain().focus().addRowAfter().run();
          })
        }
        style={{
          position: "fixed",
          top: top + height + 2,
          left,
          width,
          height: CONTROL_SIZE,
          zIndex: 40,
        }}
        type="button"
      >
        <Plus size={12} />
        <span className="text-xs font-medium">Add Row</span>
      </button>

      {/* Add column — a single bar along the table's right edge */}
      <button
        aria-label="Add Column"
        className="flex items-center justify-center rounded-sm text-base-content/70 opacity-40 transition-opacity duration-100 hover:bg-base-200 hover:text-base-content hover:opacity-100"
        onClick={() =>
          run((t) => {
            selectCell(
              editor,
              t.tablePos,
              t.tableNode,
              0,
              TableMap.get(t.tableNode).width - 1
            );
            editor.chain().focus().addColumnAfter().run();
          })
        }
        style={{
          position: "fixed",
          top,
          left: left + width + 2,
          width: CONTROL_SIZE,
          height,
          zIndex: 40,
        }}
        type="button"
      >
        <Plus size={12} />
      </button>
    </>,
    document.body
  );
}

interface MenuItemDef {
  danger?: boolean;
  disabled?: boolean;
  Icon: typeof Plus;
  label: string;
  onClick: () => void;
}

function renderMenuItems(items: MenuItemDef[]) {
  return items.map(({ Icon, label, onClick, danger, disabled }) => (
    <MenuItem disabled={disabled} key={label}>
      <button
        className={[
          "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition-colors",
          disabled
            ? "cursor-not-allowed opacity-40"
            : danger
              ? "text-error data-focus:bg-error/10"
              : "text-base-content data-focus:bg-base-200",
        ].join(" ")}
        disabled={disabled}
        onClick={onClick}
        onMouseDown={(e) => e.preventDefault()}
        type="button"
      >
        <Icon className={danger ? "" : "text-base-content/70"} size={14} />
        {label}
      </button>
    </MenuItem>
  ));
}

// Mirrors a Menu's open state up via callback — Menu has no controlled open prop, only a
// render-prop, and calling hooks inside that render-prop would violate rules-of-hooks.
function MenuOpenSync({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    onOpenChange(open);
    return () => onOpenChange(false);
  }, [open, onOpenChange]);
  return <>{children}</>;
}
