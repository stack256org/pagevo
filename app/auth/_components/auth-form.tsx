"use client";

import { Eye, EyeOff, KeyRound, Link2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/ui/logo";
import { PRODUCT_NAME } from "@/config/platform";
import { signIn, signUp, useSession } from "@/lib/auth/client";
import { passwordError } from "@/lib/auth/password";

interface AuthMethods {
  allowPublicRegistration: boolean;
  emailPassword: boolean;
  google: boolean;
  isBootstrap: boolean;
  magicLink: boolean;
  smtpConfigured: boolean;
}

export function AuthForm() {
  return (
    <Suspense fallback={null}>
      <AuthFormInner />
    </Suspense>
  );
}

// better-auth's own request-validation errors (e.g. an invalid email format
// caught by its Zod schema before the request even reaches our handler) come
// back prefixed with the failing field path, like "[body.email] Invalid
// email address" — strip that so users only ever see the human-readable part.
function cleanAuthErrorMessage(
  message: string | null | undefined
): string | undefined {
  if (!message) {
    return;
  }
  return message.replace(/^\[[^\]]+\]\s*/, "");
}

// Better Auth redirects with `?error=<code>` on rejected magic-link/OAuth callbacks. Only
// "registration_disabled" is ours (lib/auth/index.ts); the rest are Better Auth's own codes, kept as a fallback.
const REGISTRATION_ERROR_MESSAGES: Record<string, string> = {
  registration_disabled:
    "This instance is invite-only. Ask an administrator for an invitation.",
  failed_to_create_user:
    "This instance is invite-only. Ask an administrator for an invitation.",
  unable_to_create_user:
    "This instance is invite-only. Ask an administrator for an invitation.",
};

function mapAuthErrorParam(code: string | null): string | null {
  if (!code) {
    return null;
  }
  return (
    REGISTRATION_ERROR_MESSAGES[code] ??
    "Something went wrong. Please try again."
  );
}

