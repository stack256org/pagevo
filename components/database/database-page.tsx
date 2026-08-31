"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BoardView } from "@/components/database/board-view";
import { CalendarView } from "@/components/database/calendar-view";
import { EntrySidePanel } from "@/components/database/entry-side-panel";
import { FilterBar } from "@/components/database/filter-bar";
import { GalleryView } from "@/components/database/gallery-view";
import { GanttView } from "@/components/database/gantt-view";
import { isGroupableType } from "@/components/database/grouping";
import { SortBar } from "@/components/database/sort-bar";
import { TableView } from "@/components/database/table-view";
import { DatabaseToolbar } from "@/components/database/toolbar";
import type {
  DbEntry,
  DbProperty,
  DbPropertyConfig,
  DbPropertyValue,
  DbView,
  FilterRule,
  SharedViewProps,
  SortRule,
} from "@/components/database/types";
import { PageHeader } from "@/components/pages/page-header";
import { Skeleton } from "@/components/ui/skeleton";

interface DatabasePageProps {
  databaseId: string;
  initialIcon: string | null;
  initialTitle: string | null;
  inline?: boolean;
  isDeleted: boolean;
  isEditor: boolean;
  isLocked: boolean;
  pageShortId: string;
  workspaceId: string;
  workspaceSlug: string;
}

