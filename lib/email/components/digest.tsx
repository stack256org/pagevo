import { Link, Section, Text } from "react-email";
import { PRODUCT_NAME } from "@/config/platform";
import { EmailLayout, emailStyles } from "@/lib/email/components/layout";

interface DigestItem {
  snippet: string | null;
  who: string;
}

interface DigestSection {
  items: DigestItem[];
  pageTitle: string;
}

export function DigestEmail({
  dateLabel,
  sections,
  actionUrl,
  settingsUrl,
  productName = PRODUCT_NAME,
}: {
  dateLabel: string;
  sections: DigestSection[];
  actionUrl: string;
  settingsUrl: string;
  productName?: string;
}) {
  return (
    <EmailLayout
      preview={`Your ${productName} activity for ${dateLabel}`}
      productName={productName}
    >
      <Text style={emailStyles.heading}>Your {productName} activity</Text>
      <Text style={{ ...emailStyles.muted, margin: "0 0 24px" }}>
        {dateLabel}
      </Text>
      {sections.map((s, i) => (
        <Section key={i} style={{ marginBottom: "20px" }}>
          <Text
            style={{
              fontSize: "14px",
              fontWeight: 700,
              color: "#0C2340",
              margin: "0 0 6px",
            }}
          >
            {s.pageTitle}
          </Text>
          {s.items.map((it, j) => (
            <Text
              key={j}
              style={{
                ...emailStyles.paragraph,
                fontSize: "14px",
                margin: "0 0 6px",
              }}
            >
              <strong style={{ color: "#0C2340" }}>{it.who}</strong>
              {it.snippet ? `: "${it.snippet}"` : ""}
            </Text>
          ))}
        </Section>
      ))}
      <Section style={{ marginTop: "24px" }}>
        <Link href={actionUrl} style={{ ...emailStyles.link, fontWeight: 700 }}>
          View all notifications →
        </Link>
        &nbsp;&nbsp;
        <Link
          href={settingsUrl}
          style={{ ...emailStyles.fallbackLink, textDecoration: "none" }}
        >
          Manage email settings
        </Link>
      </Section>
    </EmailLayout>
  );
}
