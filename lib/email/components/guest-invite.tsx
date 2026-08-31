import { Button, Link, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

const ACCESS_LABELS: Record<string, string> = {
  can_view: "view",
  can_comment: "comment on",
  can_edit: "edit",
  full_access: "fully access",
};

export function GuestInviteEmail({
  inviterName,
  pageTitle,
  accessLevel,
  acceptUrl,
  productName = PRODUCT_NAME,
}: {
  inviterName: string;
  pageTitle: string;
  accessLevel: string;
  acceptUrl: string;
  productName?: string;
}) {
  const accessLabel = ACCESS_LABELS[accessLevel] ?? "access";

  return (
    <EmailLayout
      preview={`${inviterName} shared "${pageTitle}" with you on ${productName}`}
      productName={productName}
    >
      <Text style={emailStyles.heading}>
        You&apos;ve been invited to a page
      </Text>
      <Text style={emailStyles.paragraph}>
        <strong style={{ color: "#0C2340" }}>{inviterName}</strong> has invited
        you to {accessLabel}{" "}
        <strong style={{ color: "#0C2340" }}>{pageTitle}</strong> on{" "}
        {productName}.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={acceptUrl} style={emailStyles.button}>
          Open Page
        </Button>
      </Section>
      <Text style={emailStyles.muted}>
        This invitation expires in 7 days. If you did not expect this, you can
        safely ignore this email.
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
