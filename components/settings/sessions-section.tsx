"use client";

import {
  Clock,
  Globe,
  Info,
  LogOut,
  Monitor,
  Shield,
  Smartphone,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/client";

interface SessionRow {
  createdAt: Date;
  expiresAt: Date;
  id: string;
  ipAddress: string | null;
  token: string;
  userAgent: string | null;
}
interface Props {
  currentToken: string;
  sessions: SessionRow[];
}

function browser(ua: string | null) {
  if (!ua) {
    return "Unknown browser";
  }
  if (/edg/i.test(ua)) {
    return "Edge";
  }
  if (/chrome/i.test(ua) && !/edg/i.test(ua)) {
    return "Chrome";
  }
  if (/firefox/i.test(ua)) {
    return "Firefox";
  }
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    return "Safari";
  }
  return "Browser";
}
function osName(ua: string | null) {
  if (!ua) {
    return "";
  }
  if (/windows/i.test(ua)) {
    return "Windows";
  }
  if (/macintosh/i.test(ua)) {
    return "macOS";
  }
  if (/linux/i.test(ua)) {
    return "Linux";
  }
  if (/android/i.test(ua)) {
    return "Android";
  }
  if (/iphone|ipad/i.test(ua)) {
    return "iOS";
  }
  return "";
}
function isMobile(ua: string | null) {
  return /android|iphone|ipad/i.test(ua ?? "");
}
function ago(d: Date) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) {
    return "just now";
  }
  const m = Math.floor(s / 60);
  if (m < 60) {
    return `${m}m ago`;
  }
  const h = Math.floor(m / 60);
  if (h < 24) {
    return `${h}h ago`;
  }
  const days = Math.floor(h / 24);
  if (days < 30) {
    return `${days}d ago`;
  }
  return new Date(d).toLocaleDateString();
}

export function SessionsSection({ sessions: init, currentToken }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState(init);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function revoke(id: string, token: string) {
    setRevoking(id);
    try {
      const r = await fetch("/api/auth/revoke-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (r.ok) {
        setSessions((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      /* no-op */
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll() {
    setRevokingAll(true);
    try {
      const r = await fetch("/api/auth/revoke-other-sessions", {
        method: "POST",
      });
      if (r.ok) {
        setSessions((prev) => prev.filter((s) => s.token === currentToken));
      }
    } catch {
      /* no-op */
    } finally {
      setRevokingAll(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut({ fetchOptions: { onSuccess: () => router.push("/login") } });
  }

  const current = sessions.find((s) => s.token === currentToken);
  const others = sessions.filter((s) => s.token !== currentToken);

  return (
    <div className="mx-auto max-w-195 px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6 md:pb-10">
      {/* ── Current session ── */}
      {current && (
        <div className="mb-7">
          <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
            Current session
          </p>
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
            <SessionCard
              isCurrent
              onSignOut={handleSignOut}
              s={current}
              signingOut={signingOut}
            />
          </div>
        </div>
      )}

      {/* ── Other sessions ── */}
      {others.length > 0 && (
        <div className="mb-7">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold tracking-wide text-base-content/70">
              Other sessions
              <span className="ml-2 rounded-xs bg-base-200 px-2 py-0.5 text-xs font-bold text-base-content/70">
                {others.length}
              </span>
            </p>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  className="flex items-center gap-1.5 text-error hover:text-error hover:bg-error/10 h-auto px-2 py-1"
                  disabled={revokingAll}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X size={14} />
                  {revokingAll ? "Revoking…" : "Revoke all"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Revoke all other sessions?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    All other devices will be signed out immediately.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={revokeAll}>
                    Revoke all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
            {others.map((s, i) => (
              <div
                className={
                  i < others.length - 1 ? "border-b border-base-300" : ""
                }
                key={s.id}
              >
                <SessionCard
                  onRevoke={() => revoke(s.id, s.token)}
                  revoking={revoking === s.id}
                  s={s}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {sessions.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex size-14 items-center justify-center rounded-md bg-primary/10">
            <Shield className="text-primary" size={28} />
          </div>
          <p className="text-sm font-semibold text-base-content">
            No active sessions
          </p>
          <p className="text-sm text-base-content/70">
            Sign in again to see your sessions here.
          </p>
        </div>
      )}

      {/* ── Security tip ── */}
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="flex items-start gap-4 px-5 py-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm bg-primary/10">
            <Info className="text-primary" size={16} />
          </div>
          <div>
            <p className="text-sm font-semibold text-base-content">
              Security tip
            </p>
            <p className="mt-0.5 text-xs text-base-content/70">
              If you see an unfamiliar session, revoke it immediately and update
              your credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Session card ─────────────────────────────────────────── */
function SessionCard({
  s,
  isCurrent,
  revoking,
  onRevoke,
  signingOut,
  onSignOut,
}: {
  s: SessionRow;
  isCurrent?: boolean;
  revoking?: boolean;
  onRevoke?: () => void;
  signingOut?: boolean;
  onSignOut?: () => void;
}) {
  const b = browser(s.userAgent);
  const os = osName(s.userAgent);
  const mob = isMobile(s.userAgent);

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      {/* Device icon */}
      <div
        className={`flex size-11 shrink-0 items-center justify-center rounded-md ${isCurrent ? "bg-primary/10" : "bg-base-200/50"}`}
      >
        {mob ? (
          <Smartphone
            className={isCurrent ? "text-primary" : "text-base-content/70"}
            size={20}
          />
        ) : (
          <Monitor
            className={isCurrent ? "text-primary" : "text-base-content/70"}
            size={20}
          />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-base-content">{b}</p>
          {os && <span className="text-sm text-base-content/70">on {os}</span>}
          {isCurrent && (
            <Badge
              className="rounded-xs px-2.5 py-0.5 text-xs font-bold"
              variant="secondary"
            >
              ● This device
            </Badge>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-base-content/70">
          {s.ipAddress && (
            <span className="flex items-center gap-1">
              <Globe size={12} />
              {s.ipAddress}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {isCurrent ? "Active now" : `Signed in ${ago(s.createdAt)}`}
          </span>
        </div>
      </div>

      {/* Sign out current device */}
      {isCurrent && onSignOut && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="shrink-0 flex items-center gap-1.5 hover:border-error/30 hover:bg-error/10 hover:text-error"
              disabled={signingOut}
              size="sm"
              type="button"
              variant="outline"
            >
              <LogOut size={13} />
              {signingOut ? "Signing out…" : "Sign out"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Sign out of this device?</AlertDialogTitle>
              <AlertDialogDescription>
                You will be signed out of {b}
                {os ? ` on ${os}` : ""} and redirected to the login page.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onSignOut}>
                Sign out
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Revoke other device */}
      {!isCurrent && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              className="shrink-0 hover:border-error/30 hover:bg-error/10 hover:text-error"
              disabled={revoking}
              size="sm"
              type="button"
              variant="outline"
            >
              {revoking ? "…" : "Revoke"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke this session?</AlertDialogTitle>
              <AlertDialogDescription>
                {b}
                {os ? ` on ${os}` : ""} will be signed out immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onRevoke}>Revoke</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
