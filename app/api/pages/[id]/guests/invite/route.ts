import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db } from "@/lib/db";
import { guestInvitations, pages, users } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { requirePagePermission } from "@/lib/permissions/resolver";
import { ApiError, apiError, getSession } from "@/lib/workspaces/auth";

type Ctx = { params: Promise<{ id: string }> };

const inviteSchema = z.object({
  email: z
    .string()
    .email()
    .transform((e) => e.toLowerCase().trim()),
  accessLevel: z.enum(["can_view", "can_comment", "can_edit"]),
});

// POST /api/pages/[id]/guests/invite
export async function POST(req: Request, { params }: Ctx) {
  try {
    const { id: pageId } = await params;
    const session = await getSession();

    const [page] = await db
      .select({ workspaceId: pages.workspaceId, title: pages.title })
      .from(pages)
      .where(eq(pages.id, pageId))
      .limit(1);
    if (!page) {
      return apiError(404, "Page not found");
    }

    await requirePagePermission(session.user.id, pageId, "full_access");

    const body = await req.json();
    const parsed = inviteSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0].message);
    }

    const { email, accessLevel } = parsed.data;

    // Block self-invite
    if (email === session.user.email?.toLowerCase()) {
      return apiError(400, "You cannot invite yourself as a guest");
    }

    // Check for duplicate unexpired/unaccepted invite
    const [existing] = await db
      .select({
        id: guestInvitations.id,
        acceptedAt: guestInvitations.acceptedAt,
        expiresAt: guestInvitations.expiresAt,
      })
      .from(guestInvitations)
      .where(
        and(
          eq(guestInvitations.pageId, pageId),
          eq(guestInvitations.email, email)
        )
      )
      .limit(1);

    if (existing) {
      const isExpired = existing.expiresAt < new Date();
      const isAccepted = !!existing.acceptedAt;
      if (!isExpired && !isAccepted) {
        return apiError(409, "An invitation for this email already exists");
      }
      // Clean up expired/accepted — create fresh
      await db
        .delete(guestInvitations)
        .where(eq(guestInvitations.id, existing.id));
    }

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const [invitation] = await db
      .insert(guestInvitations)
      .values({
        pageId,
        workspaceId: page.workspaceId,
        email,
        accessLevel,
        token: nanoid(32),
        expiresAt,
        invitedBy: session.user.id,
      })
      .returning();

    const [inviter] = await db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    await enqueueJob(JOB_NAMES.GUEST_INVITE_SEND, {
      invitationId: invitation.id,
      email,
      pageTitle: page.title || "Untitled",
      inviterName: inviter?.name ?? inviter?.email ?? "A teammate",
      inviteToken: invitation.token,
      accessLevel,
    });

    return Response.json({ ok: true, invitation });
  } catch (err) {
    if (err instanceof ApiError) {
      return apiError(err.status, err.message);
    }
    console.error(err);
    return apiError(500, "Internal server error");
  }
}
