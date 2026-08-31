import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Text,
} from "react-email";
import { LOGO_PATH, PRODUCT_NAME } from "@/config/platform";

// The logo is embedded as a data URI (read once, cached) rather than linked
// via NEXT_PUBLIC_APP_URL — that host is only reachable in production; in
// dev it's localhost, which no external inbox/preview tool (Mailtrap, Gmail,
// etc.) can ever load, so the logo would silently fail to render there.
let cachedLogoDataUrl: string | null | undefined;
function getLogoDataUrl(): string | null {
  if (cachedLogoDataUrl !== undefined) {
    return cachedLogoDataUrl;
  }
  try {
    const bytes = readFileSync(join(process.cwd(), "public", LOGO_PATH));
    cachedLogoDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
  } catch {
    cachedLogoDataUrl = null;
  }
  return cachedLogoDataUrl;
}

// Same design tokens as app/globals.css's light theme (--primary, --border,
// --radius-md, --radius-lg, --font-sans) — kept in sync by hand since email
// clients can't read CSS custom properties or import the app's stylesheet.
export const emailStyles = {
  body: {
    backgroundColor: "#F8FBFF",
    color: "#0C2340",
    fontFamily:
      '"Inter", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    margin: 0,
    padding: 0,
  },
  outerContainer: {
    backgroundColor: "#ffffff",
    border: "1px solid #DAEAF5",
    borderRadius: "10px",
    margin: "40px auto",
    maxWidth: "560px",
    overflow: "hidden",
  },
  header: {
    padding: "24px 32px",
  },
  content: {
    padding: "8px 32px 32px",
  },
  hr: {
    borderTop: "1px solid #DAEAF5",
    margin: 0,
  },
  footer: {
    padding: "20px 32px",
  },
  footerText: {
    color: "#94A3B8",
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0,
    textAlign: "center" as const,
  },
  logoFallback: {
    color: "#0284C7",
    fontSize: "18px",
    fontWeight: 900,
    letterSpacing: "0",
    margin: 0,
  },
  button: {
    backgroundColor: "#0284C7",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "14px",
    fontWeight: 700,
    padding: "12px 18px",
    textDecoration: "none",
  },
  fallbackLink: {
    color: "#64748B",
    fontSize: "12px",
    lineHeight: "20px",
  },
  heading: {
    fontSize: "22px",
    fontWeight: 800,
    letterSpacing: "0",
    lineHeight: "30px",
    margin: "0 0 12px",
  },
  link: { color: "#0284C7" },
  muted: {
    color: "#64748B",
    fontSize: "13px",
    lineHeight: "22px",
  },
  paragraph: {
    color: "#0C2340",
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 8px",
  },
};

export function EmailLayout({
  children,
  logoUrl,
  preview,
  productName = PRODUCT_NAME,
}: {
  children: ReactNode;
  /** Defaults to the real app logo (embedded as a data URI) — pass `null`
   *  explicitly to fall back to the plain wordmark instead. */
  logoUrl?: string | null;
  preview: string;
  productName?: string;
}) {
  const resolvedLogoUrl = logoUrl === undefined ? getLogoDataUrl() : logoUrl;
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={emailStyles.body}>
        <Container style={emailStyles.outerContainer}>
          <Section style={emailStyles.header}>
            {resolvedLogoUrl ? (
              <Img
                alt={productName}
                height="30"
                src={resolvedLogoUrl}
                style={{ display: "block" }}
              />
            ) : (
              <Text style={emailStyles.logoFallback}>{productName}</Text>
            )}
          </Section>
          <Section style={emailStyles.content}>{children}</Section>
          <Hr style={emailStyles.hr} />
          <Section style={emailStyles.footer}>
            <Text style={emailStyles.footerText}>
              Sent by {productName} — the team workspace for small teams.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
