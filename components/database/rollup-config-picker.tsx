"use client";

import {
  Listbox,
  ListboxOption,
  ListboxOptions,
  Popover,
  PopoverPanel,
} from "@headlessui/react";
import { ArrowLeft, ArrowLeftRight, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PROPERTY_TYPE_ICON } from "@/components/database/property-registry";
import { RectAnchorTrigger } from "@/components/database/rect-popover-anchor";
import type {
  DbProperty,
  RollupAggregation,
} from "@/components/database/types";
import { PageIcon } from "@/components/pages/page-icon";
import { cn } from "@/lib/utils";

interface RollupConfigPickerProps {
  onBack: () => void;
  onClose: () => void;
  onPick: (config: {
    relationPropertyId: string;
    targetPropertyId: string;
    aggregation: RollupAggregation;
  }) => void;
  /** This database's own properties — used to list its Relation properties
   *  (Rollup always aggregates THROUGH one of them) in step 1. */
  properties: DbProperty[];
  rect: DOMRect;
}

const NUMERIC_AGGS: { value: RollupAggregation; label: string }[] = [
  { value: "sum", label: "Sum" },
  { value: "average", label: "Average" },
  { value: "min", label: "Min" },
  { value: "max", label: "Max" },
  { value: "range", label: "Range" },
];
const DATE_AGGS: { value: RollupAggregation; label: string }[] = [
  { value: "earliest", label: "Earliest date" },
  { value: "latest", label: "Latest date" },
];
const BASE_AGGS: { value: RollupAggregation; label: string }[] = [
  { value: "count", label: "Count all" },
  { value: "count_values", label: "Count values" },
];

function aggregationsFor(
  targetType: string | undefined
): { value: RollupAggregation; label: string }[] {
  if (targetType === "number") {
    return [...BASE_AGGS, ...NUMERIC_AGGS];
  }
  if (targetType === "date") {
    return [...BASE_AGGS, ...DATE_AGGS];
  }
  return BASE_AGGS;
}

