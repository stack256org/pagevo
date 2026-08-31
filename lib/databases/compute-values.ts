import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { databaseProperties, propertyValues, users } from "@/lib/db/schema";
import {
  evaluateFormulaValue,
  FormulaEvalError,
  type FormulaValue,
  runFormula,
} from "@/lib/formula";

// Only the fields actually used — callers pass either a full `pages` row or a
// narrower column-restricted select.
type EntryForCreatedBy = { id: string; createdBy: string | null };

// Rollup/Formula/Created-by are never stored in `property_values` — computed here
// on every read so the API route and server-rendered page load agree on values.

export type ComputedValue = {
  propertyId: string;
  entryId: string;
  value:
    | { display: string | null }
    | {
        userIds: string[];
        _members: { id: string; name: string; email: string }[];
      };
};

// Must agree with client-side hasDisplayValue() (board-view.tsx etc.) or
// "count values" would disagree with what a user sees filled in.
function hasRollupValue(raw: unknown): boolean {
  if (raw == null) {
    return false;
  }
  if (typeof raw !== "object") {
    return true;
  }
  return Object.values(raw as Record<string, unknown>).some((x) => {
    if (x == null || x === "" || x === false) {
      return false;
    }
    if (Array.isArray(x)) {
      return x.length > 0;
    }
    return true;
  });
}

function extractNumeric(targetType: string, raw: unknown): number | null {
  if (targetType !== "number") {
    return null;
  }
  const n = (raw as { number?: number | null } | null)?.number;
  return typeof n === "number" ? n : null;
}

