"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { resetPassword } from "@/lib/auth/client";
import { passwordError } from "@/lib/auth/password";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordInner />
    </Suspense>
  );
}

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [invalidToken, setInvalidToken] = useState(!token);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError("This reset link is invalid or has expired.");
      setInvalidToken(true);
      return;
    }

    const strengthError = passwordError(password);
    if (strengthError) {
      setError(strengthError);
      setInvalidToken(false);
      return;
    }

    setSubmitting(true);
    const result = await resetPassword({ newPassword: password, token });
    setSubmitting(false);

    if (result.error) {
      setError(
        result.error.message ?? "This reset link is invalid or has expired."
      );
      setInvalidToken(true);
      return;
    }
    setDone(true);
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-95">
        <Link className="mb-10 flex flex-col items-center gap-3" href="/">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </Link>

        <div className="rounded-xl border border-base-300 bg-base-100 px-8 py-8">
          {done ? (
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
                Password updated
              </h1>
              <p className="mb-6 text-sm text-base-content/70">
                Sign in with your new password.
              </p>
              <Button
                className="w-full"
                onClick={() => router.replace("/auth/login")}
              >
                Go to sign in
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-7">
                <h1 className="text-xl font-bold text-base-content">
                  Set a new password
                </h1>
                <p className="mt-1 text-sm text-base-content/70">
                  Choose a new password for your account.
                </p>
              </div>

              <form className="space-y-4" noValidate onSubmit={onSubmit}>
                <div>
                  <Label
                    className="mb-1.5 block text-sm font-medium text-base-content"
                    htmlFor="password"
                  >
                    New password
                  </Label>
                  <Input
                    autoComplete="new-password"
                    className="w-full focus-visible:border-primary"
                    id="password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    type="password"
                    value={password}
                  />
                </div>

                {error && (
                  <p className="rounded-sm border border-error/20 bg-error/5 px-3.5 py-2.5 text-sm text-error">
                    {error}
                    {invalidToken && (
                      <>
                        {" "}
                        <Link
                          className="font-medium underline underline-offset-2"
                          href="/auth/forgot-password"
                        >
                          Request a new one
                        </Link>
                        .
                      </>
                    )}
                  </p>
                )}

                <Button
                  className="w-full"
                  disabled={submitting || invalidToken}
                  size="default"
                  type="submit"
                >
                  {submitting && <Loader2 className="size-4 animate-spin" />}
                  {submitting ? "Saving…" : "Save new password"}
                </Button>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
