import { Button, Link, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

export function ChangeEmailEmail({
  newEmail,
  verifyUrl,
  productName = PRODUCT_NAME,
}: {
  newEmail: string;
  verifyUrl: string;
  productName?: string;
}) {
  return (
    <EmailLayout
      preview={`Confirm your new ${productName} email address`}
      productName={productName}
    >
      <Text style={emailStyles.heading}>Confirm your new email address</Text>
      <Text style={emailStyles.paragraph}>
        We received a request to change the email on your {productName} account
        to <strong style={{ color: "#0C2340" }}>{newEmail}</strong>. Click below
        to confirm — your current email stays active until you do.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={verifyUrl} style={emailStyles.button}>
          Confirm New Email
        </Button>
      </Section>
      <Text style={emailStyles.muted}>
        This link expires in 1 hour and can only be used once. If you didn't
        request this change, you can safely ignore this email — your email
        address won't change.
      </Text>
      <Text style={emailStyles.fallbackLink}>
        If the button does not work, paste this link into your browser:{" "}
        <Link href={verifyUrl} style={emailStyles.link}>
          {verifyUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
