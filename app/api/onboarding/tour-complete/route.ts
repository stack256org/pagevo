import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

export async function POST() {
  try {
    const session = await getSession();
    await db
      .update(users)
      .set({ tourCompleted: true })
      .where(eq(users.id, session.user.id));
    return new Response(null, { status: 204 });
  } catch {
    return apiError(401, "Unauthorized");
  }
}
