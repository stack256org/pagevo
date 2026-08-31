"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/authz";
import { db } from "@/lib/db";
import {
  templates,
  users,
  workspaceMembers,
  workspaceStorageUsage,
  workspaces,
} from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import {
  createBlankPage,
  createDatabaseFromSnapshot,
  createPageFromSnapshot,
  type DatabaseSchema,
  type PageSnapshot,
} from "@/lib/templates/instantiate";
import { uniqueSlug } from "@/lib/workspaces/auth";
import { getOrCreateInviteeUser } from "@/lib/workspaces/invites";

export type InviteEntry = {
  email: string;
  role: "admin" | "editor" | "viewer";
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface OnboardingData {
  displayName: string;
  invites: InviteEntry[];
  jobTitle: string;
  kind: "personal" | "team";
  templateKey: string;
  timezone: string;
  workspaceName: string;
}

// Maps an onboarding template choice to the built-in template it forks —
// same pageSnapshot (blocks + content) a user would get picking it from the
// template gallery later. "blank" (and any unmapped key) falls through to a
// single empty page, same as Notion's "Start blank".
const ONBOARDING_TEMPLATE_NAMES: Record<string, string> = {
  "getting-started": "Getting Started",
  "project-tracker": "Tasks Tracker",
  "meeting-notes": "Meeting Notes",
  "personal-journal": "Daily Journal",
};

export async function completeOnboardingAction(data: OnboardingData) {
  const session = await requireSession();
  const name =
    data.workspaceName.trim() ||
    (data.kind === "team" ? "My Team" : "My Workspace");
  const slug = await uniqueSlug(name);

  const workspace = await db.transaction(async (tx) => {
    // Update user profile
    const profileUpdate: Partial<typeof users.$inferInsert> = {
      onboardingCompleted: true,
      onboardingStep: 4,
    };
    if (data.displayName) {
      profileUpdate.name = data.displayName;
    }
    if (data.jobTitle) {
      profileUpdate.jobTitle = data.jobTitle;
    }
    if (data.timezone) {
      profileUpdate.timezone = data.timezone;
    }

    await tx
      .update(users)
      .set(profileUpdate)
      .where(eq(users.id, session.user.id));

    // Create workspace
    const [ws] = await tx
      .insert(workspaces)
      .values({ name, slug, kind: data.kind, createdBy: session.user.id })
      .returning();

    await tx.insert(workspaceStorageUsage).values({ workspaceId: ws.id });

    await tx.insert(workspaceMembers).values({
      workspaceId: ws.id,
      userId: session.user.id,
      role: "admin",
      status: "active",
      joinedAt: new Date(),
    });

    // Create the default page — a real fork of the chosen built-in template
    // (same pre-built blocks as the template gallery), or one empty page for
    // "blank", so the workspace never opens to nothing.
    const templateName = ONBOARDING_TEMPLATE_NAMES[data.templateKey];
    const [tpl] = templateName
      ? await tx
          .select()
          .from(templates)
          .where(
            and(eq(templates.isBuiltIn, true), eq(templates.name, templateName))
          )
          .limit(1)
      : [];

    if (tpl) {
      const snapshot = tpl.pageSnapshot as PageSnapshot;
      if (snapshot.database_schema) {
        await createDatabaseFromSnapshot(tx, {
          snapshot: snapshot as PageSnapshot & {
            database_schema: DatabaseSchema;
          },
          fallbackTitle: tpl.name,
          workspaceId: ws.id,
          parentId: null,
          orderIndex: 0,
          userId: session.user.id,
        });
      } else {
        await createPageFromSnapshot(tx, {
          snapshot,
          fallbackTitle: tpl.name,
          workspaceId: ws.id,
          parentId: null,
          orderIndex: 0,
          userId: session.user.id,
        });
      }
    } else {
      await createBlankPage(tx, {
        workspaceId: ws.id,
        parentId: null,
        orderIndex: 0,
        userId: session.user.id,
      });
    }

    return ws;
  });

  // Enqueue invite emails for valid team invites (async via pg-boss)
  const validInvites = data.invites.filter((inv) =>
    EMAIL_REGEX.test(inv.email.trim())
  );
  for (const inv of validInvites) {
    const email = inv.email.trim().toLowerCase();
    const inviteToken = crypto.randomUUID();
    const inviteExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    // Pre-create the account now (same as Settings → Members invites) so
    // /invite/[token] can attach a workspace membership to it immediately —
    // the invitee sets their name/password when accepting.
    const { user: invitee } = await getOrCreateInviteeUser(email);

    const [member] = await db
      .insert(workspaceMembers)
      .values({
        workspaceId: workspace.id,
        userId: invitee.id,
        role: inv.role,
        status: "invited",
        invitedEmail: email,
        inviteToken,
        inviteExpires,
        invitedBy: session.user.id,
      })
      .returning();

    console.log(
      `[invite] ${session.user.email} invited ${email} as "${inv.role}" to workspace "${workspace.name}" (onboarding)`
    );

    await enqueueJob(JOB_NAMES.WORKSPACE_INVITE_SEND, {
      memberId: member.id,
      workspaceId: workspace.id,
      invitedEmail: email,
      inviterName: session.user.name ?? session.user.email,
      workspaceName: workspace.name,
      inviteToken,
    }).catch((err) => {
      console.error(
        `[onboarding] failed to enqueue invite email for ${email}:`,
        err
      );
    });
  }

  redirect(`/app/${workspace.slug}`);
}
