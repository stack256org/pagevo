import { createId } from "@paralleldrive/cuid2";
import { and, count, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { databaseProperties, pages, workspaceMembers } from "@/lib/db/schema";

// Mirrors lib/db/schema/types.ts's propertyType Postgres enum — kept in sync
// by hand (no shared import between the two) so an invalid type gets a clean
// 400 here instead of a raw Postgres driver error at insert time.
const VALID_PROPERTY_TYPES = new Set([
  "text",
  "number",
  "select",
  "multi_select",
  "status",
  "date",
  "checkbox",
  "url",
  "email",
  "phone",
  "person",
  "relation",
  "rollup",
  "formula",
  "created_by",
  "files",
]);

// Matches Notion's own default Status options/groups, so a brand-new Status
// property isn't empty — mirrors STATUS_GROUPS in components/database/property-registry.ts.
function defaultStatusOptions() {
  return [
    {
      id: createId(),
      name: "Not started",
      color: "gray",
      group: "todo" as const,
    },
    {
      id: createId(),
      name: "In progress",
      color: "yellow",
      group: "in_progress" as const,
    },
    {
      id: createId(),
      name: "Done",
      color: "green",
      group: "complete" as const,
    },
  ];
}

async function guard(
  databaseId: string,
  userId: string,
  requireEditor = false
) {
  const [page] = await db
    .select()
    .from(pages)
    .where(and(eq(pages.id, databaseId), eq(pages.kind, "database")))
    .limit(1);
  if (!page) {
    return null;
  }
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, page.workspaceId),
        eq(workspaceMembers.userId, userId)
      )
    )
    .limit(1);
  if (!member) {
    return null;
  }
  if (requireEditor && member.role === "viewer") {
    return null;
  }
  return { page, member };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  const props = await db
    .select()
    .from(databaseProperties)
    .where(eq(databaseProperties.databaseId, id))
    .orderBy(databaseProperties.orderIndex);

  return Response.json(props);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await requireSession();
  const guarded = await guard(id, session.user.id, true);
  if (!guarded) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }
  const currentPage = guarded.page;

  // Enforce 50-property limit (system + back-relation don't count)
  const [{ total }] = await db
    .select({ total: count(databaseProperties.id) })
    .from(databaseProperties)
    .where(
      and(
        eq(databaseProperties.databaseId, id),
        eq(databaseProperties.isSystem, false),
        eq(databaseProperties.isBackRelation, false)
      )
    );

  if (Number(total) >= 50) {
    return Response.json(
      { error: "property_limit_exceeded", limit: 50 },
      { status: 400 }
    );
  }

  const body = (await req.json()) as {
    name: string;
    type: string;
    config?: Record<string, unknown>;
    defaultValue?: unknown;
    // Relation-only: also create a matching property on the related database
    // pointing back at this one (Notion's default "two-way" behavior).
    twoWay?: boolean;
  };

  if (!VALID_PROPERTY_TYPES.has(body.type)) {
    return Response.json({ error: "invalid_property_type" }, { status: 400 });
  }

  const [{ maxIdx }] = await db
    .select({ maxIdx: count(databaseProperties.id) })
    .from(databaseProperties)
    .where(eq(databaseProperties.databaseId, id));

  // Status is always grouped by its 3 fixed groups (unlike Select, where
  // grouping is an opt-in config flag) — force it on, and seed the same
  // starter options Notion ships a fresh Status property with, so it isn't
  // empty on first use.
  let config = body.config ?? {};
  if (body.type === "status") {
    config = {
      ...config,
      groupedByStatus: true,
      options: (config.options as unknown[] | undefined)?.length
        ? config.options
        : defaultStatusOptions(),
    };
  }

  // Relation's related database must belong to the SAME workspace as this
  // one — otherwise a crafted request could wire up a relation pointing at a
  // database in a workspace the user has no access to.
  let relatedPage: typeof pages.$inferSelect | null = null;
  if (body.type === "relation") {
    const relatedDatabaseId = config.relatedDatabaseId as string | undefined;
    if (relatedDatabaseId) {
      const [found] = await db
        .select()
        .from(pages)
        .where(and(eq(pages.id, relatedDatabaseId), eq(pages.kind, "database")))
        .limit(1);
      if (!found || found.workspaceId !== currentPage.workspaceId) {
        return Response.json(
          { error: "invalid_related_database" },
          { status: 400 }
        );
      }
      relatedPage = found;
    }
  }

  const [prop] = await db
    .insert(databaseProperties)
    .values({
      databaseId: id,
      name: body.name ?? "Property",
      type: body.type as "text",
      config,
      defaultValue: body.defaultValue ?? null,
      orderIndex: Number(maxIdx),
    })
    .returning();

  // Two-way relation: mirror a back-relation property onto the related database (Notion-style). Back-relations are exempt from the property cap and add-property pickers.
  if (relatedPage && body.twoWay) {
    const [{ maxIdx: relMaxIdx }] = await db
      .select({ maxIdx: count(databaseProperties.id) })
      .from(databaseProperties)
      .where(eq(databaseProperties.databaseId, relatedPage.id));
    await db.insert(databaseProperties).values({
      databaseId: relatedPage.id,
      name: currentPage.title || "Related",
      type: "relation",
      config: { relatedDatabaseId: id },
      isBackRelation: true,
      orderIndex: Number(relMaxIdx),
    });
  }

  return Response.json(prop, { status: 201 });
}
