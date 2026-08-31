import { createElement } from "react";
import { PRODUCT_NAME } from "@/config/platform";
import { GuestInviteEmail } from "@/lib/email/components/guest-invite";
import { renderEmailTemplate } from "@/lib/email/renderer";

export async function guestInviteTemplate({
  inviterName,
  pageTitle,
  accessLevel,
  acceptUrl,
}: {
  inviterName: string;
  pageTitle: string;
  accessLevel: string;
  acceptUrl: string;
}) {
  const html = await renderEmailTemplate(
    createElement(GuestInviteEmail, {
      inviterName,
      pageTitle,
      accessLevel,
      acceptUrl,
      productName: PRODUCT_NAME,
    })
  );

  const text = `${inviterName} shared "${pageTitle}" with you on ${PRODUCT_NAME}

You've been invited to access "${pageTitle}".

Open the page here:
${acceptUrl}

This invitation expires in 7 days.
If you did not expect this invitation, you can safely ignore this email.`;

  return { html, text };
}