// Steps: 1) which of this database's Relation properties to aggregate
// through, 2) which property on the related database to aggregate, 3) which
// aggregation function. Mirrors relation-database-picker.tsx's shape/pattern.
export function RollupConfigPicker({
  rect,
  properties,
  onBack,
  onClose,
  onPick,
}: RollupConfigPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [relationProp, setRelationProp] = useState<DbProperty | null>(null);
  const [targetProps, setTargetProps] = useState<DbProperty[]>([]);
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [targetProp, setTargetProp] = useState<DbProperty | null>(null);

  const relationProps = properties.filter((p) => p.type === "relation");

  useEffect(() => {
    function h(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (
        target.closest?.('[role="alertdialog"], [data-edit-property-exempt]')
      ) {
        return;
      }
      if (ref.current && !ref.current.contains(target)) {
        onClose();
      }
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [onClose]);

  useEffect(() => {
    if (!relationProp) {
      return;
    }
    const relatedDatabaseId = relationProp.config?.relatedDatabaseId;
    if (!relatedDatabaseId) {
      setTargetProps([]);
      return;
    }
    setLoadingTargets(true);
    fetch(`/api/databases/${relatedDatabaseId}/properties`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: DbProperty[]) =>
        setTargetProps(
          Array.isArray(rows)
            ? rows.filter((p) => !p.isSystem && p.type !== "rollup")
            : []
        )
      )
      .catch(() => setTargetProps([]))
      .finally(() => setLoadingTargets(false));
  }, [relationProp]);

  const width = 260;
  const step = targetProp ? 3 : relationProp ? 2 : 1;

  const backAction =
    step === 3
      ? () => setTargetProp(null)
      : step === 2
        ? () => setRelationProp(null)
        : onBack;
  const stepTitle =
    step === 3
      ? "Choose aggregation"
      : step === 2
        ? "Choose property to roll up"
        : "Choose a relation";

  return (
    <Popover>
      <RectAnchorTrigger rect={rect} />
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 4 }}
        className="z-500 flex flex-col overflow-hidden rounded-md border border-base-300 bg-base-200"
        data-edit-property-exempt
        ref={ref}
        static
        style={{ width }}
      >
        <div className="flex items-center gap-1.5 border-b border-base-300 px-2.5 py-2">
          <button
            aria-label="Back"
            className="flex size-5 shrink-0 items-center justify-center rounded-xs text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            onClick={backAction}
            type="button"
          >
            <ArrowLeft size={13} />
          </button>
          <p className="text-xs font-semibold text-base-content/80">
            {stepTitle}
          </p>
        </div>

        {step === 1 && (
          <Listbox
            onChange={(p: DbProperty | null) => p && setRelationProp(p)}
            value={null}
          >
            <ListboxOptions className="max-h-72 overflow-y-auto p-1" static>
              {relationProps.length === 0 && (
                <p className="px-3 py-3 text-xs text-base-content/70">
                  This database has no Relation properties yet. Create one first
                  — Rollup always aggregates through a Relation.
                </p>
              )}
              {relationProps.map((p) => (
                <ListboxOption
                  className={({ focus }) =>
                    cn(
                      "flex w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-base-content",
                      focus && "bg-base-200"
                    )
                  }
                  key={p.id}
                  value={p}
                >
                  <ArrowLeftRight
                    className="shrink-0 text-base-content/70"
                    size={13}
                  />
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
        )}

        {step === 2 && (
          <Listbox
            onChange={(p: DbProperty | null) => p && setTargetProp(p)}
            value={null}
          >
            <ListboxOptions className="max-h-72 overflow-y-auto p-1" static>
              {loadingTargets && (
                <p className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-base-content/70">
                  <Loader2 className="animate-spin" size={12} />
                  Loading…
                </p>
              )}
              {!loadingTargets && targetProps.length === 0 && (
                <p className="px-3 py-2.5 text-xs text-base-content/70">
                  No properties to roll up on the related database.
                </p>
              )}
              {!loadingTargets &&
                targetProps.map((p) => {
                  const Icon =
                    PROPERTY_TYPE_ICON[
                      p.type as keyof typeof PROPERTY_TYPE_ICON
                    ] ?? ArrowLeftRight;
                  const propConfig = (p.config ?? {}) as { icon?: string };
                  return (
                    <ListboxOption
                      className={({ focus }) =>
                        cn(
                          "flex w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-base-content",
                          focus && "bg-base-200"
                        )
                      }
                      key={p.id}
                      value={p}
                    >
                      {propConfig.icon ? (
                        <PageIcon
                          className="shrink-0"
                          icon={propConfig.icon}
                          size={13}
                        />
                      ) : (
                        <Icon
                          className="shrink-0 text-base-content/70"
                          size={13}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </ListboxOption>
                  );
                })}
            </ListboxOptions>
          </Listbox>
        )}

        {step === 3 && relationProp && targetProp && (
          <Listbox
            onChange={(agg: RollupAggregation | null) =>
              agg &&
              onPick({
                relationPropertyId: relationProp.id,
                targetPropertyId: targetProp.id,
                aggregation: agg,
              })
            }
            value={null}
          >
            <ListboxOptions className="p-1" static>
              {aggregationsFor(targetProp.type).map((agg) => (
                <ListboxOption
                  className={({ focus }) =>
                    cn(
                      "flex w-full cursor-default items-center justify-between rounded-sm px-2.5 py-2 text-left text-sm text-base-content",
                      focus && "bg-base-200"
                    )
                  }
                  key={agg.value}
                  value={agg.value}
                >
                  {agg.label}
                  {/* Reserves the checkmark's width so labels stay aligned — this
                      list never shows a persisted selection (picking always
                      commits immediately via onPick), so the icon itself is
                      never actually rendered. */}
                  <span className="size-3 shrink-0" />
                </ListboxOption>
              ))}
            </ListboxOptions>
          </Listbox>
        )}
      </PopoverPanel>
    </Popover>
  );
}
