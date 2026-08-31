import type { Job } from "pg-boss";
import { enqueueEmail } from "@/lib/email";
import { workspaceInviteTemplate } from "@/lib/email/templates/workspace-invite";
import { env } from "@/lib/env";
import type { WorkspaceInviteSendPayload } from "@/lib/jobs/job-names";

export async function handleWorkspaceInviteSend(
  jobs: Job<WorkspaceInviteSendPayload>[]
) {
  for (const job of jobs) {
    await processInvite(job.data);
  }
}

async function processInvite(data: WorkspaceInviteSendPayload) {
  console.log(
    `[invite-email] preparing invite email for ${data.invitedEmail} (workspace "${data.workspaceName}")`
  );

  const acceptUrl = `${env.NEXT_PUBLIC_APP_URL}/invite/${data.inviteToken}`;

  const { html, text } = await workspaceInviteTemplate({
    inviterName: data.inviterName,
    workspaceName: data.workspaceName,
    acceptUrl,
  });

  await enqueueEmail({
    to: data.invitedEmail,
    subject: `You've been invited to ${data.workspaceName}`,
    html,
    text,
  });

  console.log(
    `[invite-email] queued into email outbox for ${data.invitedEmail} — will be sent via SMTP by the email.send job`
  );
}
