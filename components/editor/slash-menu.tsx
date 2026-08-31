"use client";

import { exitSuggestion } from "@tiptap/suggestion";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  BLOCK_CATEGORIES,
  type BlockDefinition,
  getBlocksByCategory,
} from "./block-registry";
import {
  SLASH_COMMANDS_PLUGIN_KEY,
  type SlashSuggestionProps,
} from "./extensions/slash-commands";

// ── Public handle so the TipTap extension can forward keyboard events ────────
export interface SlashMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  ref?: Ref<SlashMenuHandle>;
  suggestionProps: SlashSuggestionProps;
}

export function SlashMenu({ suggestionProps, ref }: Props) {
  const { items, command, query, clientRect, editor } = suggestionProps;

  const [selectedIdx, setSelectedIdx] = useState(0);
  const selectedIdxRef = useRef(selectedIdx);
  selectedIdxRef.current = selectedIdx;
  const containerRef = useRef<HTMLDivElement>(null);

  // Reset selection when item list changes
  // biome-ignore lint/correctness/useExhaustiveDependencies: items is a reset trigger, not a value read here — without it the highlighted row keeps its old index when the command list changes under it.
  useEffect(() => {
    setSelectedIdx(0);
  }, [items]);

  // Same reasoning as MentionList: this popup is `position: fixed`, outside
  // the editor's own DOM, so ProseMirror's Suggestion plugin never sees a
  // click elsewhere on the page as a reason to re-evaluate and exit. Dispatch
  // the plugin's own exit transaction directly instead of waiting for that.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      exitSuggestion(editor.view, SLASH_COMMANDS_PLUGIN_KEY);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [editor]);

  // Scrolling doesn't re-render, so the popup would stay glued to its old
  // position; close it on any ancestor scroll instead (capture-phase).
  useEffect(() => {
    function handleScroll(e: Event) {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      exitSuggestion(editor.view, SLASH_COMMANDS_PLUGIN_KEY);
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [editor]);

  // Position the popup under the "/" character
  const pos = clientRect?.() ?? null;

  // Expose keyboard handler to the TipTap extension
  useImperativeHandle(
    ref,
    () => ({
      onKeyDown(event: KeyboardEvent) {
        if (event.key === "ArrowDown") {
          setSelectedIdx((i) => Math.min(i + 1, items.length - 1));
          return true;
        }
        if (event.key === "ArrowUp") {
          setSelectedIdx((i) => Math.max(i - 1, 0));
          return true;
        }
        if (event.key === "Enter") {
          const def = items[selectedIdxRef.current];
          if (def) {
            command(def);
          }
          return true;
        }
        return false;
      },
    }),
    [items, command]
  );

  if (!items.length || !pos) {
    return null;
  }

  const grouped = query
    ? null
    : BLOCK_CATEGORIES.map((cat) => ({
        ...cat,
        blocks: getBlocksByCategory(cat.key).filter((d) => items.includes(d)),
      })).filter((c) => c.blocks.length);

  // Flip above the cursor if there's not enough space below
  const MENU_HEIGHT = 304;
  const spaceBelow =
    typeof window === "undefined" ? 999 : window.innerHeight - pos.bottom;
  const menuTop =
    spaceBelow < MENU_HEIGHT + 16
      ? Math.max(8, pos.top - MENU_HEIGHT - 8)
      : pos.bottom + 8;

  // Keep menu from overflowing right edge
  const menuLeft =
    typeof window === "undefined"
      ? pos.left
      : Math.min(pos.left, window.innerWidth - 296);

  return (
    <div
      className="fixed z-300 w-72 overflow-hidden rounded-md border border-base-300 bg-neutral"
      ref={containerRef}
      style={{ left: menuLeft, top: menuTop }}
    >
      {query && (
        <div className="border-b border-base-300 px-3 py-2 text-xs text-base-content/70">
          Searching:{" "}
          <span className="font-medium text-base-content">/{query}</span>
        </div>
      )}

      <div className="max-h-72 overflow-y-auto py-1">
        {grouped
          ? grouped.map((cat) => (
              <div key={cat.key}>
                <p className="px-3 pb-0.5 pt-2 text-xs font-semibold tracking-wide text-base-content/70">
                  {cat.label}
                </p>
                {cat.blocks.map((def) => (
                  <MenuItem
                    def={def}
                    key={def.type}
                    onClick={() => command(def)}
                    selected={items.indexOf(def) === selectedIdx}
                  />
                ))}
              </div>
            ))
          : items.map((def, i) => (
              <MenuItem
                def={def}
                key={def.type}
                onClick={() => command(def)}
                selected={i === selectedIdx}
              />
            ))}
      </div>
    </div>
  );
}

function MenuItem({
  def,
  selected,
  onClick,
}: {
  def: BlockDefinition;
  selected: boolean;
  onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView({ block: "nearest" });
    }
  }, [selected]);

  return (
    <button
      className={[
        "flex w-full items-center gap-3 px-3 py-1.5 text-left transition-colors",
        selected ? "bg-base-200" : "hover:bg-base-200",
      ].join(" ")}
      onClick={onClick}
      onMouseDown={(e) => e.preventDefault()}
      ref={ref}
      type="button"
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-sm border border-base-300 bg-base-200 text-xs font-medium">
        {def.icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium text-base-content">{def.label}</p>
        <p className="truncate text-xs text-base-content/70">
          {def.description}
        </p>
      </div>
    </button>
  );
}
