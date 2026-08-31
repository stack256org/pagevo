"use client";

import Link from "next/link";
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
import { Logo } from "@/components/ui/logo";

type Props = {
  token: string;
  workspaceName: string;
  workspaceIcon: string | null;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  editor: "Member",
  viewer: "Viewer",
};

export function AcceptInviteClient({
  token,
  workspaceName,
  workspaceIcon,
  role,
}: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Failed to accept invite"
        );
        return;
      }
      const data = (await res.json()) as { workspaceSlug?: string };
      router.replace(
        data.workspaceSlug
          ? `/app/${data.workspaceSlug}`
          : "/platform/post-auth"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md">
        <Link className="mb-10 flex flex-col items-center gap-3" href="/">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </Link>
        <Card>
          <CardHeader className="text-center">
            {workspaceIcon && (
              <span className="mb-2 block text-4xl">{workspaceIcon}</span>
            )}
            <CardTitle>Join {workspaceName}</CardTitle>
            <CardDescription>
              You&apos;ve been invited to join as{" "}
              <strong>{ROLE_LABELS[role] ?? role}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <p className="rounded bg-error/10 p-3 text-error text-sm">
                {error}
              </p>
            )}
            <Button className="w-full" disabled={loading} onClick={accept}>
              {loading ? "Joining..." : `Accept and join ${workspaceName}`}
            </Button>
            <Button
              className="w-full"
              disabled={loading}
              onClick={() => router.replace("/platform/post-auth")}
              variant="ghost"
            >
              Decline
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
