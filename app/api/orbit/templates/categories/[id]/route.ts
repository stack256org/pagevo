import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templateCategories, templates, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { CATEGORY_ICON_NAMES } from "@/lib/orbit/category-icons";
import { apiError } from "@/lib/workspaces/auth";

async function requirePlatformAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    return null;
  }
  const [user] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (user?.role !== "admin") {
    return null;
  }
  return session;
}

const patchSchema = z.object({
  label: z.string().min(1).max(60).optional(),
  icon: z.enum(CATEGORY_ICON_NAMES as [string, ...string[]]).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

// PATCH /api/orbit/templates/categories/:id — rename or reorder a category
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [cat] = await db
    .select()
    .from(templateCategories)
    .where(eq(templateCategories.id, id))
    .limit(1);
  if (!cat) {
    return apiError(404, "Category not found");
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.label !== undefined) {
    updates.label = parsed.data.label;
  }
  if (parsed.data.icon !== undefined) {
    updates.icon = parsed.data.icon;
  }
  if (parsed.data.orderIndex !== undefined) {
    updates.orderIndex = parsed.data.orderIndex;
  }
  if (Object.keys(updates).length === 0) {
    return apiError(400, "No fields to update");
  }

  const [updated] = await db
    .update(templateCategories)
    .set(updates)
    .where(eq(templateCategories.id, id))
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template_category.updated",
    targetType: "template",
    targetId: id,
    metadata: { fields: Object.keys(updates) },
  });

  return Response.json(updated);
}

// DELETE /api/orbit/templates/categories/:id — delete a category (must be unused)
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [cat] = await db
    .select()
    .from(templateCategories)
    .where(eq(templateCategories.id, id))
    .limit(1);
  if (!cat) {
    return apiError(404, "Category not found");
  }

  const [inUse] = await db
    .select({ id: templates.id })
    .from(templates)
    .where(eq(templates.categoryId, id))
    .limit(1);
  if (inUse) {
    return apiError(400, "Category is in use by one or more templates");
  }

  await db.delete(templateCategories).where(eq(templateCategories.id, id));

  await writeAuditLog({
    actorId: session.user.id,
    action: "template_category.deleted",
    targetType: "template",
    targetId: id,
    metadata: { key: cat.key, label: cat.label },
  });

  return Response.json({ deleted: id });
}
