import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { WorkspaceSetup } from "@/components/workspace/workspace-setup";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import { workspaceMembers, workspaces } from "@/lib/db/schema";
import { isSmtpConfigured } from "@/lib/smtp/client";

type Props = { params: Promise<{ slug: string }> };

export default async function WorkspaceSetupPage({ params }: Props) {
  const session = await requireSession();
  const { slug } = await params;

  const [ws] = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      slug: workspaces.slug,
      kind: workspaces.kind,
    })
    .from(workspaces)
    .innerJoin(
      workspaceMembers,
      eq(workspaceMembers.workspaceId, workspaces.id)
    )
    .where(
      and(
        eq(workspaces.slug, slug),
        eq(workspaceMembers.userId, session.user.id),
        eq(workspaceMembers.status, "active")
      )
    )
    .limit(1);

  if (!ws) {
    notFound();
  }

  return (
    <WorkspaceSetup
      smtpConfigured={await isSmtpConfigured()}
      workspaceId={ws.id}
      workspaceKind={ws.kind}
      workspaceName={ws.name}
      workspaceSlug={ws.slug}
    />
  );
}
