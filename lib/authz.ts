import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export async function getCurrentSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function requireSession() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/auth/login");
  }
  return session;
}

export async function requireAdmin() {
  const session = await requireSession();
  const [freshUser] = await db
    .select({
      banned: users.banned,
      email: users.email,
      id: users.id,
      role: users.role,
      isPlatformAdmin: users.isPlatformAdmin,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!freshUser || freshUser.banned || freshUser.role !== "admin") {
    redirect("/dashboard");
  }

  return {
    ...session,
    user: {
      ...session.user,
      banned: freshUser.banned,
      email: freshUser.email,
      role: freshUser.role,
      isPlatformAdmin: freshUser.isPlatformAdmin,
    },
  };
}
