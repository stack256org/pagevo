import { createElement } from "react";
import { PRODUCT_NAME } from "@/config/platform";
import { ResetPasswordEmail } from "@/lib/email/components/reset-password";
import { renderEmailTemplate } from "@/lib/email/renderer";

export async function resetPasswordTemplate({
  email,
  resetUrl,
  workspaceName = null,
}: {
  email: string;
  resetUrl: string;
  workspaceName?: string | null;
}) {
  const html = await renderEmailTemplate(
    createElement(ResetPasswordEmail, {
      email,
      resetUrl,
      productName: PRODUCT_NAME,
      workspaceName,
    })
  );

  const text = workspaceName
    ? `You've been invited to ${workspaceName}

Set a password for ${email} to get started on ${PRODUCT_NAME}:
${resetUrl}

This link expires shortly and can only be used once.`
    : `Reset your ${PRODUCT_NAME} password

We received a request to reset the password for ${email}:
${resetUrl}

This link expires shortly and can only be used once. If you didn't request this, you can safely ignore this email.`;

  return { html, text };
}