function extractDateMs(targetType: string, raw: unknown): number | null {
  if (targetType !== "date") {
    return null;
  }
  const d = (raw as { date?: string | null } | null)?.date;
  if (!d) {
    return null;
  }
  const ms = new Date(d).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function formatRollup(
  aggregation: string,
  relatedIds: string[],
  targetType: string,
  targetValues: Map<string, unknown>
): string {
  if (aggregation === "count") {
    return String(relatedIds.length);
  }

  const rawValues = relatedIds.map((id) => targetValues.get(id) ?? null);
  if (aggregation === "count_values") {
    return String(rawValues.filter(hasRollupValue).length);
  }

  if (targetType === "number") {
    const nums = rawValues
      .map((v) => extractNumeric(targetType, v))
      .filter((n): n is number => n != null);
    if (!nums.length) {
      return "";
    }
    if (aggregation === "sum") {
      return String(nums.reduce((a, b) => a + b, 0));
    }
    if (aggregation === "average") {
      return String(
        Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100
      );
    }
    if (aggregation === "min") {
      return String(Math.min(...nums));
    }
    if (aggregation === "max") {
      return String(Math.max(...nums));
    }
    if (aggregation === "range") {
      return String(Math.max(...nums) - Math.min(...nums));
    }
  }

  if (targetType === "date") {
    const dates = rawValues
      .map((v) => extractDateMs(targetType, v))
      .filter((n): n is number => n != null);
    if (!dates.length) {
      return "";
    }
    if (aggregation === "earliest") {
      return new Date(Math.min(...dates)).toLocaleDateString();
    }
    if (aggregation === "latest") {
      return new Date(Math.max(...dates)).toLocaleDateString();
    }
  }

  return "";
}

// Computed on every read (no cache/invalidation) — fine at this app's scale,
// revisit if that stops being true.
async function computeRollupValues(
  properties: (typeof databaseProperties.$inferSelect)[],
  valMap: Map<string, Map<string, unknown>>,
  entryIds: string[]
): Promise<
  { propertyId: string; entryId: string; value: { display: string | null } }[]
> {
  const rollupProps = properties.filter((p) => p.type === "rollup");
  if (!rollupProps.length) {
    return [];
  }

  // Batch-fetch every target property's row once (they live on OTHER
  // databases — the relation's related database — so they're not in
  // `properties`, which only covers this database).
  const targetPropertyIds = [
    ...new Set(
      rollupProps
        .map(
          (p) =>
            (p.config as { targetPropertyId?: string } | null)?.targetPropertyId
        )
        .filter((id): id is string => !!id)
    ),
  ];
  const targetProps = targetPropertyIds.length
    ? await db
        .select()
        .from(databaseProperties)
        .where(inArray(databaseProperties.id, targetPropertyIds))
    : [];
  const targetPropMap = new Map(targetProps.map((p) => [p.id, p]));

  const results: {
    propertyId: string;
    entryId: string;
    value: { display: string | null };
  }[] = [];

  for (const rollupProp of rollupProps) {
    const config = rollupProp.config as {
      relationPropertyId?: string;
      targetPropertyId?: string;
      aggregation?: string;
    } | null;
    const relationPropertyId = config?.relationPropertyId;
    const targetPropertyId = config?.targetPropertyId;
    const aggregation = config?.aggregation ?? "count";
    const targetProp = targetPropertyId
      ? targetPropMap.get(targetPropertyId)
      : undefined;
    if (!relationPropertyId || !targetPropertyId || !targetProp) {
      continue;
    }

    // Every entry id this database's entries reference through the relation,
    // collected once so the target-value fetch below is a single query
    // regardless of how many entries this database has.
    const allRelatedIds = new Set<string>();
    for (const propVals of valMap.values()) {
      const relVal = propVals.get(relationPropertyId) as {
        entryIds?: string[];
      } | null;
      for (const relId of relVal?.entryIds ?? []) {
        allRelatedIds.add(relId);
      }
    }

    let targetValues = new Map<string, unknown>();
    if (allRelatedIds.size) {
      const rows = await db
        .select()
        .from(propertyValues)
        .where(
          and(
            inArray(propertyValues.entryId, [...allRelatedIds]),
            eq(propertyValues.propertyId, targetPropertyId)
          )
        );
      targetValues = new Map(rows.map((r) => [r.entryId, r.value]));
    }

    // Every entry, not just ones with a valMap entry — an entry with zero
    // saved property values (a brand-new row) still has a real rollup result
    // (e.g. "Count all" is 0, not absent).
    for (const entryId of entryIds) {
      const relVal = valMap.get(entryId)?.get(relationPropertyId) as {
        entryIds?: string[];
      } | null;
      const relatedIds = relVal?.entryIds ?? [];
      const display = formatRollup(
        aggregation,
        relatedIds,
        targetProp.type,
        targetValues
      );
      results.push({
        propertyId: rollupProp.id,
        entryId,
        value: { display: display || null },
      });
    }
  }

  return results;
}

// Shaped like a Person value so it reuses Person's display/formula handling.
// Never stored, so adding this property later needs no backfill.
async function computeCreatedByValues(
  properties: (typeof databaseProperties.$inferSelect)[],
  entries: EntryForCreatedBy[]
): Promise<
  {
    propertyId: string;
    entryId: string;
    value: {
      userIds: string[];
      _members: { id: string; name: string; email: string }[];
    };
  }[]
> {
  const createdByProps = properties.filter((p) => p.type === "created_by");
  if (!createdByProps.length) {
    return [];
  }

  const creatorIds = [
    ...new Set(
      entries.map((e) => e.createdBy).filter((id): id is string => !!id)
    ),
  ];
  const creators = creatorIds.length
    ? await db
        .select({ id: users.id, name: users.name, email: users.email })
        .from(users)
        .where(inArray(users.id, creatorIds))
    : [];
  const creatorMap = new Map(creators.map((u) => [u.id, u]));

  const results: {
    propertyId: string;
    entryId: string;
    value: {
      userIds: string[];
      _members: { id: string; name: string; email: string }[];
    };
  }[] = [];
  for (const prop of createdByProps) {
    for (const entry of entries) {
      const creator = entry.createdBy
        ? creatorMap.get(entry.createdBy)
        : undefined;
      const userIds = entry.createdBy ? [entry.createdBy] : [];
      const _members = creator
        ? [
            {
              id: creator.id,
              name: creator.name ?? "",
              email: creator.email ?? "",
            },
          ]
        : [];
      results.push({
        propertyId: prop.id,
        entryId: entry.id,
        value: { userIds, _members },
      });
    }
  }
  return results;
}

// Converts a property's raw JSONB value into the native type a formula
// expression operates on. select/status/multi_select resolve to their
// option NAME(s), not the stored id, matching what a formula author actually
// sees and types (`prop("Priority") == "High"`, not an opaque id).
function rawToFormulaValue(
  prop: typeof databaseProperties.$inferSelect,
  raw: unknown
): FormulaValue {
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
      const options =
        (prop.config as { options?: { id: string; name: string }[] } | null)
          ?.options ?? [];
      return options.find((o) => o.id === optId)?.name ?? null;
    }
    case "multi_select": {
      const ids = (v?.optionIds as string[] | undefined) ?? [];
      const options =
        (prop.config as { options?: { id: string; name: string }[] } | null)
          ?.options ?? [];
      return (
        ids
          .map((id) => options.find((o) => o.id === id)?.name)
          .filter(Boolean)
          .join(", ") || null
      );
    }
    case "person":
    case "created_by": {
      const members =
        (v?._members as { name?: string; email?: string }[] | undefined) ?? [];
      return (
        members
          .map((m) => m.name || m.email)
          .filter(Boolean)
          .join(", ") || null
      );
    }
    case "relation": {
      const ids = (v?.entryIds as string[] | undefined) ?? [];
      return ids.length;
    }
    case "rollup":
      // Already computed and merged into valMap before formulas run.
      return (v?.display as string | null | undefined) ?? null;
    default:
      return null;
  }
}

