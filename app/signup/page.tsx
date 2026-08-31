import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { isRegistrationAllowed } from "@/lib/auth/registration";
import { env } from "@/lib/env";

export const metadata = { title: "Sign up" };

// Forces per-request evaluation — without it Next.js would statically evaluate
// isRegistrationAllowed() at build time, baking in a stale answer and needing DB access during `next build`.
export const dynamic = "force-dynamic";

// No standalone signup form exists; this route just redirects to /auth/login when registration
// is open, or explains why it isn't.
export default async function SignupPage() {
  if (await isRegistrationAllowed()) {
    redirect("/auth/login");
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-95">
        <Link className="mb-10 flex flex-col items-center gap-3" href="/">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </Link>

        <div className="rounded-xl border border-base-300 bg-base-100 px-8 py-8 text-center">
          <h1 className="mb-2 text-xl font-bold text-base-content">
            Registration is disabled
          </h1>
          <p className="mb-7 text-sm text-base-content/70">
            This Pagevo instance uses invite-only registration. Ask your
            administrator to send you an invitation.
          </p>

          <div className="space-y-2.5">
            <Button asChild className="w-full" size="default">
              <Link href="/auth/login">Go to Sign In</Link>
            </Button>
            {env.NEXT_PUBLIC_SHOW_LANDING_PAGE && (
              <Button
                asChild
                className="w-full bg-base-200/40"
                size="default"
                variant="outline"
              >
                <Link href="/">Back to Home</Link>
              </Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
