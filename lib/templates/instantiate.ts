import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import type { Tx } from "@/lib/db";
import {
  blocks,
  databaseProperties,
  databaseViews,
  pages,
  propertyValues,
} from "@/lib/db/schema";
import { insertPageWithClosure } from "@/lib/pages/closure";

export type SnapshotBlock = {
  id: string;
  type: string;
  content: unknown;
  schema_version?: number;
  order_index: number;
  parent_block_id: string | null;
  children?: SnapshotBlock[];
};

export type SchemaPropOption = { name: string; color: string };
export type SchemaProp = {
  name: string;
  type: string;
  options?: SchemaPropOption[];
  expression?: string;
  voteMode?: boolean;
};
export type SchemaView = {
  name: string;
  type: string;
  isDefault?: boolean;
  groupBy?: string;
  ganttStart?: string;
  ganttEnd?: string;
  filterKey?: string;
  filterValue?: string;
};

export type DatabaseSchema = {
  properties: SchemaProp[];
  views: SchemaView[];
  sample_rows?: Record<string, string | number>[];
};

export type PageSnapshot = {
  title: string;
  icon: string | null;
  cover_url: string | null;
  is_full_width: boolean;
  font_family: string;
  blocks: SnapshotBlock[];
  subpages: { title: string }[];
  database_schema?: DatabaseSchema | null;
};

// Forks a (non-database) template snapshot into real page + block rows —
// shared by the template gallery's "Use template" action and onboarding, so
// a template picked at signup gets the exact same pre-built content as one
// picked from the gallery later.
export async function createPageFromSnapshot(
  tx: Tx,
  params: {
    snapshot: PageSnapshot;
    fallbackTitle: string;
    workspaceId: string;
    parentId: string | null;
    orderIndex: number;
    userId: string;
  }
): Promise<typeof pages.$inferSelect> {
  const { snapshot, fallbackTitle, workspaceId, parentId, orderIndex, userId } =
    params;

  const [page] = await tx
    .insert(pages)
    .values({
      shortId: createId().slice(0, 10),
      workspaceId,
      parentId,
      kind: "page",
      title: snapshot.title || fallbackTitle,
      icon: snapshot.icon ?? null,
      coverUrl: snapshot.cover_url ?? null,
      isFullWidth: snapshot.is_full_width ?? false,
      orderIndex,
      createdBy: userId,
      lastEditedBy: userId,
    })
    .returning();

  await insertPageWithClosure(tx, page.id, parentId);

  async function insertBlocks(
    snapshotBlocks: SnapshotBlock[],
    parentBlockId: string | null
  ) {
    for (const sb of snapshotBlocks) {
      const newBlockId = crypto.randomUUID();
      await tx.insert(blocks).values({
        id: newBlockId,
        pageId: page.id,
        parentBlockId,
        type: sb.type as "paragraph",
        content: sb.content ?? {},
        schemaVersion: sb.schema_version ?? 1,
        orderIndex: sb.order_index,
        createdBy: userId,
      });
      if (sb.children?.length) {
        await insertBlocks(sb.children, newBlockId);
      }
    }
  }

  if (snapshot.blocks?.length) {
    await insertBlocks(snapshot.blocks, null);
  } else {
    await tx.insert(blocks).values({
      pageId: page.id,
      parentBlockId: null,
      type: "paragraph",
      content: { text: [] },
      schemaVersion: 1,
      orderIndex: 0,
      createdBy: userId,
    });
  }

  if (snapshot.subpages?.length) {
    for (let i = 0; i < snapshot.subpages.length; i++) {
      const sub = snapshot.subpages[i];
      const [subPage] = await tx
        .insert(pages)
        .values({
          shortId: createId().slice(0, 10),
          workspaceId,
          parentId: page.id,
          kind: "page",
          title: sub.title || "Untitled",
          orderIndex: i,
          createdBy: userId,
          lastEditedBy: userId,
        })
        .returning();
      await insertPageWithClosure(tx, subPage.id, page.id);
      await tx.insert(blocks).values({
        pageId: subPage.id,
        parentBlockId: null,
        type: "paragraph",
        content: { text: [] },
        schemaVersion: 1,
        orderIndex: 0,
        createdBy: userId,
      });
    }
  }

  return page;
}

// Property types supported by Pagevo's database engine
const SUPPORTED_PROP_TYPES = new Set([
  "text",
  "number",
  "select",
  "multi_select",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "created_by",
  "files",
  "formula",
]);

