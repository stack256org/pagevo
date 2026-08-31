import { and, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { ProfileSection } from "@/components/settings/profile-section";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { accounts, users } from "@/lib/db/schema";
import { isSmtpConfigured } from "@/lib/smtp/client";

export const metadata: Metadata = { title: "My Profile — Settings" };

type Props = { params: Promise<{ workspace: string }> };

export default async function ProfileSettingsPage({ params }: Props) {
  await params; // consume params (workspace slug not needed for profile)
  const session = await requireSession();

  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      jobTitle: users.jobTitle,
      timezone: users.timezone,
      image: users.image,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  // A "credential" account row only exists once a password has actually
  // been set (via sign-up/email, the invite flow, reset-password, or this
  // page's own "Set password") — Google-only users have a "google" row and
  // no "credential" row, so this is what gates showing "Set password".
  const [credential] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, session.user.id),
        eq(accounts.providerId, "credential")
      )
    )
    .limit(1);

  return (
    <ProfileSection
      hasPassword={!!credential}
      smtpConfigured={await isSmtpConfigured()}
      user={user!}
    />
  );
}
