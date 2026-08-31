"use client";

import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
} from "@headlessui/react";
import { Check, ChevronDown, X } from "lucide-react";
import { createPortal } from "react-dom";
import { DatePicker } from "@/components/ui/date-picker";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import type { DbProperty, FilterRule, SelectOption } from "./types";

const OPERATORS: Record<string, { value: string; label: string }[]> = {
  text: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is", label: "is exactly" },
    { value: "is_not", label: "is not" },
    { value: "starts_with", label: "starts with" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  number: [
    { value: "=", label: "=" },
    { value: "!=", label: "≠" },
    { value: "<", label: "<" },
    { value: ">", label: ">" },
    { value: "<=", label: "≤" },
    { value: ">=", label: "≥" },
    { value: "is_empty", label: "is empty" },
  ],
  select: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_none_of", label: "is none of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  status: [
    { value: "is", label: "is" },
    { value: "is_not", label: "is not" },
    { value: "is_any_of", label: "is any of" },
    { value: "is_none_of", label: "is none of" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  multi_select: [
    { value: "contains", label: "contains" },
    { value: "not_contains", label: "doesn't contain" },
    { value: "is_empty", label: "is empty" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "is_before", label: "is before" },
    { value: "is_after", label: "is after" },
    { value: "is_empty", label: "is empty" },
  ],
  checkbox: [
    { value: "is_checked", label: "is checked" },
    { value: "is_not_checked", label: "is not checked" },
  ],
  url: [
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  email: [
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
  ],
  phone: [
    { value: "contains", label: "contains" },
    { value: "is_empty", label: "is empty" },
  ],
  person: [
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  relation: [
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
  files: [
    { value: "is_empty", label: "is empty" },
    { value: "is_not_empty", label: "is not empty" },
  ],
};

const NO_VALUE_OPS = new Set([
  "is_empty",
  "is_not_empty",
  "is_checked",
  "is_not_checked",
]);
const MULTI_VAL_OPS = new Set(["is_any_of", "is_none_of"]);

// ── Multi-option picker for is_any_of / is_none_of ───────────────────────────

export function MultiOptionPicker({
  options,
  value,
  onChange,
}: {
  options: { id: string; name: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <Listbox multiple onChange={onChange} value={value}>
      <div className="relative">
        <ListboxButtonTrigger count={value.length} />
        <ListboxOptions
          anchor={{ to: "bottom start", gap: 4 }}
          className="z-600 w-44 overflow-y-auto rounded-md border border-base-300 bg-base-200 p-1 transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
          modal={false}
          transition
        >
          {options.length === 0 ? (
            <p className="px-2 py-2.5 text-xs text-base-content/70">
              No options defined
            </p>
          ) : (
            options.map((o) => (
              <ListboxOption
                className="flex w-full cursor-default items-center gap-2.5 rounded-sm px-2 py-2 text-left text-xs text-base-content outline-none data-focus:bg-base-200"
                key={o.id}
                value={o.id}
              >
                {({ selected }) => (
                  <>
                    <div
                      className={`flex size-4 shrink-0 items-center justify-center rounded-xs border transition-colors duration-150 ${selected ? "border-primary bg-primary" : "border-base-300"}`}
                    >
                      {selected && (
                        <Check
                          className="text-primary-content"
                          size={9}
                          strokeWidth={2.5}
                        />
                      )}
                    </div>
                    <span className="truncate">{o.name}</span>
                  </>
                )}
              </ListboxOption>
            ))
          )}
        </ListboxOptions>
      </div>
    </Listbox>
  );
}

function ListboxButtonTrigger({ count }: { count: number }) {
  return (
    <ListboxButton className="flex h-7 min-w-20 items-center justify-between gap-1.5 rounded-sm border border-base-300 bg-base-200 px-2.5 text-xs text-base-content focus:outline-none">
      <span className="truncate text-left">
        {count === 0 ? (
          <span className="text-base-content/70">Choose…</span>
        ) : (
          `${count} option${count === 1 ? "" : "s"}`
        )}
      </span>
      <ChevronDown className="shrink-0 text-base-content/70" size={10} />
    </ListboxButton>
  );
}

interface FilterBarProps {
  filterLogic: "and" | "or";
  filters: FilterRule[];
  onChange: (filters: FilterRule[]) => void;
  onFilterLogicChange: (logic: "and" | "or") => void;
  properties: DbProperty[];
}

export function FilterBar({
  properties,
  filters,
  filterLogic,
  onChange,
  onFilterLogicChange,
}: FilterBarProps) {
  const usable = properties.filter((p) => !p.isSystem);
  const atLimit = filters.length >= usable.length;
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // Properties already used by OTHER rules — excluded from a row's own
  // dropdown (except its current selection) so the same property can't be
  // picked twice, and from `add`'s default pick.
  function usedElsewhere(excludeIdx?: number) {
    return new Set(
      filters.filter((_, i) => i !== excludeIdx).map((f) => f.propertyId)
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
    const ops = OPERATORS[first.type] ?? OPERATORS.text;
    onChange([
      ...filters,
      { propertyId: first.id, operator: ops[0].value, value: "" },
    ]);
  }

  function update(idx: number, patch: Partial<FilterRule>) {
    onChange(filters.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }

  function remove(idx: number) {
    onChange(filters.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex shrink-0 flex-col gap-1.5 border-b border-base-300 px-4 py-2.5 sm:px-8 lg:px-16 bg-base-200">
      {/* Header with logic toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold tracking-wide text-base-content/70">
          Filters
        </p>
        {filters.length > 1 && (
          <div className="flex items-center gap-1">
            <span className="text-xs text-base-content/70">Match</span>
            <div className="flex items-center rounded-sm border border-base-300 bg-base-200/40 p-0.5 gap-0">
              {(["and", "or"] as const).map((logic) => (
                <button
                  className={[
                    filterLogic === logic
                      ? "bg-primary text-primary-content rounded-sm px-2.5 py-1 text-xs font-semibold"
                      : "text-base-content/70 px-2.5 py-1 text-xs font-medium hover:text-base-content",
                  ].join(" ")}
                  key={logic}
                  onClick={() => onFilterLogicChange(logic)}
                  type="button"
                >
                  {logic}
                </button>
              ))}
            </div>
            <span className="text-xs text-base-content/70">rules</span>
          </div>
        )}
      </div>

      {filters.map((filter, idx) => {
        const prop = usable.find((p) => p.id === filter.propertyId);
        const ops = OPERATORS[prop?.type ?? "text"] ?? OPERATORS.text;
        const needsValue = !NO_VALUE_OPS.has(filter.operator);
        const used = usedElsewhere(idx);

        const isMultiVal =
          MULTI_VAL_OPS.has(filter.operator) &&
          (prop?.type === "select" || prop?.type === "status");

        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: KNOWN DEBT, needs a data-model decision. `FilterRule` (components/database/types.ts) has no id, and propertyId legitimately repeats — two filters on one date property form a range. Rows are reorderable and deletable, so the index is genuinely the wrong key here, but the only fix is adding an id to a shape persisted as JSON on the view record, which needs a read-path migration for existing views. Not a change to make for lint.
          <div className="flex items-center gap-2 text-xs" key={idx}>
            <span className="w-14 shrink-0 text-right">
              {idx === 0 ? (
                <span className="text-base-content/70">Where</span>
              ) : (
                <span
                  className={[
                    "inline-flex items-center justify-center rounded-xs px-1.5 py-0.5 text-xs font-bold tracking-wide",
                    filterLogic === "or"
                      ? "bg-warning/10 text-warning"
                      : "bg-primary/10 text-primary",
                  ].join(" ")}
                >
                  {filterLogic}
                </span>
              )}
            </span>

            <Select
              onValueChange={(v) => {
                const np = usable.find((p) => p.id === v);
                const nops = OPERATORS[np?.type ?? "text"] ?? OPERATORS.text;
                update(idx, {
                  propertyId: v,
                  operator: nops[0].value,
                  value: "",
                });
              }}
              value={filter.propertyId}
            >
              <SelectTrigger className="min-w-28" size="sm">
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

            <Select
              onValueChange={(v) =>
                update(idx, {
                  operator: v,
                  value: MULTI_VAL_OPS.has(v) ? [] : "",
                })
              }
              value={filter.operator}
            >
              <SelectTrigger className="min-w-28" size="sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ops.map((op) => (
                  <SelectItem key={op.value} value={op.value}>
                    {op.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {needsValue && isMultiVal && (
              <MultiOptionPicker
                onChange={(ids) => update(idx, { value: ids })}
                options={(prop?.config?.options as SelectOption[]) ?? []}
                value={(filter.value as string[]) ?? []}
              />
            )}

            {needsValue && !isMultiVal && prop?.type === "date" && (
              <DatePicker
                className="h-6.5 w-32 gap-1.5 rounded-sm px-2 py-1 text-xs"
                onChange={(v) => update(idx, { value: v ?? "" })}
                placeholder="Value…"
                value={(filter.value as string) || null}
              />
            )}

            {needsValue && !isMultiVal && prop?.type !== "date" && (
              <input
                className="w-32 rounded-sm border border-base-300 bg-base-100 px-2 py-1 text-xs text-base-content focus:border-primary/50 focus:outline-none"
                onChange={(e) => update(idx, { value: e.target.value })}
                placeholder="Value…"
                type={prop?.type === "number" ? "number" : "text"}
                value={String(filter.value ?? "")}
              />
            )}

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
        disabled={atLimit}
        onClick={add}
        onMouseEnter={(e) => {
          if (atLimit) {
            showTooltip("All properties already have a filter", e);
          }
        }}
        onMouseLeave={hideTooltip}
        type="button"
      >
        + Add filter
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
