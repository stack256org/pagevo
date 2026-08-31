import { createElement } from "react";
import { PRODUCT_NAME } from "@/config/platform";
import { ChangeEmailEmail } from "@/lib/email/components/change-email";
import { renderEmailTemplate } from "@/lib/email/renderer";

export async function changeEmailTemplate({
  newEmail,
  verifyUrl,
}: {
  newEmail: string;
  verifyUrl: string;
}) {
  const html = await renderEmailTemplate(
    createElement(ChangeEmailEmail, {
      newEmail,
      verifyUrl,
      productName: PRODUCT_NAME,
    })
  );

  const text = `Confirm your new ${PRODUCT_NAME} email address

We received a request to change the email on your ${PRODUCT_NAME} account to ${newEmail}:
${verifyUrl}

This link expires in 1 hour and can only be used once. If you didn't request this change, you can safely ignore this email — your email address won't change.`;

  return { html, text };
}
