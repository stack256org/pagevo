import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";
import { writeAuditLog } from "@/lib/orbit/audit";
import { apiError } from "@/lib/workspaces/auth";

// POST /api/orbit/email/:id/retry — re-queue a failed transactional email for
// another send attempt (the automatic retry-with-backoff in email-send.ts
// already exhausted itself for these, so this resets attemptCount for a
// fresh run rather than continuing the old backoff window).
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  const { id } = await params;

  const [row] = await db
    .select({
      id: emailOutbox.id,
      status: emailOutbox.status,
      recipientEmail: emailOutbox.recipientEmail,
    })
    .from(emailOutbox)
    .where(eq(emailOutbox.id, id))
    .limit(1);
  if (!row) {
    return apiError(404, "Email not found");
  }
  if (row.status !== "failed") {
    return apiError(400, "Only failed emails can be retried");
  }

  await db
    .update(emailOutbox)
    .set({
      status: "queued",
      attemptCount: 0,
      lastError: null,
      updatedAt: new Date(),
    })
    .where(eq(emailOutbox.id, id));

  await enqueueJob(JOB_NAMES.EMAIL_SEND, { outboxId: id });

  await writeAuditLog({
    actorId: admin.user.id,
    action: "email.retried",
    targetType: "email",
    targetId: id,
    metadata: { recipientEmail: row.recipientEmail },
  });

  return NextResponse.json({ ok: true });
}
