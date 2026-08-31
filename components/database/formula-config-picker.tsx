"use client";

import { Popover, PopoverPanel } from "@headlessui/react";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { RectAnchorTrigger } from "@/components/database/rect-popover-anchor";
import type { DbProperty } from "@/components/database/types";
import {
  evaluateFormulaValue,
  type FormulaValue,
  formatFormulaValue,
  tryParseFormula,
} from "@/lib/formula";

interface FormulaConfigPickerProps {
  databaseId: string;
  onBack: () => void;
  onClose: () => void;
  onPick: (expression: string) => void;
  properties: DbProperty[];
  rect: DOMRect;
}

// Mirrors app/api/databases/[id]/entries/route.ts's rawToFormulaValue for this client-side
// preview; formula/rollup reuse the server's `.display` string to avoid re-evaluating.
function rawToFormulaValue(prop: DbProperty, raw: unknown): FormulaValue {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "text":
    case "url":
    case "email":
    case "phone":
      return (v?.[prop.type] as string | undefined) ?? null;
    case "number":
      return (v?.number as number | null | undefined) ?? null;
    case "checkbox":
      return !!(v?.checked as boolean | undefined);
    case "date": {
      const d = v?.date as string | undefined;
      return d ? new Date(d) : null;
    }
    case "select":
    case "status": {
      const optId = v?.optionId as string | undefined;
      if (!optId) {
        return null;
      }
      const options = (prop.config?.options ?? []) as {
        id: string;
        name: string;
      }[];
      return options.find((o) => o.id === optId)?.name ?? null;
    }
    case "multi_select": {
      const ids = (v?.optionIds as string[] | undefined) ?? [];
      const options = (prop.config?.options ?? []) as {
        id: string;
        name: string;
      }[];
      return (
        ids
          .map((id) => options.find((o) => o.id === id)?.name)
          .filter(Boolean)
          .join(", ") || null
      );
    }
    case "person": {
      const members =
        (v?._members as { name?: string; email?: string }[] | undefined) ?? [];
      return (
        members
          .map((m) => m.name || m.email)
          .filter(Boolean)
          .join(", ") || null
      );
    }
    case "relation":
      return ((v?.entryIds as string[] | undefined) ?? []).length;
    case "rollup":
    case "formula":
      return (v?.display as string | null | undefined) ?? null;
    default:
      return null;
  }
}

// Mirrors lib/databases/compute-values.ts's rawToCount — see rawToFormulaValue
// above for why this file keeps its own copy instead of importing the server
// version.
function rawToCount(prop: DbProperty, raw: unknown): number {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "person":
      return ((v?._members as unknown[] | undefined) ?? []).length;
    case "multi_select":
      return ((v?.optionIds as unknown[] | undefined) ?? []).length;
    case "relation":
      return ((v?.entryIds as unknown[] | undefined) ?? []).length;
    default:
      throw new Error(
        `count() doesn't work on "${prop.name}" — only Person, Multi-select, and Relation properties have a count.`
      );
  }
}

export function FormulaConfigPicker({
  rect,
  databaseId,
  properties,
  onBack,
  onClose,
  onPick,
}: FormulaConfigPickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [expression, setExpression] = useState("");
  const [sampleEntry, setSampleEntry] = useState<{
    id: string;
    values: Map<string, unknown>;
  } | null>(null);

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
    fetch(`/api/databases/${databaseId}/entries`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            entries: { id: string }[];
            propertyValues: {
              entryId: string;
              propertyId: string;
              value: unknown;
            }[];
          } | null
        ) => {
          if (!data?.entries?.length) {
            return;
          }
          const first = data.entries[0];
          const values = new Map<string, unknown>();
          for (const v of data.propertyValues) {
            if (v.entryId === first.id) {
              values.set(v.propertyId, v.value);
            }
          }
          setSampleEntry({ id: first.id, values });
        }
      )
      .catch(() => {});
  }, [databaseId]);

  const { ast, error: parseError } = useMemo(
    () => tryParseFormula(expression),
    [expression]
  );

  const preview = useMemo(() => {
    if (!expression.trim()) {
      return { display: "", error: null as string | null };
    }
    if (parseError) {
      return { display: "", error: parseError };
    }
    if (!ast) {
      return { display: "", error: null };
    }
    if (!sampleEntry) {
      return { display: "", error: null };
    }
    const { value, error } = evaluateFormulaValue(expression, {
      resolveProp: (name) => {
        const prop = properties.find((p) => p.name === name);
        if (!prop) {
          throw new Error(`Unknown property "${name}"`);
        }
        return rawToFormulaValue(prop, sampleEntry.values.get(prop.id) ?? null);
      },
      resolveCount: (name) => {
        const prop = properties.find((p) => p.name === name);
        if (!prop) {
          throw new Error(`Unknown property "${name}"`);
        }
        return rawToCount(prop, sampleEntry.values.get(prop.id) ?? null);
      },
    });
    if (error) {
      return { display: "", error };
    }
    return { display: formatFormulaValue(value), error: null };
  }, [expression, ast, parseError, sampleEntry, properties]);

  function insertPropRef(name: string) {
    const ta = textareaRef.current;
    const snippet = `prop("${name}")`;
    if (!ta) {
      setExpression((e) => e + snippet);
      return;
    }
    const start = ta.selectionStart ?? expression.length;
    const end = ta.selectionEnd ?? expression.length;
    const next = expression.slice(0, start) + snippet + expression.slice(end);
    setExpression(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  }

  const width = 320;

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
            onClick={onBack}
            type="button"
          >
            <ArrowLeft size={13} />
          </button>
          <p className="text-xs font-semibold text-base-content/80">
            Edit formula
          </p>
        </div>

        <div className="flex flex-col gap-2 p-2.5">
          <textarea
            autoFocus
            className="w-full resize-none rounded-sm border border-base-300 bg-base-200/20 px-2.5 py-2 font-mono text-xs text-base-content placeholder:text-base-content/50 focus:border-primary/40 focus:outline-none"
            onChange={(e) => setExpression(e.target.value)}
            placeholder='e.g. if(prop("Status") == "Done", "✅", "")'
            ref={textareaRef}
            rows={4}
            value={expression}
          />

          <div>
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
              Insert property
            </p>
            <div className="flex flex-wrap gap-1">
              {properties
                .filter((p) => !p.isSystem)
                .map((p) => (
                  <button
                    className="rounded-xs border border-base-300 bg-base-200/30 px-1.5 py-0.5 text-xs text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    key={p.id}
                    onClick={() => insertPropRef(p.name)}
                    type="button"
                  >
                    {p.name}
                  </button>
                ))}
            </div>
          </div>

          <div className="rounded-sm border border-base-300 bg-base-200/20 px-2.5 py-2">
            <p className="mb-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
              Preview
            </p>
            {preview.error ? (
              <p className="flex items-start gap-1.5 text-xs text-error">
                <AlertCircle className="mt-0.5 shrink-0" size={12} />
                {preview.error}
              </p>
            ) : (
              <p className="truncate text-sm text-base-content">
                {preview.display || (
                  <span className="text-base-content/50">—</span>
                )}
              </p>
            )}
          </div>

          <button
            className="flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-content hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!expression.trim() || !!parseError}
            onClick={() => onPick(expression.trim())}
            type="button"
          >
            <Check size={12} />
            Save formula
          </button>
        </div>
      </PopoverPanel>
    </Popover>
  );
}
