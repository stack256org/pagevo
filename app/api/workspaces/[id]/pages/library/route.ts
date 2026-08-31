import { getLibraryPage } from "@/lib/pages/library";
import {
  ApiError,
  apiError,
  getSession,
  requireWorkspaceMember,
} from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/workspaces/:id/pages/library?tab=&search=&page=&pageSize=
// Backs the Library table's tab switches, search, page-size changes, and
// page navigation — each is a real paginated query (see lib/pages/library.ts),
// not a re-fetch of the whole workspace.
export async function GET(req: Request, { params }: Ctx) {
  try {
    const { id: workspaceId } = await params;
    const session = await getSession();
    await requireWorkspaceMember(workspaceId, session.user.id);

    const { searchParams } = new URL(req.url);
    const result = await getLibraryPage(workspaceId, session.user.id, {
      tab: searchParams.get("tab"),
      search: searchParams.get("search") ?? "",
      page: Number.parseInt(searchParams.get("page") ?? "1", 10),
      pageSize: Number.parseInt(searchParams.get("pageSize") ?? "", 10),
    });

    return Response.json(result);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error("[library]", err);
    return apiError(500, "Internal server error");
  }
}
