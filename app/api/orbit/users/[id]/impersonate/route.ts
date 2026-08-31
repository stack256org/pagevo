import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;

  if (id === admin.user.id) {
    return apiError(400, "Cannot impersonate yourself");
  }

  const [target] = await db
    .select({ id: users.id, email: users.email, banned: users.banned })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);
  if (!target) {
    return apiError(404, "User not found");
  }
  if (target.banned) {
    return apiError(400, "Cannot impersonate a banned user");
  }

  // Better Auth admin plugin handles the 2-hour TTL via impersonationSessionDuration config
  const result = await auth.api.impersonateUser({
    headers: await headers(),
    body: { userId: id },
  });

  await writeAuditLog({
    actorId: admin.user.id,
    action: "session.impersonated",
    targetType: "user",
    targetId: id,
    metadata: { targetEmail: target.email, adminEmail: admin.user.email },
  });

  return NextResponse.json(result);
}
