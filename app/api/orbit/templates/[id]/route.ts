import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { templateCategories, templates, users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
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
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
  categoryId: z.string().uuid().optional(),
  pageSnapshot: z.unknown().optional(),
});

// GET /api/orbit/templates/:id
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [tpl] = await db
    .select()
    .from(templates)
    .where(
      and(
        eq(templates.id, id),
        eq(templates.isBuiltIn, true),
        isNull(templates.workspaceId)
      )
    )
    .limit(1);

  if (!tpl) {
    return apiError(404, "Template not found");
  }
  return Response.json(tpl);
}

// PATCH /api/orbit/templates/:id
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [tpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.isBuiltIn, true)))
    .limit(1);
  if (!tpl) {
    return apiError(404, "Template not found");
  }

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.categoryId !== undefined) {
    const [cat] = await db
      .select({ id: templateCategories.id })
      .from(templateCategories)
      .where(eq(templateCategories.id, parsed.data.categoryId))
      .limit(1);
    if (!cat) {
      return apiError(400, "Unknown category");
    }
  }

  const updates: Record<string, unknown> = {};
  if (parsed.data.name !== undefined) {
    updates.name = parsed.data.name;
  }
  if (parsed.data.description !== undefined) {
    updates.description = parsed.data.description;
  }
  if (parsed.data.categoryId !== undefined) {
    updates.categoryId = parsed.data.categoryId;
  }
  if (parsed.data.pageSnapshot !== undefined) {
    updates.pageSnapshot = parsed.data.pageSnapshot;
  }

  const [updated] = await db
    .update(templates)
    .set(updates)
    .where(eq(templates.id, id))
    .returning();

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.updated",
    targetType: "template",
    targetId: id,
    metadata: { name: updated!.name, fields: Object.keys(updates) },
  });

  return Response.json(updated);
}

// DELETE /api/orbit/templates/:id
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requirePlatformAdmin();
  if (!session) {
    return apiError(403, "Forbidden");
  }

  const { id } = await params;
  const [tpl] = await db
    .select()
    .from(templates)
    .where(and(eq(templates.id, id), eq(templates.isBuiltIn, true)))
    .limit(1);
  if (!tpl) {
    return apiError(404, "Template not found");
  }

  await db.delete(templates).where(eq(templates.id, id));

  await writeAuditLog({
    actorId: session.user.id,
    action: "template.deleted",
    targetType: "template",
    targetId: id,
    metadata: { name: tpl.name },
  });

  return Response.json({ deleted: id });
}
