import { and, eq, lt } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { workspaceMembers } from "@/lib/db/schema";

// Runs daily — removes invitation rows whose inviteExpires has passed
export async function handleExpireInvitations(
  _jobs: Job<Record<string, never>>[]
) {
  await db
    .delete(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.status, "invited"),
        lt(workspaceMembers.inviteExpires, new Date())
      )
    );
}
