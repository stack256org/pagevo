"use server";

import { and, eq, inArray, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { accounts, sessions as sessionTable, users } from "@/lib/db/schema";

export interface ActionState {
  error?: string;
  success?: string;
}

export async function updateNameAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();

  if (!name) {
    return { error: "Name is required." };
  }
  if (name.length > 100) {
    return { error: "Name must be 100 characters or fewer." };
  }

  await db
    .update(users)
    .set({ name, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: "Name updated." };
}

export async function changeEmailAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await requireSession();
  const newEmail = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    return { error: "Enter a valid email address." };
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, newEmail))
    .limit(1);

  if (existing && existing.id !== current.user.id) {
    return { error: "That email is already in use." };
  }

  await db
    .update(users)
    .set({
      email: newEmail,
      emailVerified: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, current.user.id));

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { success: "Email updated. Use the new email for future sign-ins." };
}

export async function revokeSessionAction(formData: FormData): Promise<void> {
  const current = await requireSession();
  const sessionId = String(formData.get("sessionId") ?? "");

  const [row] = await db
    .select({
      id: sessionTable.id,
      token: sessionTable.token,
      userId: sessionTable.userId,
    })
    .from(sessionTable)
    .where(eq(sessionTable.id, sessionId))
    .limit(1);

  if (!row || row.userId !== current.user.id) {
    return;
  }
  if (row.token === current.session.token) {
    return;
  }

  await db.delete(sessionTable).where(eq(sessionTable.id, sessionId));
  revalidatePath("/dashboard/profile");
}

export async function signOutOtherSessionsAction(): Promise<void> {
  const current = await requireSession();
  const rows = await db
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(
      and(
        eq(sessionTable.userId, current.user.id),
        ne(sessionTable.token, current.session.token)
      )
    );

  const ids = rows.map((row) => row.id);
  if (ids.length > 0) {
    await db.delete(sessionTable).where(inArray(sessionTable.id, ids));
  }

  revalidatePath("/dashboard/profile");
}

export async function deleteAccountAction(
  _state: ActionState,
  formData: FormData
): Promise<ActionState> {
  const current = await requireSession();
  const confirmEmail = String(formData.get("confirmEmail") ?? "")
    .trim()
    .toLowerCase();

  const [freshUser] = await db
    .select({ email: users.email, id: users.id })
    .from(users)
    .where(eq(users.id, current.user.id))
    .limit(1);

  if (!freshUser) {
    return { error: "Account not found." };
  }

  if (confirmEmail !== freshUser.email.toLowerCase()) {
    return { error: "Type your email address to confirm deletion." };
  }

  await db.transaction(async (tx) => {
    await tx.delete(sessionTable).where(eq(sessionTable.userId, freshUser.id));
    await tx.delete(accounts).where(eq(accounts.userId, freshUser.id));
    await tx.delete(users).where(eq(users.id, freshUser.id));
  });

  redirect("/auth/login");
}
