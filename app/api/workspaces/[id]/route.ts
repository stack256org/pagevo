import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { workspaceSlugRedirects, workspaces } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import {
  ApiError,
  apiError,
  getSession,
  getWorkspace,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id);
    const workspace = await getWorkspace(id);
    return Response.json(workspace);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  icon: z.string().max(256).nullable().optional(),
  slug: z
    .string()
    .min(1)
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug may only contain lowercase letters, numbers, and hyphens"
    )
    .optional(),
  defaultPageAccess: z
    .enum(["private", "can_view", "can_comment", "can_edit", "full_access"])
    .optional(),
});

// PATCH /api/workspaces/:id
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { name, icon, slug, defaultPageAccess } = parsed.data;

    // Slug change: insert redirect row BEFORE updating slug, in same transaction
    const workspace = await db.transaction(async (tx) => {
      if (slug !== undefined) {
        const current = await getWorkspace(id);
        if (current.slug !== slug) {
          // Check uniqueness
          const [existing] = await tx
            .select({ id: workspaces.id })
            .from(workspaces)
            .where(and(eq(workspaces.slug, slug), ne(workspaces.id, id)))
            .limit(1);
          if (existing) {
            throw new ApiError(409, "Slug is already taken");
          }

          await tx
            .insert(workspaceSlugRedirects)
            .values({
              workspaceId: id,
              oldSlug: current.slug,
            })
            .onConflictDoNothing();
        }
      }

      const [updated] = await tx
        .update(workspaces)
        .set({
          ...(name !== undefined && { name }),
          ...(icon !== undefined && { icon }),
          ...(slug !== undefined && { slug }),
          ...(defaultPageAccess !== undefined && { defaultPageAccess }),
          updatedAt: new Date(),
        })
        .where(eq(workspaces.id, id))
        .returning();

      return updated;
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "workspace.updated",
      targetType: "workspace",
      targetId: id,
      metadata: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
        ...(defaultPageAccess !== undefined && { defaultPageAccess }),
      },
    });

    return Response.json(workspace);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

// DELETE /api/workspaces/:id
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();
    await requireWorkspaceMember(id, session.user.id, "admin");

    const workspace = await getWorkspace(id);
    await db.delete(workspaces).where(eq(workspaces.id, id));

    await writeAuditLog({
      actorId: session.user.id,
      action: "workspace.deleted",
      targetType: "workspace",
      targetId: id,
      metadata: { name: workspace.name, slug: workspace.slug },
    });

    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
