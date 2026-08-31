import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { templates } from "@/lib/db/schema";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(1000).nullable().optional(),
});

// PATCH /api/workspaces/:id/templates/:templateId
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: workspaceId, templateId } = await params;
    const session = await getSession();
    const member = await requireWorkspaceMember(
      workspaceId,
      session.user.id,
      "editor"
    );

    const [tpl] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, templateId),
          eq(templates.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!tpl) {
      return apiError(404, "Template not found");
    }

    // Only creator or workspace admin can edit
    const isCreator = tpl.createdBy === session.user.id;
    const isAdmin = member.role === "admin";
    if (!isCreator && !isAdmin) {
      return apiError(403, "Forbidden");
    }

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const updates: Partial<typeof tpl> = {};
    if (parsed.data.name !== undefined) {
      updates.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      updates.description = parsed.data.description;
    }

    const [updated] = await db
      .update(templates)
      .set(updates)
      .where(eq(templates.id, templateId))
      .returning();

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/workspaces/:id/templates/:templateId
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; templateId: string }> }
) {
  try {
    const { id: workspaceId, templateId } = await params;
    const session = await getSession();
    const member = await requireWorkspaceMember(
      workspaceId,
      session.user.id,
      "editor"
    );

    const [tpl] = await db
      .select()
      .from(templates)
      .where(
        and(
          eq(templates.id, templateId),
          eq(templates.workspaceId, workspaceId)
        )
      )
      .limit(1);
    if (!tpl) {
      return apiError(404, "Template not found");
    }

    const isCreator = tpl.createdBy === session.user.id;
    const isAdmin = member.role === "admin";
    if (!isCreator && !isAdmin) {
      return apiError(403, "Forbidden");
    }

    await db.delete(templates).where(eq(templates.id, templateId));
    return Response.json({ deleted: templateId });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
