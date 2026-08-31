"use client";

import { exitSuggestion } from "@tiptap/suggestion";
import { FileText, Plus } from "lucide-react";
import type { Ref } from "react";
import { useEffect, useImperativeHandle, useRef, useState } from "react";
import type {
  MentionItem,
  MentionSuggestionProps,
} from "@/components/editor/extensions/mention-extension";
import {
  MENTION_PLUGIN_KEY,
  PAGE_LINK_PLUGIN_KEY,
} from "@/components/editor/extensions/mention-extension";
import { PageIcon } from "@/components/pages/page-icon";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

interface Props {
  ref?: Ref<MentionListHandle>;
  suggestionProps: MentionSuggestionProps;
}

export function MentionList({ suggestionProps, ref }: Props) {
  const { items, command, clientRect, editor } = suggestionProps;
  const typedItems = items as MentionItem[];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedRef = useRef(selectedIndex);
  selectedRef.current = selectedIndex;
  const containerRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: items is a reset trigger, not a value read here — without it the highlighted row keeps its old index when the suggestion list changes under it.
  useEffect(() => setSelectedIndex(0), [items]);

  // Flips above the caret when the list doesn't fit below, caps height to scroll instead of
  // overflow, and clamps left to the viewport. `liveReposition` catches window resize (the
  // caret itself doesn't move, but available space does) — a fresh `clientRect()` is read
  // every render regardless, since `suggestionProps` changes on every keystroke.
  const rect = clientRect?.();
  const {
    setFloating,
    x: left,
    y: top,
  } = useAnchorPosition({
    anchorRect: rect ?? { top: 0, left: 0, right: 0, bottom: 0 },
    placement: "bottom-start",
    gap: 4,
    constrainSize: true,
    liveReposition: true,
  });
  const mergedRef = useMergedRef(containerRef, setFloating);

  // Popup is `position: fixed` so it'd detach from the caret on scroll — close on any scroll
  // outside the popup itself (capture-phase to catch any ancestor container).
  useEffect(() => {
    function onScroll(e: Event) {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      exitSuggestion(editor.view, MENTION_PLUGIN_KEY);
      exitSuggestion(editor.view, PAGE_LINK_PLUGIN_KEY);
    }
    window.addEventListener("scroll", onScroll, true);
    return () => window.removeEventListener("scroll", onScroll, true);
  }, [editor]);

  // Suggestion plugin only re-evaluates "active" on transactions inside the editor, so an outside
  // click never closes this fixed-position popup on its own — dispatch its exit transaction directly.
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current?.contains(e.target as Node)) {
        return;
      }
      exitSuggestion(editor.view, MENTION_PLUGIN_KEY);
      exitSuggestion(editor.view, PAGE_LINK_PLUGIN_KEY);
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [editor]);

  useImperativeHandle(ref, () => ({
    onKeyDown(event: KeyboardEvent): boolean {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => Math.max(0, i - 1));
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => Math.min(typedItems.length - 1, i + 1));
        return true;
      }
      if (event.key === "Enter") {
        const item = typedItems[selectedRef.current];
        if (item) {
          selectItem(item);
        }
        return true;
      }
      return false;
    },
  }));

  function selectItem(item: MentionItem) {
    command(item);
  }

  if (!typedItems.length || !rect) {
    return null;
  }

  const people = typedItems.filter((i) => i.mentionType === "user");
  const pageItems = typedItems.filter((i) => i.mentionType === "page");
  const dates = typedItems.filter((i) => i.mentionType === "date");
  const createItems = typedItems.filter((i) => i.mentionType === "create_page");

  return (
    <div
      className="w-60 rounded-md border border-base-300 bg-neutral py-1"
      ref={mergedRef}
      style={{
        position: "fixed",
        top,
        left,
        overflowY: "auto",
        overflowX: "hidden",
        zIndex: 400,
      }}
    >
      {people.length > 0 && (
        <Section label="People">
          {people.map((item) => {
            const idx = typedItems.indexOf(item);
            return (
              <MentionRow
                isSelected={selectedIndex === idx}
                item={item}
                key={item.id}
                onClick={() => selectItem(item)}
              />
            );
          })}
        </Section>
      )}
      {pageItems.length > 0 && (
        <Section label="Pages">
          {pageItems.map((item) => {
            const idx = typedItems.indexOf(item);
            return (
              <MentionRow
                isSelected={selectedIndex === idx}
                item={item}
                key={item.id}
                onClick={() => selectItem(item)}
              />
            );
          })}
        </Section>
      )}
      {dates.length > 0 && (
        <Section label="Dates">
          {dates.map((item) => {
            const idx = typedItems.indexOf(item);
            return (
              <MentionRow
                isSelected={selectedIndex === idx}
                item={item}
                key={item.id}
                onClick={() => selectItem(item)}
              />
            );
          })}
        </Section>
      )}
      {createItems.map((item) => {
        const idx = typedItems.indexOf(item);
        return (
          <MentionRow
            isSelected={selectedIndex === idx}
            item={item}
            key="create_page"
            onClick={() => selectItem(item)}
          />
        );
      })}
    </div>
  );
}

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="px-3 py-1 text-xs font-semibold tracking-wide text-base-content/70">
        {label}
      </div>
      {children}
    </div>
  );
}

function MentionRow({
  item,
  isSelected,
  onClick,
}: {
  item: MentionItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors ${
        isSelected ? "bg-base-200" : "hover:bg-base-200"
      }`}
      onClick={onClick}
      type="button"
    >
      {item.mentionType === "user" && (
        <>
          <UserAvatar
            image={"image" in item ? (item.image ?? undefined) : undefined}
            name={item.label}
          />
          <span className="text-base-content">{item.label}</span>
        </>
      )}
      {item.mentionType === "page" && (
        <>
          {/* Via PageIcon, not the raw string — a page icon isn't always an emoji.
         Lucide-icon and uploaded-image icons are stored as JSON
         (`{"type":"icon","name":"TrendingUp"}`), which rendered as literal
         JSON text here before. */}
          <span className="flex w-5 shrink-0 items-center justify-center">
            {"icon" in item && item.icon ? (
              <PageIcon icon={item.icon} size={16} />
            ) : (
              <FileText className="text-base-content/70" size={14} />
            )}
          </span>
          <span className="text-base-content truncate">{item.label}</span>
        </>
      )}
      {item.mentionType === "date" && (
        <>
          <span className="w-5 text-center text-base-content/70">📅</span>
          <span className="text-base-content">{item.label}</span>
        </>
      )}
      {item.mentionType === "create_page" && (
        <>
          <Plus className="w-5 shrink-0 text-base-content/70" size={14} />
          <span className="truncate text-base-content">
            Create page{" "}
            <span className="font-medium">&ldquo;{item.query}&rdquo;</span>
          </span>
        </>
      )}
    </button>
  );
}

function UserAvatar({ name, image }: { name: string; image?: string }) {
  if (image) {
    return (
      // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
      <img
        alt={name}
        className="h-5 w-5 rounded-full object-cover shrink-0"
        src={image}
      />
    );
  }
  return (
    <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center text-xs font-semibold text-primary-content shrink-0 select-none">
      {name[0]?.toUpperCase()}
    </div>
  );
}
