"use client";

import Link from "next/link";
import { signOut } from "@/lib/auth/client";

export function WrongAccountError({
  invitedEmail,
  currentEmail,
  token,
}: {
  invitedEmail: string;
  currentEmail: string;
  token: string;
}) {
  async function handleSwitch() {
    await signOut();
    window.location.href = `/auth/login?next=/invite/${token}&hint=${encodeURIComponent(invitedEmail)}`;
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-lg bg-warning/10 ring-1 ring-warning/20">
          <svg
            className="size-6 text-warning"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            viewBox="0 0 24 24"
          >
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        </div>

        <div className="mb-6 text-center">
          <h1 className="mb-2 text-lg font-bold text-base-content">
            Wrong account signed in
          </h1>
          <p className="text-sm leading-relaxed text-base-content/70">
            This invite was sent to{" "}
            <span className="font-semibold text-base-content">
              {invitedEmail}
            </span>
            , but you&apos;re currently signed in as{" "}
            <span className="font-semibold text-base-content">
              {currentEmail}
            </span>
            .
          </p>
          <p className="mt-2 text-sm text-base-content/70">
            Sign out and sign in with the correct account to accept this invite.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            className="inline-flex h-9 w-full items-center justify-center rounded-sm bg-primary px-4 text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
            onClick={handleSwitch}
            type="button"
          >
            Sign out &amp; continue as {invitedEmail}
          </button>
          <Link
            className="inline-flex h-9 w-full items-center justify-center rounded-sm border border-base-300 px-4 text-sm font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content"
            href="/platform/post-auth"
          >
            Go to your workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
