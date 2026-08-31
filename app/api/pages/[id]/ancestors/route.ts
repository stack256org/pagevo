import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { pages, workspaces } from "@/lib/db/schema";
import { getPageAncestors } from "@/lib/pages/ancestors";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/pages/:id/ancestors — workspace + root → self chain for the Breadcrumb block; workspace is included separately so a parentless page still gets 2 crumbs.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const { id } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId })
      .from(pages)
      .where(eq(pages.id, id))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requireWorkspaceMember(page.workspaceId, session.user.id);

    const [workspace] = await db
      .select({
        slug: workspaces.slug,
        name: workspaces.name,
        icon: workspaces.icon,
      })
      .from(workspaces)
      .where(eq(workspaces.id, page.workspaceId))
      .limit(1);

    const ancestors = await getPageAncestors(id);
    return Response.json({ workspace, ancestors });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
