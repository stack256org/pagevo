import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  workspaceMembers,
  workspaceStorageUsage,
  workspaces,
} from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import {
  ApiError,
  apiError,
  getSession,
  uniqueSlug,
} from "@/lib/workspaces/auth";

// GET /api/workspaces — list all workspaces the current user is an active member of
export async function GET() {
  try {
    const session = await getSession();

    const memberships = await db
      .select({
        workspace: workspaces,
        role: workspaceMembers.role,
        joinedAt: workspaceMembers.joinedAt,
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(
        and(
          eq(workspaceMembers.userId, session.user.id),
          eq(workspaceMembers.status, "active")
        )
      );

    return Response.json(
      memberships.map((m) => ({
        ...m.workspace,
        role: m.role,
        joinedAt: m.joinedAt,
      }))
    );
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const createSchema = z.object({
  name: z.string().min(1).max(100),
  icon: z.string().max(256).optional(),
});

// POST /api/workspaces — create a new workspace (caller becomes Admin)
export async function POST(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { name, icon } = parsed.data;
    const slug = await uniqueSlug(name);

    const workspace = await db.transaction(async (tx) => {
      const [ws] = await tx
        .insert(workspaces)
        .values({
          name,
          slug,
          icon: icon ?? null,
          createdBy: session.user.id,
        })
        .returning();

      // Mandatory: storage usage row in same tx (Phase 7 file uploads will require it)
      await tx.insert(workspaceStorageUsage).values({ workspaceId: ws.id });

      // Creator is automatically Admin
      await tx.insert(workspaceMembers).values({
        workspaceId: ws.id,
        userId: session.user.id,
        role: "admin",
        status: "active",
        joinedAt: new Date(),
      });

      return ws;
    });

    await writeAuditLog({
      actorId: session.user.id,
      action: "workspace.created",
      targetType: "workspace",
      targetId: workspace.id,
      metadata: { name: workspace.name, slug: workspace.slug },
    });

    return Response.json(workspace, { status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
