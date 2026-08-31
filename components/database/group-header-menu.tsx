"use client";

import { EyeOff, Settings2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAnchorPosition, useMergedRef } from "@/lib/ui/use-anchor-position";

interface GroupHeaderMenuProps {
  /** False for Checkbox/Person groups — their columns are derived (fixed
   *  true/false, or whoever's actually assigned), not a user-owned option
   *  list, so "Edit groups" (rename/recolor/reorder options) and "Move to
   *  Trash" (delete an option) don't apply — Hide/aggregation still do. */
  editable?: boolean;
  /** Called on open AND on every scroll/resize, so the menu tracks its anchor
   *  instead of freezing at the coordinates from the moment it opened. */
  getAnchorRect: () => DOMRect;
  hideAggregation: boolean;
  onClose: () => void;
  onDeleteGroup: () => void;
  onEditGroups: () => void;
  onHideGroup: () => void;
  onToggleHideAggregation: () => void;
}

export function GroupHeaderMenu({
  getAnchorRect,
  hideAggregation,
  editable = true,
  onEditGroups,
  onToggleHideAggregation,
  onHideGroup,
  onDeleteGroup,
  onClose,
}: GroupHeaderMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect>(getAnchorRect);

  useEffect(() => {
    function h(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  useEffect(() => {
    function reposition() {
      setAnchorRect(getAnchorRect());
    }
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [getAnchorRect]);

  const width = 200;
  const { setFloating, x, y } = useAnchorPosition({
    anchorRect,
    placement: "bottom-start",
    gap: 4,
  });
  const mergedRef = useMergedRef(ref, setFloating);

  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200 p-1.5"
      ref={mergedRef}
      style={{ position: "fixed", top: y, left: x, width, zIndex: 300 }}
    >
      {editable && (
        <button
          className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
          onClick={() => {
            onEditGroups();
            onClose();
          }}
          type="button"
        >
          <Settings2 size={13} /> Edit groups
        </button>
      )}
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
        onClick={() => {
          onToggleHideAggregation();
          onClose();
        }}
        type="button"
      >
        <EyeOff size={13} />{" "}
        {hideAggregation ? "Show aggregation" : "Hide aggregation"}
      </button>
      <button
        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-base-content hover:bg-base-200"
        onClick={() => {
          onHideGroup();
          onClose();
        }}
        type="button"
      >
        <EyeOff size={13} /> Hide group
      </button>
      {editable && (
        <>
          <div className="my-1 h-px bg-base-300" />
          <button
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-sm font-normal text-error transition-colors duration-150 hover:bg-error/5"
            onClick={() => {
              onDeleteGroup();
              onClose();
            }}
            type="button"
          >
            <Trash2 size={13} /> Move to Trash
          </button>
        </>
      )}
    </div>,
    document.body
  );
}
