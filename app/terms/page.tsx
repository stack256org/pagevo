import Link from "next/link";
import { Logo } from "@/components/ui/logo";
import { PRODUCT_NAME } from "@/config/platform";

export const metadata = {
  title: `Terms of Service — ${PRODUCT_NAME}`,
};

const LAST_UPDATED = "June 1, 2025";

const SECTIONS = [
  {
    title: "Acceptance of Terms",
    content: `By creating an account or using ${PRODUCT_NAME} in any way, you accept these Terms of Service and our Privacy Policy. If you do not agree, you may not use ${PRODUCT_NAME}.`,
  },
  {
    title: "Description of Service",
    content: `${PRODUCT_NAME} is a collaborative workspace platform that lets individuals and teams create, organize, and share documents, wikis, and notes. We reserve the right to modify, suspend, or discontinue any part of the service at any time with reasonable notice.`,
  },
  {
    title: "User Accounts",
    content:
      "You are responsible for maintaining the security of your account and all activity that occurs under it. You must provide accurate information when creating your account and keep it up to date. You may not share your account or transfer it to another person.",
  },
  {
    title: "Acceptable Use",
    content: `You agree not to use ${PRODUCT_NAME} to: (a) upload or share unlawful, harmful, or abusive content; (b) attempt to gain unauthorized access to any part of the platform; (c) use the service to send spam or engage in any form of phishing; (d) reverse engineer or attempt to extract source code from our software.`,
  },
  {
    title: "Your Content",
    content: `You retain ownership of all content you create or upload to ${PRODUCT_NAME}. By using our service, you grant us a limited, non-exclusive licence to store and process your content solely to provide the service to you. We do not sell or share your content with third parties.`,
  },
  {
    title: "Data and Privacy",
    content: `Our collection and use of personal information is described in our Privacy Policy. By using ${PRODUCT_NAME}, you consent to the data practices described there.`,
  },
  {
    title: "Termination",
    content:
      "We may suspend or terminate your account if you violate these Terms. You may delete your account at any time from your workspace settings. Upon termination, your data will be retained for 30 days before permanent deletion, giving you time to export it.",
  },
  {
    title: "Limitation of Liability",
    content: `To the maximum extent permitted by law, ${PRODUCT_NAME} and its team shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the service.`,
  },
  {
    title: "Changes to These Terms",
    content: `We may update these Terms from time to time. We will notify you of significant changes via email or an in-app notice. Continued use of ${PRODUCT_NAME} after changes take effect constitutes acceptance of the revised Terms.`,
  },
  {
    title: "Contact",
    content: `If you have questions about these Terms, please contact the administrator of this ${PRODUCT_NAME} instance.`,
  },
];

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-sm text-base-content/70">
            Last updated: {LAST_UPDATED}
          </p>

          {/* Intro card */}
          <div className="mt-8 rounded-lg border border-base-300 bg-base-100 px-6 py-5">
            <p className="text-base leading-7 text-base-content/70">
              By accessing or using {PRODUCT_NAME}, you agree to be bound by
              these Terms of Service. Please read them carefully before using
              our platform.
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
              project, is the party offering the service described below. Review
              and adapt this template to your own organization before relying on
              it.
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
