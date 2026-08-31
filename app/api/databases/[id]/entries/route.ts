import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { computeDerivedValues } from "@/lib/databases/compute-values";
import { db } from "@/lib/db";
import {
  comments,
  databaseProperties,
  databaseViews,
  pages,
  propertyValues,
  workspaceMembers,
} from "@/lib/db/schema";
import { createPageWithClosure } from "@/lib/pages/closure";
import { upsertPageSearchIndex } from "@/lib/search/index-page";

type SortRule = { propertyId: string; direction: "asc" | "desc" };
type FilterRule = { propertyId: string; operator: string; value: unknown };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: databaseId } = await params;
  const session = await requireSession();

  const [dbPage] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, databaseId), eq(pages.kind, "database")))
    .limit(1);
  if (!dbPage) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, dbPage.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (!member) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const viewId = url.searchParams.get("viewId");

  // Load active view config for filters + sorts
  let sorts: SortRule[] = [];
  let filters: FilterRule[] = [];
  let filterLogic: "and" | "or" = "and";
  if (viewId) {
    const [view] = await db
      .select()
      .from(databaseViews)
      .where(eq(databaseViews.id, viewId))
      .limit(1);
    if (view) {
      sorts = (view.sorts as SortRule[]) ?? [];
      filters = (view.filters as FilterRule[]) ?? [];
      filterLogic = (view.filterLogic as "and" | "or") ?? "and";
    }
  }

  // Load all entries (not deleted)
  const entries = await db
    .select()
    .from(pages)
    .where(
      and(
        eq(pages.databaseId, databaseId),
        eq(pages.kind, "entry"),
        eq(pages.isDeleted, false)
      )
    )
    .orderBy(asc(pages.createdAt));

  if (!entries.length) {
    return Response.json({ entries: [], propertyValues: [] });
  }

  const entryIds = entries.map((e) => e.id);

  // Unresolved page-level comment count per entry (excludes property-scoped comments, which the badge's popover doesn't show).
  const commentCountRows = await db
    .select({ pageId: comments.pageId, count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        inArray(comments.pageId, entryIds),
        isNull(comments.parentId),
        isNull(comments.propertyId),
        eq(comments.isResolved, false),
        isNull(comments.deletedAt)
      )
    )
    .groupBy(comments.pageId);
  const commentCountMap = new Map(
    commentCountRows.map((r) => [r.pageId, r.count])
  );

  // Load all property values for these entries
  const values = await db
    .select()
    .from(propertyValues)
    .where(inArray(propertyValues.entryId, entryIds));

  // Apply AND filters in JS (SQL-level would require dynamic query building)
  const properties = await db
    .select()
    .from(databaseProperties)
    .where(eq(databaseProperties.databaseId, databaseId));

  const propMap = new Map(properties.map((p) => [p.id, p]));
  const valMap = new Map<string, Map<string, unknown>>();
  for (const v of values) {
    if (!valMap.has(v.entryId)) {
      valMap.set(v.entryId, new Map());
    }
    valMap.get(v.entryId)!.set(v.propertyId, v.value);
  }

  // Computed (rollup/created-by/formula) values are appended in the same shape as real rows, and folded into valMap so filters/sorts see them too.
  const computedValues = await computeDerivedValues(
    properties,
    entries,
    valMap
  );
  const allValues = [
    ...values,
    ...computedValues.map((cv) => ({
      id: `computed:${cv.propertyId}:${cv.entryId}`,
      entryId: cv.entryId,
      propertyId: cv.propertyId,
      value: cv.value,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    })),
  ];

  let filtered = entries;
  if (filters.length > 0) {
    filtered = entries.filter((entry) => {
      const results = filters.map((rule) => {
        const prop = propMap.get(rule.propertyId);
        if (!prop) {
          return true;
        }
        const val = valMap.get(entry.id)?.get(rule.propertyId);
        return evaluateFilter(
          prop.type,
          val,
          rule.operator,
          rule.value,
          session.user.id
        );
      });
      return filterLogic === "or"
        ? results.some(Boolean)
        : results.every(Boolean);
    });
  }

  // Apply sorts — title sort uses pages.title; property sort uses property_values
  if (sorts.length) {
    filtered.sort((a, b) => {
      for (const rule of sorts) {
        if (rule.propertyId === "__title__") {
          const cmp = (a.title ?? "").localeCompare(b.title ?? "");
          if (cmp !== 0) {
            return rule.direction === "asc" ? cmp : -cmp;
          }
          continue;
        }
        const va = valMap.get(a.id)?.get(rule.propertyId);
        const vb = valMap.get(b.id)?.get(rule.propertyId);
        const prop = propMap.get(rule.propertyId);
        const config = (prop?.config ?? {}) as {
          options?: { id: string; name: string }[];
        };
        const cmp = compareValues(va, vb, prop?.type ?? "text", config.options);
        if (cmp !== 0) {
          return rule.direction === "asc" ? cmp : -cmp;
        }
      }
      return 0;
    });
  }

  const withCommentCounts = filtered.map((e) => ({
    ...e,
    commentCount: commentCountMap.get(e.id) ?? 0,
  }));

  return Response.json({
    entries: withCommentCounts,
    propertyValues: allValues,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: databaseId } = await params;
  const session = await requireSession();

  const [dbPage] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, databaseId), eq(pages.kind, "database")))
    .limit(1);
  if (!dbPage) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, dbPage.workspaceId),
        eq(workspaceMembers.userId, session.user.id)
      )
    )
    .limit(1);
  if (!member || member.role === "viewer") {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    title?: string;
    defaultValues?: Record<string, unknown>;
  };

  const { entry, insertedValues } = await db.transaction(async (tx) => {
    const newEntry = await createPageWithClosure(tx, {
      workspaceId: dbPage.workspaceId,
      title: body.title ?? "",
      kind: "entry",
      databaseId,
      parentId: databaseId,
      createdBy: session.user.id,
    });

    // Index the new entry so it's searchable (and matches the "Entries" type
    // filter) immediately, not only after a manual reindex.
    await upsertPageSearchIndex(tx, {
      id: newEntry.id,
      workspaceId: dbPage.workspaceId,
      title: body.title ?? "",
      kind: "entry",
    });

    // Write default property values — always runs (not just when the caller
    // passed defaultValues), so e.g. a Status property still defaults to
    // "Not started" for a bare "+ New" click, not only for the calendar's
    // date-cell creation flow (the only caller that used to pass anything).
    const props = await tx
      .select()
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, databaseId));

    const valuesToInsert = [];
    for (const prop of props) {
      let rawDefault = body.defaultValues?.[prop.id] ?? prop.defaultValue;
      // Status-style grouped properties have no explicit default, so fall back to the first "todo"-group option; ordinary Select/Multi-select is left untouched.
      const config = prop.config as {
        options?: { id: string; group?: string }[];
        groupedByStatus?: boolean;
      } | null;
      if (
        rawDefault == null &&
        config?.groupedByStatus &&
        (prop.type === "select" ||
          prop.type === "status" ||
          prop.type === "multi_select")
      ) {
        const options = config.options ?? [];
        const first = options.find((o) => o.group === "todo") ?? options[0];
        if (first) {
          rawDefault =
            prop.type === "multi_select"
              ? { optionIds: [first.id] }
              : { optionId: first.id };
        }
      }
      if (rawDefault == null) {
        continue;
      }
      // Resolve @me for Person type
      let resolved = rawDefault;
      if (prop.type === "person" && resolved === "@me") {
        resolved = { userIds: [session.user.id] };
      }
      valuesToInsert.push({
        entryId: newEntry.id,
        propertyId: prop.id,
        value: resolved,
      });
    }
    if (valuesToInsert.length) {
      await tx.insert(propertyValues).values(valuesToInsert);
    }

    return { entry: newEntry, insertedValues: valuesToInsert };
  });

  // Return every value actually written, not just what the caller passed — otherwise server-computed defaults stay invisible until the next refetch.
  return Response.json(
    { ...entry, propertyValues: insertedValues },
    { status: 201 }
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function evaluateFilter(
  type: string,
  val: unknown,
  op: string,
  filterVal: unknown,
  currentUserId: string
): boolean {
  // `{ files: [] }` has one key with an empty array — the generic Object.keys
  // check below would read that as "not empty", so files needs its own
  // array-length check rather than falling through to the generic one.
  if (type === "files") {
    const files = (val as { files?: unknown[] } | null)?.files ?? [];
    if (op === "is_empty") {
      return files.length === 0;
    }
    if (op === "is_not_empty") {
      return files.length > 0;
    }
    return true;
  }

  if (op === "is_empty") {
    return (
      val == null ||
      (typeof val === "object" && !Object.keys(val as object).length)
    );
  }
  if (op === "is_not_empty") {
    return val != null;
  }

  const v = val as Record<string, unknown> | null;

  switch (type) {
    case "text":
    case "url":
    case "email":
    case "phone": {
      const text =
        (
          v as {
            text?: string;
            url?: string;
            email?: string;
            phone?: string;
          } | null
        )?.[type] ?? "";
      const fv = String(filterVal ?? "").toLowerCase();
      const tv = text.toLowerCase();
      if (op === "contains") {
        return tv.includes(fv);
      }
      if (op === "not_contains") {
        return !tv.includes(fv);
      }
      if (op === "is") {
        return tv === fv;
      }
      if (op === "is_not") {
        return tv !== fv;
      }
      if (op === "starts_with") {
        return tv.startsWith(fv);
      }
      if (op === "ends_with") {
        return tv.endsWith(fv);
      }
      break;
    }
    case "number": {
      const n = (v as { number?: number } | null)?.number ?? null;
      const fv = Number(filterVal);
      if (n == null) {
        return false;
      }
      if (op === "=") {
        return n === fv;
      }
      if (op === "!=") {
        return n !== fv;
      }
      if (op === "<") {
        return n < fv;
      }
      if (op === ">") {
        return n > fv;
      }
      if (op === "<=") {
        return n <= fv;
      }
      if (op === ">=") {
        return n >= fv;
      }
      break;
    }
    case "select":
    case "status": {
      // No option chosen ("Any") — the filter row exists but doesn't yet
      // constrain anything, so it shouldn't exclude every row via a literal
      // `optionId === ""` comparison that can never be true.
      if ((op === "is" || op === "is_not") && !filterVal) {
        return true;
      }
      const id = (v as { optionId?: string } | null)?.optionId ?? null;
      if (op === "is") {
        return id === filterVal;
      }
      if (op === "is_not") {
        return id !== filterVal;
      }
      if (op === "is_any_of") {
        return Array.isArray(filterVal) && filterVal.includes(id);
      }
      if (op === "is_none_of") {
        return Array.isArray(filterVal) && !filterVal.includes(id);
      }
      break;
    }
    case "checkbox": {
      const checked = (v as { checked?: boolean } | null)?.checked ?? false;
      if (op === "is_checked") {
        return checked === true;
      }
      if (op === "is_not_checked") {
        return checked !== true;
      }
      break;
    }
    case "date": {
      const date = (v as { date?: string } | null)?.date ?? null;
      if (!date) {
        return false;
      }
      const d = new Date(date).getTime();
      const fv = new Date(String(filterVal)).getTime();
      if (op === "is") {
        return d === fv;
      }
      if (op === "is_before") {
        return d < fv;
      }
      if (op === "is_after") {
        return d > fv;
      }
      break;
    }
    case "person":
    case "created_by": {
      const ids = (v as { userIds?: string[] } | null)?.userIds ?? [];
      // "@me" is the same current-user sentinel entries/route.ts already
      // resolves for a person property's default value on entry creation —
      // reused here so a "My X" view (filterValue: "me" in the template
      // seed) re-evaluates against whoever is actually viewing it.
      const fv = filterVal === "@me" ? currentUserId : String(filterVal ?? "");
      if (op === "is") {
        return ids.includes(fv);
      }
      if (op === "is_not") {
        return !ids.includes(fv);
      }
      break;
    }
  }
  return true;
}

// Pulls the actual sortable key out of a property's stored value shape —
// e.g. a select's value is `{ optionId }`, which sorts by an arbitrary
// generated id unless resolved to the option's label first.
function sortKeyFor(
  value: unknown,
  type: string,
  options?: { id: string; name: string }[]
): string | number | boolean | null {
  if (value == null) {
    return null;
  }
  switch (type) {
    case "number":
      return (value as { number?: number } | null)?.number ?? null;
    case "checkbox":
      return (value as { checked?: boolean } | null)?.checked ?? false;
    case "date":
      return (value as { date?: string } | null)?.date ?? null;
    case "select":
    case "status": {
      const optId = (value as { optionId?: string } | null)?.optionId ?? null;
      if (!optId) {
        return null;
      }
      return options?.find((o) => o.id === optId)?.name ?? optId;
    }
    default:
      return (value as { text?: string } | null)?.text ?? null;
  }
}

function compareValues(
  a: unknown,
  b: unknown,
  type: string,
  options?: { id: string; name: string }[]
): number {
  const ka = sortKeyFor(a, type, options);
  const kb = sortKeyFor(b, type, options);
  if (ka == null && kb == null) {
    return 0;
  }
  if (ka == null) {
    return 1;
  }
  if (kb == null) {
    return -1;
  }
  if (typeof ka === "number" && typeof kb === "number") {
    return ka - kb;
  }
  if (typeof ka === "boolean" && typeof kb === "boolean") {
    return ka === kb ? 0 : ka ? 1 : -1;
  }
  return String(ka).toLowerCase().localeCompare(String(kb).toLowerCase());
}
