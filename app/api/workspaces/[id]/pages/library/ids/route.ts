import { getAllLibraryPageIds } from "@/lib/pages/library";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/pages/library/ids?tab=&search=
// Every page id matching the current tab/search, unpaginated — backs
// Library's "select all" checkbox, which needs to select every matching
// page rather than just whatever's loaded for the current page-size window.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id);

    const { searchParams } = new URL(req.url);
    const ids = await getAllLibraryPageIds(workspaceId, session.user.id, {
      tab: searchParams.get("tab"),
      search: searchParams.get("search") ?? "",
    });

    return Response.json({ ids });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[library/ids]", err);
    return apiError(500, "Internal server error");
  }
}
