"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function EmailRetryButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function retry() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/orbit/email/${id}/retry`, {
        method: "POST",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Failed to retry");
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="inline-flex items-center gap-1 rounded-xs border border-base-300 px-2 py-1 text-xs font-medium text-base-content/70 transition-colors hover:bg-base-200 hover:text-base-content disabled:opacity-50"
        disabled={busy}
        onClick={retry}
        type="button"
      >
        <RotateCcw className={busy ? "animate-spin" : ""} size={11} />
        {busy ? "Retrying…" : "Retry"}
      </button>
      {error && <p className="text-2xs text-error">{error}</p>}
    </div>
  );
}
