"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { requestPasswordReset } from "@/lib/auth/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your work email.");
      return;
    }

    setSubmitting(true);

    const result = await requestPasswordReset({
      email,
      redirectTo: "/auth/reset-password",
    });

    setSubmitting(false);
    if (result.error) {
      setError(
        result.error.message ?? "Something went wrong. Please try again."
      );
      return;
    }
    setSent(true);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-95">
        <Link className="mb-10 flex flex-col items-center gap-3" href="/">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </Link>

        <div className="rounded-xl border border-base-300 bg-base-100 px-8 py-8">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-success/10">
                <svg
                  className="size-7 text-success"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              </div>
              <h1 className="mb-2 text-xl font-bold text-base-content">
                Check your inbox
              </h1>
              <p className="mb-1 text-sm text-base-content/70">
                If an account exists for
              </p>
              <p className="mb-7 text-sm font-semibold text-base-content">
                {email}
              </p>
              <p className="mb-6 text-xs text-base-content/70">
                you'll receive a password reset link shortly. If email isn't
                configured on this instance, check the background worker's
                console output for the link instead.
              </p>
              <Button
                asChild
                className="w-full"
                size="default"
                variant="outline"
              >
                <Link href="/auth/login">Back to sign in</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-xl font-bold text-base-content">
                  Reset your password
                </h1>
                <p className="mt-1 text-sm text-base-content/70">
                  We'll send a reset link to your email.
                </p>
              </div>

              <form className="space-y-4" noValidate onSubmit={onSubmit}>
                <div>
                  <Label
                    className="mb-1.5 block text-sm font-medium text-base-content"
                    htmlFor="email"
                  >
                    Work email
                  </Label>
                  <Input
                    autoComplete="email"
                    className="w-full focus-visible:border-primary"
                    id="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    type="email"
                    value={email}
                  />
                </div>

                {error && (
                  <p className="rounded-sm border border-error/20 bg-error/5 px-3.5 py-2.5 text-sm text-error">
                    {error}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={submitting}
                  size="default"
                  type="submit"
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {submitting ? "Sending…" : "Send reset link"}
                </Button>

                <p className="text-center text-sm text-base-content/70">
                  <Link
                    className="font-medium text-base-content underline underline-offset-2 transition-colors duration-150 hover:text-primary"
                    href="/auth/login"
                  >
                    Back to sign in
                  </Link>
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
