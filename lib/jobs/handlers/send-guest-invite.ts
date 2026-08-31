import type { Job } from "pg-boss";
import { enqueueEmail } from "@/lib/email";
import { guestInviteTemplate } from "@/lib/email/templates/guest-invite";
import { env } from "@/lib/env";
import type { GuestInviteSendPayload } from "@/lib/jobs/job-names";

export async function handleGuestInviteSend(
  jobs: Job<GuestInviteSendPayload>[]
) {
  for (const job of jobs) {
    await processGuestInvite(job.data);
  }
}

async function processGuestInvite(data: GuestInviteSendPayload) {
  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/guest/${data.inviteToken}`;

  const { html, text } = await guestInviteTemplate({
    inviterName: data.inviterName,
    pageTitle: data.pageTitle,
    accessLevel: data.accessLevel,
    acceptUrl,
  });

  await enqueueEmail({
    to: data.email,
    subject: `${data.inviterName} shared "${data.pageTitle}" with you`,
    html,
    text,
  });
}
