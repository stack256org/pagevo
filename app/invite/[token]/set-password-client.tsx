"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { passwordError } from "@/lib/auth/password";

type Props = {
  token: string;
  workspaceName: string;
  workspaceIcon: string | null;
  role: string;
  invitedEmail: string | null;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Member",
  viewer: "Viewer",
};

export function SetPasswordAcceptClient({
  token,
  workspaceName,
  workspaceIcon,
  role,
  invitedEmail,
}: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // Checked here as well as server-side so the requirement surfaces
    // immediately instead of after a round-trip.
    const strengthError = passwordError(password);
    if (strengthError) {
      setError(strengthError);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/set-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        workspaceSlug?: string | null;
        needsLogin?: boolean;
      };
      if (!res.ok) {
        setError(data.error ?? "Failed to accept invite");
        return;
      }
      if (data.needsLogin || !data.workspaceSlug) {
        router.replace(`/auth/login?next=/invite/${token}`);
        return;
      }
      router.replace(`/app/${data.workspaceSlug}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            {workspaceIcon && (
              <span className="mb-2 block text-4xl">{workspaceIcon}</span>
            )}
            <CardTitle>Join {workspaceName}</CardTitle>
            <CardDescription>
              You&apos;ve been invited
              {invitedEmail ? (
                <>
                  {" "}
                  as <strong>{invitedEmail}</strong>
                </>
              ) : null}{" "}
              to join as <strong>{ROLE_LABELS[role] ?? role}</strong>. Set a
              password to finish creating your account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-3" onSubmit={submit}>
              {error && (
                <p className="rounded bg-error/10 p-3 text-sm text-error">
                  {error}
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="name">Your name</Label>
                <Input
                  autoComplete="name"
                  id="name"
                  maxLength={80}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Doe"
                  required
                  value={name}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  autoComplete="new-password"
                  id="password"
                  maxLength={128}
                  minLength={8}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  type="password"
                  value={password}
                />
              </div>
              <Button className="w-full" disabled={loading} type="submit">
                {loading ? "Joining…" : `Set password & join ${workspaceName}`}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
