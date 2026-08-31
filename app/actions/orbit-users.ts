"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { ADMIN_ROLE, USER_ROLE } from "@/config/platform";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function setUserRoleAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? USER_ROLE);

  if (![ADMIN_ROLE, USER_ROLE].includes(role)) {
    return;
  }
  if (userId === admin.user.id && role !== ADMIN_ROLE) {
    return;
  }

  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId));

  revalidatePath("/orbit/users");
}

export async function toggleUserBanAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const banned = String(formData.get("banned") ?? "false") === "true";

  if (userId === admin.user.id && banned) {
    return;
  }

  await db
    .update(users)
    .set({
      bannedReason: banned ? "Disabled by Orbit admin" : null,
      banned,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  revalidatePath("/orbit/users");
}
