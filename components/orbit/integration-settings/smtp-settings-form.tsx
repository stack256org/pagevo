"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IntegrationSettingsSummary } from "@/lib/integration-settings";
import { IntegrationCard } from "./integration-card";
import { SecretInput } from "./secret-input";

type Smtp = IntegrationSettingsSummary["smtp"];

interface Props {
  collapsible?: boolean;
  defaultOpen?: boolean;
  initial: Smtp;
}

export function SmtpSettingsForm({ initial, collapsible, defaultOpen }: Props) {
  const [host, setHost] = useState(initial.host);
  const [port, setPort] = useState(String(initial.port));
  const [user, setUser] = useState(initial.user);
  const [pass, setPass] = useState("");
  const [from, setFrom] = useState(initial.from);
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const configured = !!(host && user && from && hasPassword);

  async function save() {
    setSaving(true);
    try {
      const portNum = Number.parseInt(port, 10);
      const res = await fetch("/api/orbit/integration-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          smtp: {
            host,
            port: Number.isFinite(portNum) ? portNum : undefined,
            user,
            from,
            pass: pass || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save.");
        return;
      }
      if (pass) {
        setHasPassword(true);
      }
      setPass("");
      toast.success("SMTP settings saved.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/orbit/integration-settings/test-email", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        toast.success("Test email sent — check your inbox.");
      } else {
        toast.error(data.error ?? "Failed to send test email.");
      }
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <IntegrationCard
      collapsible={collapsible}
      configured={configured}
      defaultOpen={defaultOpen}
      description="Send invite emails, magic links, and password resets. Without it, emails are logged instead of delivered."
      onSave={save}
      onTest={test}
      saving={saving}
      testing={testing}
      testLabel="Send test email"
      title="Email (SMTP)"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="smtp-host">Host</Label>
          <Input
            disabled={saving}
            id="smtp-host"
            onChange={(e) => setHost(e.target.value)}
            placeholder="smtp.example.com"
            value={host}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-port">Port</Label>
          <Input
            disabled={saving}
            id="smtp-port"
            inputMode="numeric"
            onChange={(e) => setPort(e.target.value)}
            placeholder="587"
            value={port}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="smtp-user">Username</Label>
          <Input
            disabled={saving}
            id="smtp-user"
            onChange={(e) => setUser(e.target.value)}
            value={user}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="smtp-pass">Password</Label>
          <SecretInput
            disabled={saving}
            hasSavedValue={hasPassword}
            id="smtp-pass"
            onChange={setPass}
            value={pass}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="smtp-from">From address</Label>
        <Input
          disabled={saving}
          id="smtp-from"
          onChange={(e) => setFrom(e.target.value)}
          placeholder="team@example.com"
          value={from}
        />
      </div>
    </IntegrationCard>
  );
}
