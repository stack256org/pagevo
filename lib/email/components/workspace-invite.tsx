import { Button, Link, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

export function WorkspaceInviteEmail({
  inviterName,
  workspaceName,
  acceptUrl,
  productName = PRODUCT_NAME,
}: {
  inviterName: string;
  workspaceName: string;
  acceptUrl: string;
  productName?: string;
}) {
  return (
    <EmailLayout
      preview={`${inviterName} invited you to ${workspaceName} on ${productName}`}
      productName={productName}
    >
      <Text style={emailStyles.heading}>
        You&apos;ve been invited to {workspaceName}
      </Text>
      <Text style={emailStyles.paragraph}>
        <strong style={{ color: "#0C2340" }}>{inviterName}</strong> has invited
        you to join the{" "}
        <strong style={{ color: "#0C2340" }}>{workspaceName}</strong> workspace
        on {productName}.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={acceptUrl} style={emailStyles.button}>
          Accept Invitation
        </Button>
      </Section>
      <Text style={emailStyles.muted}>
        This invitation expires in 7 days. If you did not expect this
        invitation, you can safely ignore this email.
      </Text>
      <Text style={emailStyles.fallbackLink}>
        If the button does not work, paste this link into your browser:{" "}
        <Link href={acceptUrl} style={emailStyles.link}>
          {acceptUrl}
        </Link>
      </Text>
    </EmailLayout>
  );
}
