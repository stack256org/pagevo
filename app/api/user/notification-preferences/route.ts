import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { notificationPreferences } from "@/lib/db/schema";
import { apiError, getSession } from "@/lib/workspaces/auth";

const patchSchema = z
  .object({
    emailFrequency: z.enum(["realtime", "daily", "weekly", "off"]).optional(),
    weeklyDigestDay: z.number().int().min(0).max(6).optional(),
    notifyMentions: z.boolean().optional(),
    notifyPageUpdates: z.boolean().optional(),
    notifyWorkspaceInvites: z.boolean().optional(),
    notifyTaskAssignments: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  try {
    const session = await getSession();

    const [pref] = await db
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, session.user.id))
      .limit(1);

    if (!pref) {
      return Response.json({
        emailFrequency: "daily",
        weeklyDigestDay: 1,
        notifyMentions: true,
        notifyPageUpdates: true,
        notifyWorkspaceInvites: true,
        notifyTaskAssignments: true,
      });
    }

    return Response.json({
      emailFrequency: pref.emailFrequency,
      weeklyDigestDay: pref.weeklyDigestDay,
      notifyMentions: pref.notifyMentions,
      notifyPageUpdates: pref.notifyPageUpdates,
      notifyWorkspaceInvites: pref.notifyWorkspaceInvites,
      notifyTaskAssignments: pref.notifyTaskAssignments,
    });
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    console.error("[GET /api/user/notification-preferences]", e);
    return apiError(500, "Internal error");
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getSession();
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    }

    await db
      .insert(notificationPreferences)
      .values({
        userId: session.user.id,
        emailFrequency: parsed.data.emailFrequency ?? "daily",
        weeklyDigestDay: parsed.data.weeklyDigestDay ?? 1,
        notifyMentions: parsed.data.notifyMentions ?? true,
        notifyPageUpdates: parsed.data.notifyPageUpdates ?? true,
        notifyWorkspaceInvites: parsed.data.notifyWorkspaceInvites ?? true,
        notifyTaskAssignments: parsed.data.notifyTaskAssignments ?? true,
      })
      .onConflictDoUpdate({
        target: notificationPreferences.userId,
        set: {
          ...(parsed.data.emailFrequency === undefined
            ? {}
            : { emailFrequency: parsed.data.emailFrequency }),
          ...(parsed.data.weeklyDigestDay === undefined
            ? {}
            : { weeklyDigestDay: parsed.data.weeklyDigestDay }),
          ...(parsed.data.notifyMentions === undefined
            ? {}
            : { notifyMentions: parsed.data.notifyMentions }),
          ...(parsed.data.notifyPageUpdates === undefined
            ? {}
            : { notifyPageUpdates: parsed.data.notifyPageUpdates }),
          ...(parsed.data.notifyWorkspaceInvites === undefined
            ? {}
            : { notifyWorkspaceInvites: parsed.data.notifyWorkspaceInvites }),
          ...(parsed.data.notifyTaskAssignments === undefined
            ? {}
            : { notifyTaskAssignments: parsed.data.notifyTaskAssignments }),
          updatedAt: new Date(),
        },
      });

    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof Response) {
      return e;
    }
    console.error("[PATCH /api/user/notification-preferences]", e);
    return apiError(500, "Internal error");
  }
}
