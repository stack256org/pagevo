"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PageIcon } from "@/components/pages/page-icon";
import { useSession } from "@/lib/auth/client";

interface InvitationData {
  accessLevel: string;
  email: string;
  expiresAt: string;
  id: string;
  page: { id: string; title: string; icon: string | null };
}

const ACCESS_LABELS: Record<string, string> = {
  full_access: "Full Access",
  can_edit: "Can Edit",
  can_comment: "Can Comment",
  can_view: "Can View",
};

export default function GuestInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { data: session, isPending: sessionPending } = useSession();

  const [state, setState] = useState<
    "loading" | "ready" | "accepting" | "error" | "expired" | "accepted"
  >("loading");
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Guest bypass (doc/CLAUDE.md Onboarding): an unauthenticated visitor must
  // sign in first — otherwise "Accept" 401s against the API with no way to
  // recover. Route them through login and straight back here.
  useEffect(() => {
    if (!sessionPending && !session) {
      router.replace(
        `/auth/login?next=${encodeURIComponent(`/invite/guest/${token}`)}`
      );
    }
  }, [sessionPending, session, token, router]);

  useEffect(() => {
    if (sessionPending || !session) {
      return;
    }
    fetch(`/api/invite/guest/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          if (data.error.includes("expired")) {
            setState("expired");
            return;
          }
          if (data.error.includes("accepted")) {
            setState("accepted");
            return;
          }
          setErrorMsg(data.error);
          setState("error");
          return;
        }
        setInvitation(data.invitation);
        setState("ready");
      })
      .catch(() => {
        setErrorMsg("Could not load invitation.");
        setState("error");
      });
  }, [token, sessionPending, session]);

  async function accept() {
    setState("accepting");
    const res = await fetch(`/api/invite/guest/${token}`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setErrorMsg(data.error ?? "Failed to accept invitation.");
      setState("error");
      return;
    }
    router.push(`/app/${data.workspaceSlug}/${data.shortId}`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-4">
      <div className="w-full max-w-md rounded-lg border border-base-300 bg-base-100 p-8">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <span className="text-2xl font-black tracking-tight text-base-content">
            PAGEVO
          </span>
        </div>

        {state === "loading" && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-base-300 border-t-primary" />
          </div>
        )}

        {state === "ready" && invitation && (
          <>
            <div className="mb-6 text-center">
              <div className="mb-3 flex justify-center">
                <PageIcon icon={invitation.page.icon ?? "📄"} size={36} />
              </div>
              <h1 className="text-xl font-bold text-base-content">
                You've been invited
              </h1>
              <p className="mt-1 text-sm text-base-content/70">
                to access{" "}
                <span className="font-semibold text-base-content">
                  {invitation.page.title || "Untitled"}
                </span>
              </p>
            </div>

            <div className="mb-6 rounded-lg border border-base-300 bg-base-200 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-base-content/70">Invited email</span>
                <span className="font-medium text-base-content">
                  {invitation.email}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-base-content/70">Access level</span>
                <span className="font-medium text-base-content">
                  {ACCESS_LABELS[invitation.accessLevel] ??
                    invitation.accessLevel}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-base-content/70">Expires</span>
                <span className="font-medium text-base-content">
                  {new Date(invitation.expiresAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>

            <button
              className="w-full rounded-sm bg-primary px-4 py-3 text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90"
              onClick={accept}
              type="button"
            >
              Accept invitation
            </button>

            <p className="mt-4 text-center text-xs text-base-content/70">
              Make sure you're signed in with{" "}
              <span className="font-medium">{invitation.email}</span> before
              accepting.
            </p>
          </>
        )}

        {state === "accepting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-base-300 border-t-primary" />
            <p className="text-sm text-base-content/70">
              Accepting invitation…
            </p>
          </div>
        )}

        {state === "expired" && (
          <div className="py-4 text-center">
            <div className="mb-3 text-4xl">⏰</div>
            <h2 className="text-lg font-semibold text-base-content">
              Invitation expired
            </h2>
            <p className="mt-1 text-sm text-base-content/70">
              This invitation link has expired. Ask the page owner to send a new
              one.
            </p>
          </div>
        )}

        {state === "accepted" && (
          <div className="py-4 text-center">
            <div className="mb-3 text-4xl">✅</div>
            <h2 className="text-lg font-semibold text-base-content">
              Already accepted
            </h2>
            <p className="mt-1 text-sm text-base-content/70">
              This invitation has already been accepted.{" "}
              <a className="text-primary hover:underline" href="/app">
                Go to your workspace →
              </a>
            </p>
          </div>
        )}

        {state === "error" && (
          <div className="py-4 text-center">
            <div className="mb-3 text-4xl">⚠️</div>
            <h2 className="text-lg font-semibold text-base-content">
              Something went wrong
            </h2>
            <p className="mt-1 text-sm text-base-content/70">{errorMsg}</p>
            <a
              className="mt-4 inline-block text-sm text-primary hover:underline"
              href="/app"
            >
              Back to workspace
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
