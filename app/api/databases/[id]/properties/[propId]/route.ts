import { and, eq } from "drizzle-orm";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  databaseProperties,
  databaseViews,
  pages,
  propertyValues,
  workspaceMembers,
} from "@/lib/db/schema";

// Mirrors lib/db/schema/types.ts's propertyType Postgres enum — see the same
// constant in ../route.ts for why this is duplicated rather than shared.
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

async function guard(databaseId: string, userId: string) {
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
  if (!member || member.role === "viewer") {
    return null;
  }
  return { page, member };
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; propId: string }> }
) {
  const { id, propId } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    name?: string;
    type?: string;
    config?: Record<string, unknown>;
    defaultValue?: unknown;
    confirmDestructive?: boolean;
  };

  if (body.type != null && !VALID_PROPERTY_TYPES.has(body.type)) {
    return Response.json({ error: "invalid_property_type" }, { status: 400 });
  }

  const [existing] = await db
    .select()
    .from(databaseProperties)
    .where(eq(databaseProperties.id, propId))
    .limit(1);
  if (!existing || existing.databaseId !== id) {
    return Response.json({ error: "not_found" }, { status: 404 });
  }

  // These target types can't reinterpret existing values (relation/person) or never read property_values at all (formula/rollup/created_by) — existing data would become unreachable.
  const destructiveTypes = [
    "relation",
    "person",
    "formula",
    "rollup",
    "created_by",
  ];
  if (
    body.type &&
    body.type !== existing.type &&
    destructiveTypes.includes(body.type) &&
    !body.confirmDestructive
  ) {
    const [{ affectedValueCount }] = await db
      .select({
        affectedValueCount: db.$count(
          propertyValues,
          eq(propertyValues.propertyId, propId)
        ),
      })
      .from(propertyValues)
      .where(eq(propertyValues.propertyId, propId))
      .limit(1);
    if (Number(affectedValueCount) > 0) {
      return Response.json(
        { error: "destructive_conversion", affectedValueCount },
        { status: 400 }
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (body.name != null) {
    patch.name = body.name;
  }
  if (body.type != null) {
    patch.type = body.type;
  }
  if (body.config != null) {
    patch.config = body.config;
  }
  if ("defaultValue" in body) {
    patch.defaultValue = body.defaultValue;
  }

  // If type changed with confirmDestructive, clear existing values first
  if (body.type && body.type !== existing.type && body.confirmDestructive) {
    await db
      .delete(propertyValues)
      .where(eq(propertyValues.propertyId, propId));
  }

  const [prop] = await db
    .update(databaseProperties)
    .set(patch)
    .where(eq(databaseProperties.id, propId))
    .returning();
  return Response.json(prop);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; propId: string }> }
) {
  const { id, propId } = await params;
  const session = await requireSession();
  if (!(await guard(id, session.user.id))) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  // Check if this property is used as Board grouping
  const views = await db
    .select()
    .from(databaseViews)
    .where(eq(databaseViews.databaseId, id));
  const inUse = views.some((v) => v.groupByPropertyId === propId);
  if (inUse) {
    return Response.json(
      { error: "property_in_use_as_grouping" },
      { status: 400 }
    );
  }

  // Remove from sorts/filters in all views atomically
  for (const view of views) {
    const sorts = (view.sorts as { propertyId: string }[]).filter(
      (s) => s.propertyId !== propId
    );
    const filters = (view.filters as { propertyId: string }[]).filter(
      (f) => f.propertyId !== propId
    );
    if (
      sorts.length !== (view.sorts as unknown[]).length ||
      filters.length !== (view.filters as unknown[]).length
    ) {
      await db
        .update(databaseViews)
        .set({ sorts, filters })
        .where(eq(databaseViews.id, view.id));
    }
  }

  await db.delete(databaseProperties).where(eq(databaseProperties.id, propId));
  return new Response(null, { status: 204 });
}
