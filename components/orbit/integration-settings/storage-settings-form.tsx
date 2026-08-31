"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IntegrationSettingsSummary } from "@/lib/integration-settings";
import { IntegrationCard } from "./integration-card";
import { SecretInput } from "./secret-input";

type Storage = IntegrationSettingsSummary["storage"];

const DRIVER_OPTIONS = [
  { value: "local", label: "Local disk" },
  { value: "s3", label: "S3-compatible (AWS S3, MinIO)" },
  { value: "r2", label: "Cloudflare R2" },
] as const;

interface Props {
  collapsible?: boolean;
  defaultOpen?: boolean;
  initial: Storage;
}

export function StorageSettingsForm({
  initial,
  collapsible,
  defaultOpen,
}: Props) {
  const [driver, setDriver] = useState(initial.driver);
  const [endpoint, setEndpoint] = useState(initial.endpoint);
  const [bucket, setBucket] = useState(initial.bucket);
  const [region, setRegion] = useState(initial.region);
  const [accessKeyId, setAccessKeyId] = useState(initial.accessKeyId);
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [hasSecretAccessKey, setHasSecretAccessKey] = useState(
    initial.hasSecretAccessKey
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const configured =
    driver === "local" || !!(bucket && accessKeyId && hasSecretAccessKey);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/orbit/integration-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storage: {
            driver,
            endpoint,
            bucket,
            region,
            accessKeyId,
            secretAccessKey: secretAccessKey || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save.");
        return;
      }
      if (secretAccessKey) {
        setHasSecretAccessKey(true);
      }
      setSecretAccessKey("");
      toast.success("Storage settings saved.");
    } catch {
      toast.error("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const res = await fetch("/api/orbit/integration-settings/test-storage", {
        method: "POST",
      });
      const data = await res.json().catch(() => ({ ok: false }));
      if (data.ok) {
        toast.success("Storage connection works.");
      } else {
        toast.error(data.error ?? "Storage connection failed.");
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
      description="Where uploaded files (covers, avatars, attachments) are stored. Defaults to local disk. Files are always served through the app itself — no public bucket access needed."
      note={
        driver === "local"
          ? undefined
          : "Uploads still go directly from the browser to your bucket, so it needs a CORS policy allowing PUT from this app's origin — see the self-hosting guide."
      }
      onSave={save}
      onTest={test}
      saving={saving}
      testing={testing}
      testLabel="Test connection"
      title="File storage"
    >
      <div className="space-y-1.5">
        <Label htmlFor="storage-driver">Driver</Label>
        <Select
          disabled={saving}
          onValueChange={(v) => setDriver(v as "local" | "s3" | "r2")}
          value={driver}
        >
          <SelectTrigger id="storage-driver">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DRIVER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {driver !== "local" && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="storage-bucket">Bucket</Label>
              <Input
                disabled={saving}
                id="storage-bucket"
                onChange={(e) => setBucket(e.target.value)}
                value={bucket}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage-region">Region</Label>
              <Input
                disabled={saving}
                id="storage-region"
                onChange={(e) => setRegion(e.target.value)}
                placeholder="auto"
                value={region}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="storage-endpoint">Endpoint</Label>
            <Input
              disabled={saving}
              id="storage-endpoint"
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="leave blank for AWS; set for R2 / MinIO"
              value={endpoint}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="storage-access-key">Access key ID</Label>
              <Input
                disabled={saving}
                id="storage-access-key"
                onChange={(e) => setAccessKeyId(e.target.value)}
                value={accessKeyId}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="storage-secret-key">Secret access key</Label>
              <SecretInput
                disabled={saving}
                hasSavedValue={hasSecretAccessKey}
                id="storage-secret-key"
                onChange={setSecretAccessKey}
                value={secretAccessKey}
              />
            </div>
          </div>
        </>
      )}
    </IntegrationCard>
  );
}
