import { createElement } from "react";
import { PRODUCT_NAME } from "@/config/platform";
import { WorkspaceInviteEmail } from "@/lib/email/components/workspace-invite";
import { renderEmailTemplate } from "@/lib/email/renderer";

export async function workspaceInviteTemplate({
  inviterName,
  workspaceName,
  acceptUrl,
}: {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
}) {
  const html = await renderEmailTemplate(
    createElement(WorkspaceInviteEmail, {
      inviterName,
      workspaceName,
      acceptUrl,
      productName: PRODUCT_NAME,
    })
  );

  const text = `You've been invited to ${workspaceName} on ${PRODUCT_NAME}

${inviterName} has invited you to join the ${workspaceName} workspace.

Accept your invitation here:
${acceptUrl}

This invitation expires in 7 days.
If you did not expect this invitation, you can safely ignore this email.`;

  return { html, text };
}
