"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationSettingsSummary } from "@/lib/integration-settings";
import { IntegrationCard } from "./integration-card";
import { SecretInput } from "./secret-input";

type Google = IntegrationSettingsSummary["google"];

interface Props {
  collapsible?: boolean;
  defaultOpen?: boolean;
  initial: Google;
}

export function GoogleOAuthSettingsForm({
  initial,
  collapsible,
  defaultOpen,
}: Props) {
  const [clientId, setClientId] = useState(initial.clientId);
  const [clientSecret, setClientSecret] = useState("");
  const [hasClientSecret, setHasClientSecret] = useState(
    initial.hasClientSecret
  );
  const [saving, setSaving] = useState(false);

  const configured = !!(clientId && hasClientSecret);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/orbit/integration-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          google: { clientId, clientSecret: clientSecret || undefined },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save.");
        return;
      }
      if (clientSecret) {
        setHasClientSecret(true);
      }
      setClientSecret("");
      toast.success(
        "Google OAuth settings saved — a restart is needed for sign-in to pick this up."
      );
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <IntegrationCard
      collapsible={collapsible}
      configured={configured}
      defaultOpen={defaultOpen}
      description="Lets users sign in with Google — see Authentication settings to turn the method on/off once it's configured."
      note="After saving, restart the app for these credentials to take effect — Google sign-in is read once at startup, unlike the other settings on this page."
      onSave={save}
      saving={saving}
      title="Google OAuth"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="google-client-id">Client ID</Label>
          <Input
            disabled={saving}
            id="google-client-id"
            onChange={(e) => setClientId(e.target.value)}
            value={clientId}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="google-client-secret">Client secret</Label>
          <SecretInput
            disabled={saving}
            hasSavedValue={hasClientSecret}
            id="google-client-secret"
            onChange={setClientSecret}
            value={clientSecret}
          />
        </div>
      </div>
    </IntegrationCard>
  );
}