// How many items a list-valued property holds — what count(prop("Name"))
// resolves to. Unlike rawToFormulaValue, this never recurses into a
// referenced Formula property: a formula's own output is always a scalar
// (see FormulaValue), so there's no list left to count once one's involved.
function rawToCount(
  prop: typeof databaseProperties.$inferSelect,
  raw: unknown
): number {
  const v = raw as Record<string, unknown> | null;
  switch (prop.type) {
    case "person":
    case "created_by":
      return ((v?._members as unknown[] | undefined) ?? []).length;
    case "multi_select":
      return ((v?.optionIds as unknown[] | undefined) ?? []).length;
    case "relation":
      return ((v?.entryIds as unknown[] | undefined) ?? []).length;
    default:
      throw new FormulaEvalError(
        `count() doesn't work on "${prop.name}" — only Person, Multi-select, and Relation properties have a count.`
      );
  }
}

// `visiting` guards against a formula referencing itself (directly or via a
// cycle through other formulas) — without it, two formulas that reference
// each other would recurse until the stack overflows instead of failing with
// a clear "Circular reference" error.
function makeFormulaResolvers(
  entryId: string,
  properties: (typeof databaseProperties.$inferSelect)[],
  valMap: Map<string, Map<string, unknown>>,
  visiting: Set<string>
): {
  resolveProp: (name: string) => FormulaValue;
  resolveCount: (name: string) => number;
} {
  function resolveProp(name: string): FormulaValue {
    const prop = properties.find((p) => p.name === name);
    if (!prop) {
      throw new FormulaEvalError(`Unknown property "${name}"`);
    }

    if (prop.type === "formula") {
      if (visiting.has(prop.id)) {
        throw new FormulaEvalError(`Circular reference through "${name}"`);
      }
      const expression =
        (prop.config as { expression?: string } | null)?.expression ?? "";
      visiting.add(prop.id);
      try {
        const { value, error } = evaluateFormulaValue(
          expression,
          makeFormulaResolvers(entryId, properties, valMap, visiting)
        );
        if (error) {
          throw new FormulaEvalError(error);
        }
        return value;
      } finally {
        visiting.delete(prop.id);
      }
    }

    const raw = valMap.get(entryId)?.get(prop.id) ?? null;
    return rawToFormulaValue(prop, raw);
  }

  function resolveCount(name: string): number {
    const prop = properties.find((p) => p.name === name);
    if (!prop) {
      throw new FormulaEvalError(`Unknown property "${name}"`);
    }
    const raw = valMap.get(entryId)?.get(prop.id) ?? null;
    return rawToCount(prop, raw);
  }

  return { resolveProp, resolveCount };
}

function computeFormulaValues(
  properties: (typeof databaseProperties.$inferSelect)[],
  valMap: Map<string, Map<string, unknown>>,
  entryIds: string[]
): {
  propertyId: string;
  entryId: string;
  value: { display: string | null };
}[] {
  const formulaProps = properties.filter((p) => p.type === "formula");
  if (!formulaProps.length) {
    return [];
  }

  const results: {
    propertyId: string;
    entryId: string;
    value: { display: string | null };
  }[] = [];
  for (const fp of formulaProps) {
    const expression =
      (fp.config as { expression?: string } | null)?.expression ?? "";
    for (const entryId of entryIds) {
      const { display, error } = runFormula(
        expression,
        makeFormulaResolvers(entryId, properties, valMap, new Set([fp.id]))
      );
      results.push({
        propertyId: fp.id,
        entryId,
        value: { display: error ? null : display },
      });
    }
  }
  return results;
}

// Computes Rollup, Created-by, and Formula values (in that dependency order —
// a Formula can reference either of the other two) and merges each into
// `valMap` as it goes, so a later stage sees an earlier stage's results.
// Returns the flat list every caller appends to its own `values` array.
export async function computeDerivedValues(
  properties: (typeof databaseProperties.$inferSelect)[],
  entries: EntryForCreatedBy[],
  valMap: Map<string, Map<string, unknown>>
): Promise<ComputedValue[]> {
  const entryIds = entries.map((e) => e.id);

  const rollupValues = await computeRollupValues(properties, valMap, entryIds);
  for (const rv of rollupValues) {
    if (!valMap.has(rv.entryId)) {
      valMap.set(rv.entryId, new Map());
    }
    valMap.get(rv.entryId)!.set(rv.propertyId, rv.value);
  }

  const createdByValues = await computeCreatedByValues(properties, entries);
  for (const cv of createdByValues) {
    if (!valMap.has(cv.entryId)) {
      valMap.set(cv.entryId, new Map());
    }
    valMap.get(cv.entryId)!.set(cv.propertyId, cv.value);
  }

  const formulaValues = computeFormulaValues(properties, valMap, entryIds);
  for (const fv of formulaValues) {
    if (!valMap.has(fv.entryId)) {
      valMap.set(fv.entryId, new Map());
    }
    valMap.get(fv.entryId)!.set(fv.propertyId, fv.value);
  }

  return [...rollupValues, ...createdByValues, ...formulaValues];
}
