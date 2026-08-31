import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { PRODUCT_NAME } from "@/config/platform";

export const metadata = {
  title: `Privacy Policy — ${PRODUCT_NAME}`,
};

const LAST_UPDATED = "June 1, 2025";

const SECTIONS = [
  {
    title: "Information We Collect",
    content: `We collect information you provide directly, such as your name, email address, and any content you create in ${PRODUCT_NAME}. We also collect usage data automatically — such as pages visited, features used, and device information — to improve the product.`,
  },
  {
    title: "How We Use Your Information",
    content: `We use your information to: (a) provide and maintain the ${PRODUCT_NAME} service; (b) send you important account notifications and product updates; (c) respond to your support requests; (d) improve and develop new features. We do not sell your personal data to third parties.`,
  },
  {
    title: "Data Storage and Security",
    content:
      "Your data is stored on secure servers with industry-standard encryption at rest and in transit. We use reputable cloud infrastructure providers and follow best practices to protect your information. However, no method of transmission over the internet is 100% secure.",
  },
  {
    title: "Cookies and Tracking",
    content: `We use essential cookies to keep you signed in and maintain your session. We may use analytics cookies to understand how ${PRODUCT_NAME} is used. You can disable non-essential cookies in your browser settings, though this may affect some functionality.`,
  },
  {
    title: "Third-Party Services",
    content: `We use a limited number of trusted third-party services to operate ${PRODUCT_NAME}, including authentication providers (such as Google OAuth) and infrastructure providers. These services have their own privacy policies and we share only the minimum data necessary.`,
  },
  {
    title: "Data Retention",
    content:
      "We retain your data for as long as your account is active. If you delete your account, we will delete your personal data and content within 30 days, except where we are required by law to retain it longer.",
  },
  {
    title: "Your Rights",
    content: `Depending on your location, you may have rights to: access the personal data we hold about you; correct inaccurate data; request deletion of your data; export your data in a portable format. To exercise any of these rights, contact the administrator of this ${PRODUCT_NAME} instance.`,
  },
  {
    title: "Children's Privacy",
    content: `${PRODUCT_NAME} is not intended for children under 13 years of age. We do not knowingly collect personal information from children under 13. If we discover we have inadvertently collected such data, we will delete it promptly.`,
  },
  {
    title: "International Transfers",
    content: `${PRODUCT_NAME} operates globally. By using our service, you consent to your information being processed in countries other than your own, which may have different data protection laws.`,
  },
  {
    title: "Changes to This Policy",
    content: `We may update this Privacy Policy periodically. We will notify you of material changes via email or an in-app notice at least 14 days before they take effect. Continued use of ${PRODUCT_NAME} after changes take effect constitutes acceptance of the revised policy.`,
  },
  {
    title: "Contact Us",
    content: `If you have questions or concerns about this Privacy Policy or our data practices, please contact the administrator of this ${PRODUCT_NAME} instance.`,
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-base-200 text-base-content antialiased">
      {/* ── Header ── */}
      <header className="sticky top-0 z-10 border-b border-base-300 bg-base-200/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <Link className="flex items-center gap-2.5" href="/">
            <Logo className="h-7 w-auto" height={40} width={160} />
          </Link>
          <Link
            className="rounded-sm border border-base-300 px-4 py-1.5 text-sm font-medium text-base-content transition-colors hover:bg-base-200"
            href="/auth/login"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-14">
        {/* ── Hero title block ── */}
        <div className="mb-12">
          <span className="mb-3 inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
            Legal
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-tight text-base-content">
            Privacy Policy
          </h1>
          <p className="mt-2 text-sm text-base-content/70">
            Last updated: {LAST_UPDATED}
          </p>

          {/* Intro card */}
          <div className="mt-8 rounded-lg border border-base-300 bg-base-100 px-6 py-5">
            <p className="text-base leading-7 text-base-content/70">
              {PRODUCT_NAME} is committed to protecting your personal
              information. This Privacy Policy explains what data we collect,
              how we use it, and the choices you have.
            </p>
          </div>

          {/* Self-hosted notice */}
          <div className="mt-4 rounded-lg border border-warning/30 bg-warning/5 px-6 py-4">
            <p className="text-sm leading-6 text-base-content/70">
              <strong className="text-base-content">
                Note for instance operators:
              </strong>{" "}
              {PRODUCT_NAME} is self-hosted software — the organization or
              individual running this instance, not the {PRODUCT_NAME}
              project, is the data controller for the information described
              below. Review and adapt this template to your own data-handling
              practices before relying on it.
            </p>
          </div>
        </div>

        {/* ── Sections ── */}
        <div className="space-y-4">
          {SECTIONS.map((section, i) => (
            <div
              className="group rounded-lg border border-base-300 bg-base-100 px-6 py-5 transition-colors hover:border-base-300"
              key={section.title}
            >
              <div className="flex items-start gap-4">
                {/* Number badge */}
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary/10 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <h2 className="mb-2 text-base font-bold text-base-content">
                    {section.title}
                  </h2>
                  <p className="text-sm leading-7 text-base-content/70">
                    {section.content}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Footer ── */}
        <div className="mt-14 flex items-center justify-center border-t border-base-300 pt-10">
          <Link
            className="inline-flex items-center gap-2 rounded-md bg-primary px-6 py-2.5 text-sm font-semibold text-primary-content transition-colors hover:bg-primary/90 active:scale-[0.98]"
            href="/"
          >
            <svg
              className="size-3.5"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 16 16"
            >
              <path d="M10 12L6 8l4-4" />
            </svg>
            Back to home
          </Link>
        </div>
      </main>
    </div>
  );
}
