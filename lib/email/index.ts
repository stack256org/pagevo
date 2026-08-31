import { db } from "@/lib/db";
import { emailOutbox } from "@/lib/db/schema";
import { enqueueJob } from "@/lib/jobs/enqueue";
import { JOB_NAMES } from "@/lib/jobs/job-names";

export interface SendEmailOptions {
  html: string;
  subject: string;
  text?: string;
  to: string;
  type?: "notification_email" | "digest_email";
}

export async function enqueueEmail(options: SendEmailOptions) {
  const [row] = await db
    .insert(emailOutbox)
    .values({
      recipientEmail: options.to,
      subject: options.subject,
      htmlBody: options.html,
      type: options.type ?? "notification_email",
      status: "queued",
    })
    .returning({ id: emailOutbox.id });

  await enqueueJob(JOB_NAMES.EMAIL_SEND, { outboxId: row.id });
}