// Forks a database-template snapshot (properties + views + sample rows) into
// a real database page — shared by the template gallery's "Use template"
// action and onboarding, so a database template picked at signup gets the
// exact same schema and sample data as one picked from the gallery later.
export async function createDatabaseFromSnapshot(
  tx: Tx,
  params: {
    snapshot: PageSnapshot & { database_schema: DatabaseSchema };
    fallbackTitle: string;
    workspaceId: string;
    parentId: string | null;
    orderIndex: number;
    userId: string;
  }
): Promise<typeof pages.$inferSelect> {
  const { snapshot, fallbackTitle, workspaceId, parentId, orderIndex, userId } =
    params;
  const schema = snapshot.database_schema;

  const [dbPage] = await tx
    .insert(pages)
    .values({
      shortId: createId().slice(0, 10),
      workspaceId,
      parentId,
      kind: "database",
      title: snapshot.title || fallbackTitle,
      icon: snapshot.icon ?? null,
      coverUrl: snapshot.cover_url ?? null,
      isFullWidth: snapshot.is_full_width ?? false,
      orderIndex,
      createdBy: userId,
      lastEditedBy: userId,
    })
    .returning();

  await insertPageWithClosure(tx, dbPage.id, parentId);

  // Prepare properties — skip "title" (stored on page) and unsupported types
  let titlePropName: string | undefined;
  const preparedProps: {
    name: string;
    type: string;
    config: Record<string, unknown>;
    orderIdx: number;
    optionMap: Map<string, string>; // option name → UUID
  }[] = [];

  for (const p of schema.properties) {
    if (p.type === "title") {
      titlePropName = p.name;
      continue;
    }
    if (!SUPPORTED_PROP_TYPES.has(p.type)) {
      continue;
    }

    const optionMap = new Map<string, string>();
    let config: Record<string, unknown> = {};

    if (p.type === "select" || p.type === "multi_select") {
      const options = (p.options ?? []).map((opt) => {
        const oid = crypto.randomUUID();
        optionMap.set(opt.name, oid);
        return { id: oid, name: opt.name, color: opt.color ?? "gray" };
      });
      config = { options };
    } else if (p.type === "formula") {
      // Formula refs resolve by name at read time (compute-values.ts), not here, so insertion order doesn't matter.
      config = { expression: p.expression ?? "" };
    } else if (p.type === "person" && p.voteMode) {
      config = { voteMode: true };
    }

    preparedProps.push({
      name: p.name,
      type: p.type,
      config,
      orderIdx: preparedProps.length,
      optionMap,
    });
  }

  // Insert properties → build name → { id, type, optionMap } lookup
  const propLookup = new Map<
    string,
    { id: string; type: string; optionMap: Map<string, string> }
  >();
  for (const prep of preparedProps) {
    const [prop] = await tx
      .insert(databaseProperties)
      .values({
        databaseId: dbPage.id,
        name: prep.name,
        type: prep.type as "text",
        config: prep.config,
        orderIndex: prep.orderIdx,
      })
      .returning();
    propLookup.set(prep.name, {
      id: prop.id,
      type: prep.type,
      optionMap: prep.optionMap,
    });
  }

  // Create views
  let defaultViewId: string | null = null;

  for (let vi = 0; vi < schema.views.length; vi++) {
    const v = schema.views[vi];
    const vtype = (
      ["table", "board", "calendar", "gallery", "gantt"].includes(v.type)
        ? v.type
        : "table"
    ) as "table" | "board" | "calendar" | "gallery" | "gantt";

    let groupByPropertyId: string | null = null;
    let calendarPropertyId: string | null = null;
    let ganttStartPropertyId: string | null = null;
    let ganttEndPropertyId: string | null = null;

    if (vtype === "board" && v.groupBy) {
      groupByPropertyId = propLookup.get(v.groupBy)?.id ?? null;
    }
    if (vtype === "calendar") {
      const dateProp = schema.properties.find((p) => p.type === "date");
      if (dateProp) {
        calendarPropertyId = propLookup.get(dateProp.name)?.id ?? null;
      }
    }
    if (vtype === "gantt") {
      // Explicit template hints take priority; otherwise fall back to the
      // first two Date properties declared, mirroring calendar's
      // "first date property found" heuristic.
      const dateProps = schema.properties.filter((p) => p.type === "date");
      const startName = v.ganttStart ?? dateProps[0]?.name;
      const endName =
        v.ganttEnd ?? dateProps.find((p) => p.name !== startName)?.name;
      if (startName) {
        ganttStartPropertyId = propLookup.get(startName)?.id ?? null;
      }
      if (endName) {
        ganttEndPropertyId = propLookup.get(endName)?.id ?? null;
      }
    }

    // "My X" views (filterKey/filterValue in the seed) resolve here: person/created_by get the "@me" sentinel
    // (same one entries/route.ts uses) so the filter re-evaluates per-viewer; select fields resolve name → generated id.
    let filters: { propertyId: string; operator: string; value: unknown }[] =
      [];
    if (v.filterKey && v.filterValue !== undefined) {
      const targetProp = propLookup.get(v.filterKey);
      if (targetProp?.type === "person" || targetProp?.type === "created_by") {
        if (v.filterValue === "me") {
          filters = [
            { propertyId: targetProp.id, operator: "is", value: "@me" },
          ];
        }
      } else if (
        targetProp?.type === "select" ||
        targetProp?.type === "multi_select"
      ) {
        const optionId = targetProp.optionMap.get(v.filterValue);
        if (optionId) {
          filters = [
            { propertyId: targetProp.id, operator: "is", value: optionId },
          ];
        }
      }
    }

    const [view] = await tx
      .insert(databaseViews)
      .values({
        databaseId: dbPage.id,
        name: v.name,
        type: vtype,
        orderIndex: vi,
        groupByPropertyId,
        calendarPropertyId,
        ganttStartPropertyId,
        ganttEndPropertyId,
        filters,
      })
      .returning();

    if (v.isDefault || vi === 0) {
      defaultViewId = defaultViewId ?? view.id;
    }
  }

  if (defaultViewId) {
    await tx
      .update(pages)
      .set({ defaultViewId })
      .where(eq(pages.id, dbPage.id));
  }

  // Create sample entries
  const titleKey = titlePropName ?? schema.properties[0]?.name ?? "";
  const sampleRows = schema.sample_rows ?? [];

  for (let ri = 0; ri < sampleRows.length; ri++) {
    const row = sampleRows[ri];
    const entryTitle = String(row[titleKey] ?? `Entry ${ri + 1}`);

    const [entry] = await tx
      .insert(pages)
      .values({
        shortId: createId().slice(0, 10),
        workspaceId,
        parentId: dbPage.id,
        databaseId: dbPage.id,
        kind: "entry",
        title: entryTitle,
        orderIndex: ri,
        createdBy: userId,
        lastEditedBy: userId,
      })
      .returning();

    await insertPageWithClosure(tx, entry.id, dbPage.id);

    const valuesToInsert: {
      entryId: string;
      propertyId: string;
      value: unknown;
    }[] = [];

    for (const [
      propName,
      { id: propId, type: propType, optionMap },
    ] of propLookup) {
      const rawVal = row[propName];
      if (rawVal === undefined || rawVal === null || rawVal === "") {
        continue;
      }

      let value: unknown = null;

      switch (propType) {
        case "select": {
          const optId = optionMap.get(String(rawVal));
          if (optId) {
            value = { optionId: optId };
          }
          break;
        }
        case "multi_select": {
          const names = String(rawVal)
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
          const optIds = names
            .map((n) => optionMap.get(n))
            .filter(Boolean) as string[];
          if (optIds.length) {
            value = { optionIds: optIds };
          }
          break;
        }
        case "text":
          value = { text: String(rawVal) };
          break;
        case "number":
          value = { number: Number(rawVal) };
          break;
        case "date":
          value = { date: String(rawVal) };
          break;
        case "checkbox":
          value = { checked: rawVal === 1 || rawVal === "true" };
          break;
        case "email":
          value = { email: String(rawVal) };
          break;
        case "url":
          value = { url: String(rawVal) };
          break;
        case "phone":
          value = { phone: String(rawVal) };
          break;
        // "person" skipped — no real user IDs in template data
      }

      if (value !== null) {
        valuesToInsert.push({ entryId: entry.id, propertyId: propId, value });
      }
    }

    if (valuesToInsert.length > 0) {
      await tx.insert(propertyValues).values(valuesToInsert);
    }
  }

  return dbPage;
}

// Notion's "Start blank" still lands the user on one empty page, not zero
// pages — mirror that instead of leaving a brand-new workspace with nothing
// to open.
export async function createBlankPage(
  tx: Tx,
  params: {
    workspaceId: string;
    parentId: string | null;
    orderIndex: number;
    userId: string;
  }
): Promise<typeof pages.$inferSelect> {
  const { workspaceId, parentId, orderIndex, userId } = params;

  const [page] = await tx
    .insert(pages)
    .values({
      shortId: createId().slice(0, 10),
      workspaceId,
      parentId,
      kind: "page",
      title: "Untitled",
      orderIndex,
      createdBy: userId,
      lastEditedBy: userId,
    })
    .returning();

  await insertPageWithClosure(tx, page.id, parentId);

  await tx.insert(blocks).values({
    pageId: page.id,
    parentBlockId: null,
    type: "paragraph",
    content: { text: [] },
    schemaVersion: 1,
    orderIndex: 0,
    createdBy: userId,
  });

  return page;
}
