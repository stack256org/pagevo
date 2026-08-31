import { count } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { env } from "@/lib/env";

export async function getUserCount(): Promise<number> {
  const [{ value }] = await db.select({ value: count() }).from(users);
  return value;
}

// Self-serve registration is only for bootstrapping the first (admin) account,
// unless ALLOW_PUBLIC_REGISTRATION keeps it open. Single source of truth — all
// signup paths and the sign-in UI call this instead of re-deriving it.
export async function isRegistrationAllowed(): Promise<boolean> {
  if (env.ALLOW_PUBLIC_REGISTRATION) {
    return true;
  }
  return (await getUserCount()) === 0;
}
