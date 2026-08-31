"use client";

import { ArrowDown, ArrowUp, X } from "lucide-react";
import { createPortal } from "react-dom";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import type { DbProperty, SortRule } from "./types";

const SORTABLE = new Set([
  "text",
  "number",
  "select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
]);
const MAX_SORTS = 5;

interface SortBarProps {
  onChange: (sorts: SortRule[]) => void;
  properties: DbProperty[];
  sorts: SortRule[];
}

export function SortBar({ properties, sorts, onChange }: SortBarProps) {
  const usable = properties.filter((p) => !p.isSystem && SORTABLE.has(p.type));
  const atLimit = sorts.length >= MAX_SORTS || sorts.length >= usable.length;
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // Properties already used by OTHER rules — excluded from a row's own
  // dropdown (except its current selection) so the same property can't be
  // picked twice, and from `add`'s default pick.
  function usedElsewhere(excludeIdx?: number) {
    return new Set(
      sorts.filter((_, i) => i !== excludeIdx).map((s) => s.propertyId)
    );
  }

  function add() {
    if (atLimit) {
      return;
    }
    const used = usedElsewhere();
    const first = usable.find((p) => !used.has(p.id));
    if (!first) {
      return;
    }
    onChange([...sorts, { propertyId: first.id, direction: "asc" }]);
  }

  function update(idx: number, patch: Partial<SortRule>) {
    onChange(sorts.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function remove(idx: number) {
    onChange(sorts.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-base-300 px-4 py-2.5 sm:px-8 lg:px-16 bg-base-200">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-base-content/70">
          Sort
        </p>
        {atLimit && (
          <span className="text-xs text-base-content/70">
            {sorts.length >= MAX_SORTS
              ? `Max ${MAX_SORTS} sort rules`
              : "All properties sorted"}
          </span>
        )}
      </div>

      {sorts.map((sort, idx) => {
        const used = usedElsewhere(idx);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: KNOWN DEBT, needs a data-model decision. `SortRule` (components/database/types.ts) has no id, and propertyId is not unique — two rules may target the same property. Rows are reorderable and deletable, so the index is genuinely the wrong key here, but the only fix is adding an id to a shape persisted as JSON on the view record, which needs a read-path migration for existing views. Not a change to make for lint.
          <div className="flex items-center gap-2 text-xs" key={idx}>
            <span className="w-14 shrink-0 text-right text-base-content/70">
              {idx === 0 ? "Sort by" : "Then by"}
            </span>

            <Select
              onValueChange={(v) => update(idx, { propertyId: v })}
              value={sort.propertyId}
            >
              <SelectTrigger className="min-w-32" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {usable
                  .filter((p) => !used.has(p.id))
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>

            <div className="flex items-center rounded-sm border border-base-300 bg-base-200/40 p-0.5">
              {(["asc", "desc"] as const).map((dir) => (
                <button
                  className={`flex items-center gap-1 transition-colors ${
                    sort.direction === dir
                      ? "bg-primary text-primary-content rounded-sm px-2.5 py-1 text-xs font-semibold"
                      : "text-base-content/70 px-2.5 py-1 text-xs font-medium hover:text-base-content"
                  }`}
                  key={dir}
                  onClick={() => update(idx, { direction: dir })}
                  type="button"
                >
                  {dir === "asc" ? (
                    <ArrowUp size={11} />
                  ) : (
                    <ArrowDown size={11} />
                  )}
                  {dir === "asc" ? "Asc" : "Desc"}
                </button>
              ))}
            </div>

            <button
              className="ml-auto flex size-5 items-center justify-center rounded-xs text-base-content/70 transition-colors duration-150 hover:bg-error/10 hover:text-error"
              onClick={() => remove(idx)}
              type="button"
            >
              <X size={11} />
            </button>
          </div>
        );
      })}

      <button
        className="flex items-center gap-1.5 rounded-sm border border-base-300 bg-base-100 px-3 py-1.5 text-xs font-medium text-base-content/70 transition-colors duration-150 hover:border-base-300 hover:bg-base-200 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-40"
        disabled={atLimit || usable.length === 0}
        onClick={add}
        onMouseEnter={(e) => {
          if (sorts.length >= MAX_SORTS) {
            showTooltip(`Maximum ${MAX_SORTS} sort rules`, e);
          } else if (atLimit) {
            showTooltip("All sortable properties are already used", e);
          }
        }}
        onMouseLeave={hideTooltip}
        type="button"
      >
        + Add sort
      </button>
      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}
