import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { userPreferences } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

// GET /api/user/preferences — returns current user's sidebar preferences, creating a row if none exists
export async function GET() {
  try {
    const session = await getSession();

    const [existing] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, session.user.id))
      .limit(1);

    if (existing) {
      return Response.json(existing);
    }

    const [created] = await db
      .insert(userPreferences)
      .values({ userId: session.user.id })
      .returning();

    return Response.json(created);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}

const patchSchema = z.object({
  sidebarWidth: z.number().int().min(300).max(480).optional(),
  sidebarCollapsed: z.boolean().optional(),
  lastWorkspaceId: z.string().uuid().nullable().optional(),
});

// PATCH /api/user/preferences — update sidebar width, collapsed state, or last workspace
export async function PATCH(req: Request) {
  try {
    const session = await getSession();

    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    const { sidebarWidth, sidebarCollapsed, lastWorkspaceId } = parsed.data;

    const [updated] = await db
      .insert(userPreferences)
      .values({
        userId: session.user.id,
        ...(sidebarWidth !== undefined && { sidebarWidth }),
        ...(sidebarCollapsed !== undefined && { sidebarCollapsed }),
        ...(lastWorkspaceId !== undefined && { lastWorkspaceId }),
      })
      .onConflictDoUpdate({
        target: userPreferences.userId,
        set: {
          ...(sidebarWidth !== undefined && { sidebarWidth }),
          ...(sidebarCollapsed !== undefined && { sidebarCollapsed }),
          ...(lastWorkspaceId !== undefined && { lastWorkspaceId }),
          updatedAt: new Date(),
        },
      })
      .returning();

    return Response.json(updated);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
