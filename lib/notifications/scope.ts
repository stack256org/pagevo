import { and, eq, or, type SQL } from "drizzle-orm";
import { notifications } from "@/lib/db/schema";

// Unlike other notification types, "workspace_invite" rows must stay visible
// regardless of which workspace the recipient has open — they aren't a member
// yet, so that workspace's own bell doesn't exist for them to check.
export function notificationScope(
  recipientId: string,
  workspaceId: string
): SQL {
  return and(
    eq(notifications.recipientId, recipientId),
    or(
      eq(notifications.workspaceId, workspaceId),
      eq(notifications.type, "workspace_invite")
    )
  )!;
}
