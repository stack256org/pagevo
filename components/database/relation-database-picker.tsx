"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Popover,
  PopoverPanel,
} from "@headlessui/react";
import {
  ArrowLeft,
  Check,
  Database as DatabaseIcon,
  Loader2,
  Search,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RectAnchorTrigger } from "@/components/database/rect-popover-anchor";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface DatabaseOption {
  id: string;
  shortId: string;
  title: string | null;
}

interface RelationDatabasePickerProps {
  onBack: () => void;
  onClose: () => void;
  /** Self-relations (relating a database to itself, for hierarchies like
   *  "Sub-tasks") are valid in Notion, so the current database is never
   *  excluded from the results — only the workspace's own set of databases
   *  scopes the search. */
  onPick: (relatedDatabaseId: string, twoWay: boolean) => void;
  rect: DOMRect;
  workspaceId: string;
}

// Reuses the same workspace-database search endpoint InlineDatabase's
// "link existing" flow already uses (components/editor/extensions/reference-blocks.tsx),
// rather than a second bespoke search implementation.
export function RelationDatabasePicker({
  rect,
  workspaceId,
  onBack,
  onClose,
  onPick,
}: RelationDatabasePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<DatabaseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DatabaseOption | null>(null);
  const [twoWay, setTwoWay] = useState(true);

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
    setLoading(true);
    const t = setTimeout(() => {
      fetch(
        `/api/workspaces/${workspaceId}/databases?q=${encodeURIComponent(search)}`
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: DatabaseOption[]) =>
          setResults(Array.isArray(rows) ? rows : [])
        )
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 150);
    return () => clearTimeout(t);
  }, [search, workspaceId]);

  const width = 260;

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
            onClick={selected ? () => setSelected(null) : onBack}
            type="button"
          >
            <ArrowLeft size={13} />
          </button>
          <p className="text-xs font-semibold text-base-content/80">
            {selected ? "Relate to a database" : "Select related database"}
          </p>
        </div>

        {selected ? (
          <div className="flex flex-col gap-3 p-3">
            <div className="flex items-center gap-2.5 rounded-sm bg-base-200/30 px-2.5 py-2">
              <DatabaseIcon
                className="shrink-0 text-base-content/70"
                size={13}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-base-content">
                {selected.title || "Untitled"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-base-content">
                  Show on related database
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  Adds a matching property there too
                </p>
              </div>
              <Switch
                aria-label="Two-way relation"
                checked={twoWay}
                onCheckedChange={(v) => setTwoWay(!!v)}
              />
            </div>
            <button
              className="flex items-center justify-center gap-1.5 rounded-sm bg-primary px-3 py-2 text-xs font-semibold text-primary-content hover:bg-primary/90"
              onClick={() => onPick(selected.id, twoWay)}
              type="button"
            >
              <Check size={12} />
              Create relation
            </button>
          </div>
        ) : (
          <Combobox
            onChange={(db: DatabaseOption | null) => db && setSelected(db)}
            value={null}
          >
            <div className="flex items-center gap-1.5 border-b border-base-300 px-2.5 py-2">
              <Search className="shrink-0 text-base-content/70" size={12} />
              <ComboboxInput
                autoFocus
                className="w-full bg-transparent text-xs placeholder:text-base-content/50 focus:outline-none"
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search databases…"
                value={search}
              />
            </div>
            <ComboboxOptions className="max-h-56 overflow-y-auto p-1" static>
              {loading && (
                <p className="flex items-center gap-1.5 px-3 py-2.5 text-xs text-base-content/70">
                  <Loader2 className="animate-spin" size={12} />
                  Loading…
                </p>
              )}
              {!loading && results.length === 0 && (
                <p className="px-3 py-2.5 text-xs text-base-content/70">
                  No databases found
                </p>
              )}
              {!loading &&
                results.map((db) => (
                  <ComboboxOption
                    className={({ focus }) =>
                      cn(
                        "flex w-full cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-base-content",
                        focus && "bg-base-200"
                      )
                    }
                    key={db.id}
                    value={db}
                  >
                    <DatabaseIcon
                      className="shrink-0 text-base-content/70"
                      size={13}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {db.title || "Untitled"}
                    </span>
                  </ComboboxOption>
                ))}
            </ComboboxOptions>
          </Combobox>
        )}
      </PopoverPanel>
    </Popover>
  );
}