export function DatabasePage({
  databaseId,
  workspaceId,
  workspaceSlug,
  isEditor,
  initialTitle,
  initialIcon,
  isLocked,
  isDeleted,
  pageShortId,
  inline = false,
}: DatabasePageProps) {
  const router = useRouter();
  const [views, setViews] = useState<DbView[]>([]);
  const [properties, setProperties] = useState<DbProperty[]>([]);
  const [entries, setEntries] = useState<DbEntry[]>([]);
  const [rawValues, setRawValues] = useState<DbPropertyValue[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showFilterBar, setShowFilterBar] = useState(false);
  const [showSortBar, setShowSortBar] = useState(false);
  const [panelEntryId, setPanelEntryId] = useState<string | null>(null);

  // Search + selection
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ── Derived state ─────────────────────────────────────────────────────────

  const valueMap = useMemo(() => {
    const m = new Map<string, Map<string, unknown>>();
    for (const v of rawValues) {
      if (!m.has(v.entryId)) {
        m.set(v.entryId, new Map());
      }
      m.get(v.entryId)!.set(v.propertyId, v.value);
    }
    return m;
  }, [rawValues]);

  const activeView = useMemo(
    () => views.find((v) => v.id === activeViewId) ?? views[0] ?? null,
    [views, activeViewId]
  );

  const displayedEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return entries;
    }
    const q = searchQuery.toLowerCase();
    return entries.filter((e) => (e.title ?? "").toLowerCase().includes(q));
  }, [entries, searchQuery]);

  // ── Data fetching ─────────────────────────────────────────────────────────

  const loadDatabase = useCallback(async () => {
    const res = await fetch(`/api/databases/${databaseId}`);
    if (!res.ok) {
      return;
    }
    const data = (await res.json()) as {
      views: DbView[];
      properties: DbProperty[];
    };
    setViews(data.views);
    setProperties(data.properties);
    return data;
  }, [databaseId]);

  const loadEntries = useCallback(
    async (viewId: string | null) => {
      const qs = viewId ? `?viewId=${viewId}` : "";
      const res = await fetch(`/api/databases/${databaseId}/entries${qs}`);
      if (!res.ok) {
        return;
      }
      const data = (await res.json()) as {
        entries: DbEntry[];
        propertyValues: DbPropertyValue[];
      };
      setEntries(data.entries);
      setRawValues(data.propertyValues);
    },
    [databaseId]
  );

  useEffect(() => {
    setLoading(true);
    loadDatabase()
      .then((data) => {
        if (data?.views.length) {
          const firstId = data.views[0].id;
          setActiveViewId(firstId);
          return loadEntries(firstId);
        }
      })
      .finally(() => setLoading(false));
    // Both loaders are useCallback([databaseId]), so keying on them re-runs this
    // exactly when the database changes — same lifecycle as the old [databaseId]
    // list, just expressed through the values actually referenced.
  }, [loadDatabase, loadEntries]);

  useEffect(() => {
    if (activeViewId) {
      loadEntries(activeViewId);
    }
    // loadEntries is useCallback([databaseId]) and databaseId is fixed for a
    // given mount, so this still fires only on view switches — no extra fetch.
  }, [activeViewId, loadEntries]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  // biome-ignore lint/correctness/useExhaustiveDependencies: createEntry cannot be listed here — it is a `const useCallback` declared further down, so evaluating it in this deps array during render throws a TDZ ReferenceError. It is memoized on [databaseId], which is fixed for a mount, so the captured reference never goes stale.
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      const editing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement).isContentEditable;

      // Cmd/Ctrl+K → focus search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      // N → new entry (when not typing)
      if (e.key === "n" && !editing && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        createEntry();
        return;
      }
      // Escape → clear selection
      if (e.key === "Escape" && selectedIds.size > 0) {
        setSelectedIds(new Set());
      }
    }
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [selectedIds]);

  // Lock parent <main> scroll for gantt (owns its own scroll container); Calendar
  // deliberately doesn't, so tall months can grow the page instead of squashing rows.
  useEffect(() => {
    const mainEl = document.querySelector<HTMLElement>("main");
    if (!mainEl) {
      return;
    }
    if (activeView?.type === "gantt") {
      mainEl.style.setProperty("overflow", "hidden", "important");
      return () => {
        mainEl.style.removeProperty("overflow");
      };
    }
    mainEl.style.removeProperty("overflow");
  }, [activeView?.type]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const updateValue = useCallback(
    async (entryId: string, propId: string, value: unknown) => {
      setRawValues((prev) => {
        const hit = prev.findIndex(
          (v) => v.entryId === entryId && v.propertyId === propId
        );
        if (hit >= 0) {
          return prev.map((v, i) => (i === hit ? { ...v, value } : v));
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            entryId,
            propertyId: propId,
            value,
            createdAt: "",
            updatedAt: "",
          },
        ];
      });
      await fetch(`/api/entries/${entryId}/property-values/${propId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:entry-value-changed", {
          detail: { entryId, propertyId: propId, value },
        })
      );
      // Busts the Next.js client router cache so a page navigated to next (e.g.
      // back to this database's own full-page view) re-fetches fresh server
      // data instead of reusing whatever was cached before this edit.
      router.refresh();
    },
    [router]
  );

  // Values can also change from an entry's own page (EntryPropertiesPanel) or the
  // row context menu — neither shares state with this list, so without this
  // listener a value edited elsewhere only shows up here after a full reload.
  useEffect(() => {
    function onValueChanged(e: Event) {
      const detail = (
        e as CustomEvent<{
          entryId: string;
          propertyId: string;
          value: unknown;
        }>
      ).detail;
      if (!detail) {
        return;
      }
      setRawValues((prev) => {
        const hit = prev.findIndex(
          (v) =>
            v.entryId === detail.entryId && v.propertyId === detail.propertyId
        );
        if (hit >= 0) {
          return prev.map((v, i) =>
            i === hit ? { ...v, value: detail.value } : v
          );
        }
        return [
          ...prev,
          {
            id: crypto.randomUUID(),
            entryId: detail.entryId,
            propertyId: detail.propertyId,
            value: detail.value,
            createdAt: "",
            updatedAt: "",
          },
        ];
      });
    }
    window.addEventListener("pagevo:entry-value-changed", onValueChanged);
    return () =>
      window.removeEventListener("pagevo:entry-value-changed", onValueChanged);
  }, []);

  // Catches edits the event listener above can't see: bfcache restores and
  // tab refocus after a value changed elsewhere (e.g. another tab).
  useEffect(() => {
    function refetch() {
      if (activeViewId) {
        loadEntries(activeViewId);
      }
    }
    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        refetch();
      }
    }
    function onPageShow(e: PageTransitionEvent) {
      if (e.persisted) {
        refetch();
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [activeViewId, loadEntries]);

  const updateTitle = useCallback(
    async (entryId: string, title: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, title } : e))
      );
      await fetch(`/api/pages/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:page-title-changed", {
          detail: { pageId: entryId, title },
        })
      );
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    },
    [router]
  );

  const updateEntryIcon = useCallback(
    async (entryId: string, icon: string) => {
      setEntries((prev) =>
        prev.map((e) => (e.id === entryId ? { ...e, icon } : e))
      );
      await fetch(`/api/pages/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon }),
      });
      window.dispatchEvent(
        new CustomEvent("pagevo:page-title-changed", {
          detail: { pageId: entryId, icon },
        })
      );
      window.dispatchEvent(new CustomEvent("pages:refresh"));
      router.refresh();
    },
    [router]
  );

  const createEntry = useCallback(
    async (defaultValues?: Record<string, unknown>) => {
      const res = await fetch(`/api/databases/${databaseId}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "", defaultValues }),
      });
      if (!res.ok) {
        return;
      }
      const { propertyValues: insertedValues, ...entry } =
        (await res.json()) as DbEntry & {
          propertyValues: {
            entryId: string;
            propertyId: string;
            value: unknown;
          }[];
        };
      setEntries((prev) => [...prev, entry]);

      // Mirrors EVERY value the server actually wrote — not just what this
      // caller happened to pass in — so a server-computed default (e.g. a
      // grouped Status property falling back to "Not started") shows up
      // immediately instead of only appearing after the next full refetch.
      if (insertedValues.length > 0) {
        setRawValues((prev) => [
          ...prev,
          ...insertedValues.map(
            (v) =>
              ({
                id: crypto.randomUUID(),
                entryId: v.entryId,
                propertyId: v.propertyId,
                value: v.value,
                createdAt: "",
                updatedAt: "",
              }) as DbPropertyValue
          ),
        ]);
      }

      return entry;
    },
    [databaseId]
  );

  const deleteEntry = useCallback(async (entryId: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
    setRawValues((prev) => prev.filter((v) => v.entryId !== entryId));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(entryId);
      return next;
    });
    await fetch(`/api/pages/${entryId}`, { method: "DELETE" });
    // Trashing an entry removes its favorite row server-side (see DELETE
    // /api/pages/[id]) — tell the sidebar to drop it from Favorites too.
    window.dispatchEvent(new CustomEvent("pagevo:favorites-changed"));
  }, []);

  const duplicateEntry = useCallback(
    async (entryId: string) => {
      const res = await fetch(`/api/pages/${entryId}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) {
        return;
      }
      const dup = (await res.json()) as DbEntry;
      setEntries((prev) => [...prev, dup]);
      const dupValues = rawValues
        .filter((v) => v.entryId === entryId)
        .map((v) => ({ ...v, id: crypto.randomUUID(), entryId: dup.id }));
      if (dupValues.length) {
        setRawValues((prev) => [...prev, ...dupValues]);
      }
    },
    [rawValues]
  );

  const bulkDelete = useCallback(async () => {
    const ids = [...selectedIds];
    setEntries((prev) => prev.filter((e) => !selectedIds.has(e.id)));
    setRawValues((prev) => prev.filter((v) => !selectedIds.has(v.entryId)));
    setSelectedIds(new Set());
    await Promise.all(
      ids.map((id) => fetch(`/api/pages/${id}`, { method: "DELETE" }))
    );
    window.dispatchEvent(new CustomEvent("pagevo:favorites-changed"));
  }, [selectedIds]);

  const addProperty = useCallback(
    async (
      name: string,
      type: string,
      config?: DbPropertyConfig,
      twoWay?: boolean
    ) => {
      const res = await fetch(`/api/databases/${databaseId}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, config, twoWay }),
      });
      if (!res.ok) {
        return;
      }
      const prop = (await res.json()) as DbProperty;
      setProperties((prev) => [...prev, prop]);
      return prop;
    },
    [databaseId]
  );

  const updateProperty = useCallback(
    async (propId: string, patch: Record<string, unknown>) => {
      setProperties((prev) =>
        prev.map((p) =>
          p.id === propId ? ({ ...p, ...patch } as DbProperty) : p
        )
      );
      await fetch(`/api/databases/${databaseId}/properties/${propId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      // Type changes reshape (or drop) stored values; refetch so cached
      // rawValues don't render blank until the next full page load.
      if (patch.type && activeViewId) {
        await loadEntries(activeViewId);
      }
    },
    [databaseId, activeViewId, loadEntries]
  );

  const deleteProperty = useCallback(
    async (propId: string) => {
      const res = await fetch(
        `/api/databases/${databaseId}/properties/${propId}`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        return;
      }
      setProperties((prev) => prev.filter((p) => p.id !== propId));
      setRawValues((prev) => prev.filter((v) => v.propertyId !== propId));
    },
    [databaseId]
  );

  const addView = useCallback(
    async (name: string, type: string) => {
      // Board/Calendar are empty until a group-by/date property exists, so auto-pick
      // one (or create a starter Status property) instead of showing a broken view.
      const body: Record<string, unknown> = { name, type };
      if (type === "board") {
        let groupProp = properties.find(
          (p) => isGroupableType(p.type) && !p.isSystem
        );
        if (!groupProp) {
          const propRes = await fetch(
            `/api/databases/${databaseId}/properties`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Status", type: "status" }),
            }
          );
          if (propRes.ok) {
            groupProp = (await propRes.json()) as DbProperty;
            setProperties((prev) => [...prev, groupProp!]);
          }
        }
        if (groupProp) {
          body.groupByPropertyId = groupProp.id;
        }
      } else if (type === "calendar") {
        let dateProp = properties.find((p) => p.type === "date" && !p.isSystem);
        if (!dateProp) {
          const propRes = await fetch(
            `/api/databases/${databaseId}/properties`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ name: "Date", type: "date" }),
            }
          );
          if (propRes.ok) {
            dateProp = (await propRes.json()) as DbProperty;
            setProperties((prev) => [...prev, dateProp!]);
          }
        }
        if (dateProp) {
          body.calendarPropertyId = dateProp.id;
        }
      }
      const res = await fetch(`/api/databases/${databaseId}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return;
      }
      const view = (await res.json()) as DbView;
      setViews((prev) => [...prev, view]);
      setActiveViewId(view.id);
    },
    [databaseId, properties]
  );

  const updateView = useCallback(
    async (viewId: string, patch: Record<string, unknown>) => {
      setViews((prev) =>
        prev.map((v) => (v.id === viewId ? ({ ...v, ...patch } as DbView) : v))
      );
      await fetch(`/api/databases/${databaseId}/views/${viewId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    },
    [databaseId]
  );

  const duplicateView = useCallback(
    async (viewId: string) => {
      const src = views.find((v) => v.id === viewId);
      if (!src) {
        return;
      }
      const res = await fetch(`/api/databases/${databaseId}/views`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${src.name} (copy)`,
          type: src.type,
          filters: src.filters,
          sorts: src.sorts,
          filterLogic: src.filterLogic,
          groupByPropertyId: src.groupByPropertyId,
          calendarPropertyId: src.calendarPropertyId,
          ganttStartPropertyId: src.ganttStartPropertyId,
          ganttEndPropertyId: src.ganttEndPropertyId,
          cardDisplayProps: src.cardDisplayProps,
          galleryCardSize: src.galleryCardSize,
          entryOpenMode: src.entryOpenMode,
        }),
      });
      if (!res.ok) {
        return;
      }
      const copy = (await res.json()) as DbView;
      setViews((prev) => [...prev, copy]);
      setActiveViewId(copy.id);
    },
    [databaseId, views]
  );

  const deleteView = useCallback(
    async (viewId: string) => {
      if (views.length <= 1) {
        return;
      }
      const res = await fetch(`/api/databases/${databaseId}/views/${viewId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        return;
      }
      const remaining = views.filter((v) => v.id !== viewId);
      setViews(remaining);
      if (activeViewId === viewId) {
        setActiveViewId(remaining[0]?.id ?? null);
      }
    },
    [databaseId, views, activeViewId]
  );

  const selectEntry = useCallback((entryId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) {
        next.add(entryId);
      } else {
        next.delete(entryId);
      }
      return next;
    });
  }, []);

  // ── Shared view props ─────────────────────────────────────────────────────

  const openEntry = useCallback(
    (entry: DbEntry) => {
      if ((activeView?.entryOpenMode ?? "side_panel") === "side_panel") {
        setPanelEntryId(entry.id);
        return;
      }
      router.push(`/app/${workspaceSlug}/${entry.shortId}`);
    },
    [router, workspaceSlug, activeView]
  );

  const panelEntry = panelEntryId
    ? (entries.find((e) => e.id === panelEntryId) ?? null)
    : null;

  const sharedViewProps: SharedViewProps = {
    databaseId,
    workspaceId,
    workspaceSlug,
    entries: displayedEntries,
    properties,
    valueMap,
    activeView,
    isEditor,
    selectedEntryIds: selectedIds,
    onUpdateValue: updateValue,
    onUpdateTitle: updateTitle,
    onCreateEntry: createEntry,
    onAddProperty: addProperty,
    onUpdateProperty: updateProperty,
    onDeleteProperty: deleteProperty,
    onUpdateView: (patch) =>
      activeView ? updateView(activeView.id, patch) : Promise.resolve(),
    onDeleteEntry: deleteEntry,
    onDuplicateEntry: duplicateEntry,
    onSelectEntry: selectEntry,
    onOpenEntry: openEntry,
    onUpdateEntryIcon: updateEntryIcon,
  };

  // ── Loading skeleton ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="mx-auto flex h-full w-full max-w-275 flex-col">
        <div className="shrink-0">
          <div className="px-4 pt-6 pb-4 sm:px-8 sm:pt-8 lg:px-16 lg:pt-10 lg:pb-6">
            <Skeleton className="mb-3 h-10 w-64 rounded-md bg-base-200/50" />
            <Skeleton className="h-4 w-40 bg-base-200/30" />
          </div>
        </div>
        <Skeleton className="h-11 shrink-0 rounded-none border-y border-base-300 bg-base-200/10" />
        <div className="flex-1">
          <div className="px-4 pt-3 sm:px-8 lg:px-16 lg:pt-4">
            {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton
                className="mb-0.5 h-11 bg-base-200/20"
                key={i}
                style={{ animationDelay: `${i * 50}ms`, opacity: 1 - i * 0.1 }}
              />
            ))}
            {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  // Calendar can exceed viewport height, so it uses min-h-* (page scrolls) while other
  // views stay boxed. Inline embeds size against a fixed 420px box, not the viewport.
  const isCalendar = activeView?.type === "calendar";
  const heightCls = isCalendar
    ? inline
      ? "min-h-105"
      : "min-h-full"
    : inline
      ? "h-105 overflow-hidden"
      : "h-full overflow-hidden";

  return (
    <div
      className={`mx-auto flex w-full max-w-275 flex-col bg-base-100 isolate ${heightCls}`}
    >
      {/* ── Page title / icon (hidden in inline/embedded mode) ── */}
      {!inline && (
        <div className="shrink-0 group/page">
          <div className="px-4 pt-6 pb-2 sm:px-8 sm:pt-8 lg:px-16 lg:pt-10 lg:pb-3">
            <PageHeader
              fontFamily="default"
              initialIcon={initialIcon}
              initialTitle={initialTitle ?? ""}
              isDeleted={isDeleted}
              isEditor={isEditor}
              isFullWidth
              isLocked={isLocked}
              isSmallText={false}
              pageId={databaseId}
              shortId={pageShortId}
              workspaceId={workspaceId}
              workspaceSlug={workspaceSlug}
            />
          </div>
        </div>
      )}

      {/* ── Toolbar ── */}
      <DatabaseToolbar
        activeView={activeView}
        activeViewId={activeView?.id ?? null}
        databaseId={databaseId}
        inline={inline}
        isEditor={isEditor}
        onAddProperty={addProperty}
        onAddView={addView}
        onBulkDelete={bulkDelete}
        onClearSelection={() => setSelectedIds(new Set())}
        onCreateEntry={async () => {
          const entry = await createEntry();
          if (entry) {
            openEntry(entry);
          }
        }}
        onDeleteView={deleteView}
        onDuplicateView={duplicateView}
        onSearchChange={setSearchQuery}
        onSwitchView={setActiveViewId}
        onToggleFilterBar={() => {
          setShowFilterBar((v) => !v);
          setShowSortBar(false);
        }}
        onToggleSortBar={() => {
          setShowSortBar((v) => !v);
          setShowFilterBar(false);
        }}
        onUpdateView={updateView}
        properties={properties}
        searchInputRef={searchInputRef}
        searchQuery={searchQuery}
        selectedCount={selectedIds.size}
        showFilterBar={showFilterBar}
        showSortBar={showSortBar}
        totalEntries={displayedEntries.length}
        views={views}
        workspaceId={workspaceId}
      />

      {/* ── Filter bar ── */}
      {showFilterBar && activeView && (
        <FilterBar
          filterLogic={(activeView.filterLogic as "and" | "or") ?? "and"}
          filters={(activeView.filters ?? []) as FilterRule[]}
          onChange={(filters) => updateView(activeView.id, { filters })}
          onFilterLogicChange={(logic) =>
            updateView(activeView.id, { filterLogic: logic })
          }
          properties={properties}
        />
      )}

      {/* ── Sort bar ── */}
      {showSortBar && activeView && (
        <SortBar
          onChange={(sorts) => updateView(activeView.id, { sorts })}
          properties={properties}
          sorts={(activeView.sorts ?? []) as SortRule[]}
        />
      )}

      {/* ── View content ── */}
      <div
        className={`min-h-0 flex-1 ${isCalendar ? "flex flex-col" : activeView?.type === "gantt" ? "overflow-hidden" : activeView?.type === "table" ? "" : "overflow-y-auto overflow-x-hidden"}`}
      >
        <div
          className={
            isCalendar
              ? "flex w-full flex-1 flex-col"
              : activeView?.type === "gantt" || activeView?.type === "table"
                ? "h-full w-full"
                : "min-h-full w-full"
          }
        >
          {!activeView && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-base-content/70">
                No views configured.
              </p>
              {isEditor && (
                <button
                  className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
                  onClick={() => addView("Table", "table")}
                  type="button"
                >
                  <Plus size={14} />
                  Add a view
                </button>
              )}
            </div>
          )}
          {activeView?.type === "table" && <TableView {...sharedViewProps} />}
          {activeView?.type === "board" && <BoardView {...sharedViewProps} />}
          {activeView?.type === "calendar" && (
            <CalendarView {...sharedViewProps} />
          )}
          {activeView?.type === "gallery" && (
            <GalleryView {...sharedViewProps} />
          )}
          {activeView?.type === "gantt" && <GanttView {...sharedViewProps} />}
        </div>
      </div>

      {panelEntry && (
        <EntrySidePanel
          entry={panelEntry}
          isEditor={isEditor}
          onAddProperty={addProperty}
          onClose={() => setPanelEntryId(null)}
          onDeleteEntry={deleteEntry}
          onUpdateTitle={updateTitle}
          onUpdateValue={updateValue}
          properties={properties}
          valueMap={valueMap}
          workspaceId={workspaceId}
          workspaceSlug={workspaceSlug}
        />
      )}
    </div>
  );
}