function GoogleIcon() {
  return (
    <svg className="size-4.5 shrink-0" viewBox="0 0 24 24">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AuthFormInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = useSession();

  const [methods, setMethods] = useState<AuthMethods | null>(null);
  const [methodsError, setMethodsError] = useState(false);
  const [view, setView] = useState<"password" | "magic-link">("password");
  // Only meaningful once bootstrap is done and ALLOW_PUBLIC_REGISTRATION is
  // on — lets a returning-instance login page also offer self-serve signup.
  const [wantsSignup, setWantsSignup] = useState(false);

  const [name, setName] = useState("");
  const [email, setEmail] = useState(searchParams.get("hint") ?? "");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState<string | null>(() =>
    mapAuthErrorParam(searchParams.get("error"))
  );
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const callbackURL = searchParams.get("next") ?? "/platform/post-auth";

  useEffect(() => {
    if (session) {
      router.replace(callbackURL);
    }
  }, [router, session, callbackURL]);

  useEffect(() => {
    fetch("/api/auth/methods")
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("methods request failed"))
      )
      .then((data: AuthMethods) => {
        setMethods(data);
        // Default to whichever credential method is actually available —
        // password is preferred (it's the primary method), fall back to
        // magic link if password sign-in is disabled on this instance.
        // Irrelevant during bootstrap, where password is the only option.
        if (!data.isBootstrap && !data.emailPassword && data.magicLink) {
          setView("magic-link");
        }
      })
      .catch(() => setMethodsError(true));
  }, []);

  if (isPending || session) {
    return null;
  }

  if (methodsError) {
    return (
      <main className="grid min-h-screen place-items-center bg-base-200 px-4">
        <div className="w-full max-w-95 text-center">
          <div className="rounded-xl border border-base-300 bg-base-100 px-8 py-8">
            <h1 className="mb-2 text-xl font-bold text-base-content">
              Can&rsquo;t reach the sign-in service
            </h1>
            <p className="mb-6 text-sm text-base-content/70">
              This usually means the database hasn&rsquo;t been migrated yet
              (run{" "}
              <code className="rounded-xs bg-base-200 px-1 py-0.5 text-xs">
                pnpm db:migrate
              </code>
              ), or the app can&rsquo;t connect to it. Check the server logs,
              then try again.
            </p>
            <Button
              className="w-full"
              onClick={() => window.location.reload()}
              size="default"
              type="button"
            >
              Retry
            </Button>
          </div>
        </div>
      </main>
    );
  }

  if (!methods) {
    return null;
  }

  // Bootstrap always forces password-only signup — no admin exists yet to have set the toggles below.
  const showGoogle = !methods.isBootstrap && methods.google;
  const showMagicLink = !methods.isBootstrap && methods.magicLink;
  const showPassword = methods.isBootstrap || methods.emailPassword;
  const canSwitchCredentialView = showMagicLink && showPassword;
  const activeView = canSwitchCredentialView
    ? view
    : showPassword
      ? "password"
      : "magic-link";
  // Self-serve signup only creates the first account; after that it's invite-only unless
  // ALLOW_PUBLIC_REGISTRATION lets a returning visitor toggle into it.
  const canToggleSignup =
    !methods.isBootstrap && methods.allowPublicRegistration;
  const passwordMode: "signin" | "signup" =
    methods.isBootstrap || (canToggleSignup && wantsSignup)
      ? "signup"
      : "signin";

  async function onMagicLinkSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError("Please enter your work email.");
      return;
    }

    setSubmitting(true);

    const result = await signIn.magicLink({
      callbackURL,
      email: email.trim().toLowerCase(),
      // Without this, a rejected verify (e.g. registration disabled)
      // redirects to `callbackURL` instead of back here — the error would
      // never reach the user.
      errorCallbackURL: "/auth/login",
    });

    setSubmitting(false);
    if (result.error) {
      setError(
        cleanAuthErrorMessage(result.error.message) ??
          "Failed to send magic link."
      );
      return;
    }
    setSent(true);
  }

  async function onPasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (passwordMode === "signup" && !name.trim()) {
      setError("Please enter your full name.");
      return;
    }
    if (!email.trim()) {
      setError("Please enter your work email.");
      return;
    }
    // Only on signup — sign-in must never hint at the policy, since that
    // would tell an attacker which guesses can't be the stored password.
    if (passwordMode === "signup") {
      const strengthError = passwordError(password);
      if (strengthError) {
        setError(strengthError);
        return;
      }
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }

    setSubmitting(true);

    const normalizedEmail = email.trim().toLowerCase();
    const result =
      passwordMode === "signup"
        ? await signUp.email({
            name,
            email: normalizedEmail,
            password,
            callbackURL,
          })
        : await signIn.email({ email: normalizedEmail, password, callbackURL });

    setSubmitting(false);
    if (result.error) {
      setError(
        cleanAuthErrorMessage(result.error.message) ??
          "Something went wrong. Please try again."
      );
      return;
    }
    router.replace(callbackURL);
  }

  async function onGoogleClick() {
    setGoogleLoading(true);
    setError(null);
    try {
      const result = await signIn.social({
        provider: "google",
        callbackURL,
        // Without this, a rejected callback (e.g. registration disabled)
        // redirects to `callbackURL` instead of back here — the error
        // would never reach the user.
        errorCallbackURL: "/auth/login",
        disableRedirect: true,
      });
      if (result?.error) {
        setError(
          cleanAuthErrorMessage(result.error.message) ??
            "Google sign-in failed."
        );
        return;
      }
      const rawUrl = (result?.data as { url?: string } | null)?.url;
      if (rawUrl) {
        const url = new URL(rawUrl);
        url.searchParams.set("prompt", "select_account");
        window.location.href = url.toString();
      } else {
        setError("Couldn't start Google sign-in. Please try again.");
      }
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-95">
        {/* Logo */}
        <Link className="mb-10 flex flex-col items-center gap-3" href="/">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </Link>

        {/* Form area */}
        <div className="rounded-xl border border-base-300 bg-base-100 px-8 py-8">
          {sent ? (
            /* ── Magic link sent state ── */
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
              {methods.smtpConfigured ? (
                <>
                  <h1 className="mb-2 text-xl font-bold text-base-content">
                    Check your inbox
                  </h1>
                  <p className="mb-1 text-sm text-base-content/70">
                    We sent a sign-in link to
                  </p>
                  <p className="mb-7 text-sm font-semibold text-base-content">
                    {email}
                  </p>
                  <p className="mb-6 text-xs text-base-content/70">
                    Open the link in your email to sign in. The link expires in
                    10 minutes.
                  </p>
                </>
              ) : (
                <>
                  <h1 className="mb-2 text-xl font-bold text-base-content">
                    Check the server logs
                  </h1>
                  <p className="mb-1 text-sm text-base-content/70">
                    Email isn't configured on this instance, so no email was
                    actually sent to
                  </p>
                  <p className="mb-7 text-sm font-semibold text-base-content">
                    {email}
                  </p>
                  <p className="mb-6 text-xs text-base-content/70">
                    Your sign-in link was printed to the background worker's
                    console output instead. Copy it from there to sign in.
                  </p>
                </>
              )}
              <Button
                className="w-full"
                onClick={() => setSent(false)}
                size="default"
                type="button"
                variant="outline"
              >
                Use a different email
              </Button>
            </div>
          ) : (
            /* ── Sign-in form ── */
            <>
              <div className="mb-7">
                <h1 className="text-xl font-bold text-base-content">
                  {activeView === "magic-link"
                    ? "Sign in with a magic link"
                    : methods.isBootstrap
                      ? "Create the instance admin account"
                      : passwordMode === "signup"
                        ? "Create your account"
                        : "Welcome back"}
                </h1>
                <p className="mt-1 text-sm text-base-content/70">
                  {activeView === "magic-link"
                    ? "We'll email you a link to sign in — no password needed."
                    : methods.isBootstrap
                      ? `You'll manage this entire ${PRODUCT_NAME} instance as its instance admin.`
                      : passwordMode === "signup"
                        ? `Get started with ${PRODUCT_NAME}.`
                        : `Sign in to your ${PRODUCT_NAME} workspace`}
                </p>
              </div>

              {activeView === "password" && showPassword && (
                <form
                  className="space-y-4"
                  noValidate
                  onSubmit={onPasswordSubmit}
                >
                  {passwordMode === "signup" && (
                    <div>
                      <Label
                        className="mb-1.5 block text-sm font-medium text-base-content"
                        htmlFor="name"
                      >
                        Full name
                      </Label>
                      <Input
                        autoComplete="name"
                        className="w-full focus-visible:border-primary"
                        id="name"
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Jane Cooper"
                        required
                        type="text"
                        value={name}
                      />
                    </div>
                  )}

                  <div>
                    <Label
                      className="mb-1.5 block text-sm font-medium text-base-content"
                      htmlFor="password-email"
                    >
                      Work email
                    </Label>
                    <Input
                      autoComplete="email"
                      className="w-full focus-visible:border-primary"
                      id="password-email"
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@company.com"
                      required
                      type="email"
                      value={email}
                    />
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <Label
                        className="text-sm font-medium text-base-content"
                        htmlFor="password"
                      >
                        Password
                      </Label>
                      {passwordMode === "signin" && (
                        <Link
                          className="text-xs font-medium text-base-content/70 underline underline-offset-2 transition-colors duration-150 hover:text-primary"
                          href="/auth/forgot-password"
                        >
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        autoComplete={
                          passwordMode === "signup"
                            ? "new-password"
                            : "current-password"
                        }
                        className="w-full pr-9 focus-visible:border-primary"
                        id="password"
                        minLength={8}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        type={passwordVisible ? "text" : "password"}
                        value={password}
                      />
                      <button
                        aria-label={
                          passwordVisible ? "Hide password" : "Show password"
                        }
                        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-base-content/70 transition-colors duration-150 hover:text-base-content"
                        onClick={() => setPasswordVisible((v) => !v)}
                        tabIndex={-1}
                        type="button"
                      >
                        {passwordVisible ? (
                          <EyeOff size={16} />
                        ) : (
                          <Eye size={16} />
                        )}
                      </button>
                    </div>
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
                    {submitting
                      ? passwordMode === "signup"
                        ? "Creating account…"
                        : "Signing in…"
                      : passwordMode === "signup"
                        ? "Create account"
                        : "Sign in"}
                  </Button>

                  {canToggleSignup && (
                    <button
                      className="w-full text-center text-xs font-medium text-base-content/70 underline underline-offset-2 transition-colors duration-150 hover:text-primary"
                      onClick={() => {
                        setWantsSignup((v) => !v);
                        setError(null);
                      }}
                      type="button"
                    >
                      {passwordMode === "signup"
                        ? "Already have an account? Sign in"
                        : "New here? Create an account"}
                    </button>
                  )}
                </form>
              )}

              {activeView === "magic-link" && showMagicLink && (
                <form
                  className="space-y-4"
                  noValidate
                  onSubmit={onMagicLinkSubmit}
                >
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
                      required
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
                    {submitting ? "Sending link…" : "Send magic link"}
                  </Button>
                </form>
              )}

              {!showGoogle && !showMagicLink && !showPassword && (
                <p className="rounded-sm border border-error/20 bg-error/5 px-3.5 py-2.5 text-sm text-error">
                  No sign-in methods are currently enabled on this instance.
                  Contact your administrator.
                </p>
              )}

              {/* Alternative methods — always secondary, always at the bottom.
                  Switching between password/magic-link swaps the whole view
                  above (new heading + form) rather than a persistent tab bar. */}
              {(showGoogle ||
                (canSwitchCredentialView &&
                  (showPassword || showMagicLink))) && (
                <>
                  <div className="my-5 flex items-center gap-3">
                    <div className="h-px flex-1 bg-base-300" />
                    <span className="text-xs font-medium text-base-content/70">
                      or
                    </span>
                    <div className="h-px flex-1 bg-base-300" />
                  </div>

                  <div className="space-y-2.5">
                    {showGoogle && (
                      <Button
                        className="flex h-11 w-full items-center justify-center gap-3 bg-base-200/40"
                        disabled={googleLoading}
                        onClick={onGoogleClick}
                        size="default"
                        type="button"
                        variant="outline"
                      >
                        <GoogleIcon />
                        {googleLoading
                          ? "Redirecting…"
                          : "Continue with Google"}
                      </Button>
                    )}

                    {canSwitchCredentialView && activeView === "password" && (
                      <Button
                        className="flex h-11 w-full items-center justify-center gap-2.5 bg-base-200/40"
                        onClick={() => {
                          setView("magic-link");
                          setError(null);
                        }}
                        size="default"
                        type="button"
                        variant="outline"
                      >
                        <Link2 size={16} />
                        Sign in with a magic link
                      </Button>
                    )}

                    {canSwitchCredentialView && activeView === "magic-link" && (
                      <Button
                        className="flex h-11 w-full items-center justify-center gap-2.5 bg-base-200/40"
                        onClick={() => {
                          setView("password");
                          setError(null);
                        }}
                        size="default"
                        type="button"
                        variant="outline"
                      >
                        <KeyRound size={16} />
                        Sign in with a password instead
                      </Button>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-base-content/70">
          By continuing you agree to our{" "}
          <Link
            className="font-medium text-base-content underline underline-offset-2 transition-colors duration-150 hover:text-primary"
            href="/terms"
          >
            Terms
          </Link>{" "}
          and{" "}
          <Link
            className="font-medium text-base-content underline underline-offset-2 transition-colors duration-150 hover:text-primary"
            href="/privacy"
          >
            Privacy Policy
          </Link>
        </p>
      </div>
    </main>
  );
}
