import { Button, Link, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

export function ResetPasswordEmail({
  email,
  resetUrl,
  productName = PRODUCT_NAME,
  workspaceName = null,
}: {
  email: string;
  resetUrl: string;
  productName?: string;
  workspaceName?: string | null;
}) {
  const isWelcome = Boolean(workspaceName);

  return (
    <EmailLayout
      preview={
        isWelcome
          ? `You've been invited to ${workspaceName}`
          : `Reset your ${productName} password`
      }
      productName={productName}
    >
      <Text style={emailStyles.heading}>
        {isWelcome
          ? `You've been invited to ${workspaceName}`
          : "Reset your password"}
      </Text>
      <Text style={emailStyles.paragraph}>
        {isWelcome ? (
          <>
            Set a password for{" "}
            <strong style={{ color: "#0C2340" }}>{email}</strong> to get started
            on {productName}.
          </>
        ) : (
          <>
            We received a request to reset the password for{" "}
            <strong style={{ color: "#0C2340" }}>{email}</strong>.
          </>
        )}
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={resetUrl} style={emailStyles.button}>
          {isWelcome ? "Set Password" : "Reset Password"}
        </Button>
      </Section>
      <Text style={emailStyles.muted}>
        This link expires shortly and can only be used once.
        {!isWelcome &&
          " If you didn't request this, you can safely ignore this email."}
      </Text>
      <Text style={emailStyles.fallbackLink}>
        If the button does not work, paste this link into your browser:{" "}
        <Link href={resetUrl} style={emailStyles.link}>
          {resetUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
