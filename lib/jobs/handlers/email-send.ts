import { and, eq, sql } from "drizzle-orm";
import type { Job } from "pg-boss";
import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { type EmailSendPayload, JOB_NAMES } from "@/lib/jobs/job-names";
import { sendEmailViaSmtp } from "@/lib/smtp/client";
import { sleep } from "@/lib/utils";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 300, 900];

// Many SMTP providers (incl. Mailtrap's testing plan) reject sends faster than
// ~1/second regardless of quota, so bursts (e.g. inviting several teammates) are paced here.
const MIN_SEND_INTERVAL_MS = 1100;
let lastSendAt = 0;

async function waitForSendSlot() {
  const wait = lastSendAt + MIN_SEND_INTERVAL_MS - Date.now();
  if (wait > 0) {
    await sleep(wait);
  }
  lastSendAt = Date.now();
}

export async function handleEmailSend(jobs: Job<EmailSendPayload>[]) {
  for (const job of jobs) {
    await processEmailSendJob(job);
  }
}

async function processEmailSendJob(job: Job<EmailSendPayload>) {
  const { outboxId } = job.data;

  const [claimed] = await db
    .update(emailOutbox)
    .set({
      attemptCount: sql`${emailOutbox.attemptCount} + 1`,
      status: "sending",
      updatedAt: new Date(),
    })
    .where(and(eq(emailOutbox.id, outboxId), eq(emailOutbox.status, "queued")))
    .returning();

  if (!claimed) {
    return;
  }

  const attempt = claimed.attemptCount;
  const remainingAttempts = MAX_ATTEMPTS - attempt;

  console.log(
    `[email-send] attempt ${attempt}/${MAX_ATTEMPTS} — sending "${claimed.subject}" to ${claimed.recipientEmail}`
  );

  try {
    await waitForSendSlot();
    await sendEmailViaSmtp({
      html: claimed.htmlBody,
      subject: claimed.subject,
      to: claimed.recipientEmail,
    });

    await db
      .update(emailOutbox)
      .set({ status: "sent", updatedAt: new Date() })
      .where(eq(emailOutbox.id, outboxId));

    console.log(`[email-send] sent to ${claimed.recipientEmail}`);
  } catch (error) {
    const reason =
      error instanceof Error
        ? error.message.slice(0, 500)
        : String(error).slice(0, 500);

    if (remainingAttempts > 0) {
      const delay =
        RETRY_BACKOFF_SECONDS[
          Math.min(attempt - 1, RETRY_BACKOFF_SECONDS.length - 1)
        ];
      console.error(
        `[email-send] FAILED to send to ${claimed.recipientEmail} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${delay}s — ${reason}`
      );

      await db
        .update(emailOutbox)
        .set({ lastError: reason, status: "queued", updatedAt: new Date() })
        .where(eq(emailOutbox.id, outboxId));

      await enqueueJob(
        JOB_NAMES.EMAIL_SEND,
        { outboxId },
        { startAfter: delay }
      );
      return;
    }

    console.error(
      `[email-send] FAILED to send to ${claimed.recipientEmail} — giving up after ${MAX_ATTEMPTS} attempts — ${reason}`
    );

    await db
      .update(emailOutbox)
      .set({ lastError: reason, status: "failed", updatedAt: new Date() })
      .where(eq(emailOutbox.id, outboxId));
  }
}
