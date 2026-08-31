import { Button, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

export function NotificationEmail({
  subject,
  snippet,
  actionUrl,
  footerNote,
  productName = PRODUCT_NAME,
}: {
  subject: string;
  snippet?: string | null;
  actionUrl: string;
  footerNote: string;
  productName?: string;
}) {
  return (
    <EmailLayout preview={subject} productName={productName}>
      <Text style={emailStyles.heading}>{subject}</Text>
      {snippet && (
        <Text
          style={{
            ...emailStyles.paragraph,
            fontStyle: "italic",
            color: emailStyles.muted.color,
            borderLeft: "3px solid #DAEAF5",
            paddingLeft: "12px",
          }}
        >
          &ldquo;{snippet}&rdquo;
        </Text>
      )}
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>
          View notification →
        </Button>
      </Section>
      <Text style={emailStyles.muted}>{footerNote}</Text>
    </EmailLayout>
  );
}
