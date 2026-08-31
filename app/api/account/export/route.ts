import { desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { accounts, sessions as sessionTable, users } from "@/lib/db/schema";

export async function GET() {
  const requestHeaders = await headers();
  const current = await auth.api.getSession({ headers: requestHeaders });
  if (!current) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [profile, userSessions, linkedAccounts] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, current.user.id) }),
    db
      .select({
        createdAt: sessionTable.createdAt,
        expiresAt: sessionTable.expiresAt,
        id: sessionTable.id,
        ipAddress: sessionTable.ipAddress,
        userAgent: sessionTable.userAgent,
      })
      .from(sessionTable)
      .where(eq(sessionTable.userId, current.user.id))
      .orderBy(desc(sessionTable.createdAt)),
    db
      .select({
        createdAt: accounts.createdAt,
        id: accounts.id,
        providerId: accounts.providerId,
      })
      .from(accounts)
      .where(eq(accounts.userId, current.user.id)),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    schemaVersion: 1,
    user: profile
      ? {
          createdAt: profile.createdAt.toISOString(),
          email: profile.email,
          emailVerified: profile.emailVerified,
          id: profile.id,
          name: profile.name,
          role: profile.role,
          updatedAt: profile.updatedAt.toISOString(),
        }
      : null,
    sessions: userSessions.map((session) => ({
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      id: session.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
    })),
    linkedAccounts: linkedAccounts.map((linkedAccount) => ({
      createdAt: linkedAccount.createdAt.toISOString(),
      id: linkedAccount.id,
      providerId: linkedAccount.providerId,
    })),
  };

  const filename = `pagevo-account-export-${current.user.email.replace(/[^a-z0-9]/gi, "_")}-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}
