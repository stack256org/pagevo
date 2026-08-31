import { db } from "@/lib/db";
import { userHintStates } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    const { hintKey } = (await req.json()) as { hintKey: string };

    if (!hintKey || typeof hintKey !== "string") {
      return apiError(400, "hintKey required");
    }

    await db
      .insert(userHintStates)
      .values({ userId: session.user.id, hintKey })
      .onConflictDoNothing();

    return new Response(null, { status: 204 });
  } catch {
    return apiError(401, "Unauthorized");
  }
}
