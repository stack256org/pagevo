import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { templateCategories } from "@/lib/db/schema";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

// GET /api/templates/categories — list template categories (any authenticated user)
export async function GET() {
  try {
    await getSession();

    const list = await db
      .select()
      .from(templateCategories)
      .orderBy(asc(templateCategories.orderIndex));

    return Response.json(list);
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    return apiError(500, "Internal server error");
  }
}
