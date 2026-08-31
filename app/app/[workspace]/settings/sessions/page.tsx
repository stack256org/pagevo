import { desc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { SessionsSection } from "@/components/settings/sessions-section";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { sessions } from "@/lib/db/schema";

export const metadata: Metadata = { title: "Sessions — Settings" };

export default async function SessionsSettingsPage() {
  const session = await requireSession();

  const allSessions = await db
    .select({
      id: sessions.id,
      token: sessions.token,
      ipAddress: sessions.ipAddress,
      userAgent: sessions.userAgent,
      createdAt: sessions.createdAt,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(eq(sessions.userId, session.user.id))
    .orderBy(desc(sessions.createdAt));

  return (
    <SessionsSection
      currentToken={session.session.token}
      sessions={allSessions}
    />
  );
}
