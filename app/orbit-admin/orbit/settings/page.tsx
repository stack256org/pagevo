"use client";

import { Check, KeyRound, Link2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface AuthSettingsState {
  emailPasswordEnabled: boolean;
  googleConfigured: boolean;
  googleEnabled: boolean;
  magicLinkEnabled: boolean;
}

type AuthSettingsKey =
  | "emailPasswordEnabled"
  | "magicLinkEnabled"
  | "googleEnabled";

const GoogleIcon = () => (
  <svg className="size-4" viewBox="0 0 24 24">
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

export default function OrbitAuthSettingsPage() {
  const [settings, setSettings] = useState<AuthSettingsState | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<AuthSettingsKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/orbit/auth-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) {
          return;
        }
        setSettings({
          emailPasswordEnabled: d.emailPasswordEnabled,
          magicLinkEnabled: d.magicLinkEnabled,
          googleEnabled: d.googleEnabled,
          googleConfigured: d.googleConfigured,
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggle(key: AuthSettingsKey, value: boolean) {
    if (!settings) {
      return;
    }
    setError(null);
    const previous = settings;
    setSettings({ ...settings, [key]: value });
    setSavingKey(key);
    setSaved(false);
    try {
      const res = await fetch("/api/orbit/auth-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSettings(previous);
        setError(data.error ?? "Couldn't save that change.");
        return;
      }
      setSettings({
        emailPasswordEnabled: data.emailPasswordEnabled,
        magicLinkEnabled: data.magicLinkEnabled,
        googleEnabled: data.googleEnabled,
        googleConfigured: data.googleConfigured,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSettings(previous);
      setError("Couldn't save that change. Try again.");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="animate-spin text-base-content/70" size={24} />
      </div>
    );
  }

  if (!settings) {
    return (
      <p className="text-sm text-error">
        Couldn't load authentication settings.
      </p>
    );
  }

  const enabledCount = [
    settings.emailPasswordEnabled,
    settings.magicLinkEnabled,
    settings.googleEnabled,
  ].filter(Boolean).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-base-content">
            Authentication
          </h1>
          <p className="mt-1 text-sm text-base-content/70">
            Choose which sign-in methods are offered on this instance. Changes
            apply immediately, no restart needed.
          </p>
        </div>
        {saved && (
          <span className="flex shrink-0 items-center gap-1.5 text-sm text-base-content/70">
            <Check size={14} />
            Saved
          </span>
        )}
      </div>

      {error && (
        <p className="rounded-sm border border-error/20 bg-error/5 px-3.5 py-2.5 text-sm text-error">
          {error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
        {/* Email + password — primary method */}
        <div className="flex items-center gap-4 border-b border-base-300 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <KeyRound className="text-primary" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold text-base-content">
                Email &amp; Password
              </Label>
              <span className="rounded-xs bg-base-200 px-2 py-0.5 text-xs font-bold text-base-content/70">
                Primary
              </span>
            </div>
            <p className="mt-0.5 text-xs text-base-content/70">
              The default sign-in method — needs no external service.
            </p>
          </div>
          <Switch
            aria-label="Toggle email and password sign-in"
            checked={settings.emailPasswordEnabled}
            disabled={
              savingKey === "emailPasswordEnabled" ||
              (enabledCount === 1 && settings.emailPasswordEnabled)
            }
            onCheckedChange={(checked) =>
              toggle("emailPasswordEnabled", checked)
            }
          />
        </div>

        {/* Magic link — optional */}
        <div className="flex items-center gap-4 border-b border-base-300 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-base-200/50">
            <Link2 className="text-base-content/70" size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <Label className="text-sm font-semibold text-base-content">
              Magic Link
            </Label>
            <p className="mt-0.5 text-xs text-base-content/70">
              Passwordless email sign-in — optional.
            </p>
          </div>
          <Switch
            aria-label="Toggle magic-link sign-in"
            checked={settings.magicLinkEnabled}
            disabled={
              savingKey === "magicLinkEnabled" ||
              (enabledCount === 1 && settings.magicLinkEnabled)
            }
            onCheckedChange={(checked) => toggle("magicLinkEnabled", checked)}
          />
        </div>

        {/* Google — optional, gated by env credentials */}
        <div className="flex items-center gap-4 p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-base-200/50">
            <GoogleIcon />
          </div>
          <div className="min-w-0 flex-1">
            <Label className="text-sm font-semibold text-base-content">
              Google
            </Label>
            <p className="mt-0.5 text-xs text-base-content/70">
              {settings.googleConfigured
                ? "Sign in with a Google account — optional."
                : "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable."}
            </p>
          </div>
          <Switch
            aria-label="Toggle Google sign-in"
            checked={settings.googleEnabled && settings.googleConfigured}
            disabled={
              savingKey === "googleEnabled" ||
              !settings.googleConfigured ||
              (enabledCount === 1 && settings.googleEnabled)
            }
            onCheckedChange={(checked) => toggle("googleEnabled", checked)}
          />
        </div>
      </div>

      <p className="text-xs text-base-content/70">
        At least one method must stay enabled — the last remaining one can't be
        turned off, so you can never lock yourself out.
      </p>
    </div>
  );
}
