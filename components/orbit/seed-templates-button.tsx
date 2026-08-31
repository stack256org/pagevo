"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

export function SeedTemplatesButton({
  currentCount,
}: {
  currentCount: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function seed(force = false) {
    setLoading(true);
    setDone(false);
    setError("");
    try {
      const res = await fetch("/api/orbit/templates/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      if (res.ok) {
        setDone(true);
        router.refresh();
      } else {
        const d = await res.json().catch(() => ({}));
        setError((d as { error?: string }).error ?? "Failed to seed templates");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  if (currentCount >= 18) {
    return (
      <div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-base-content/70">
            ✓ {currentCount} built-in templates seeded
          </span>
          <button
            className="inline-flex items-center gap-1.5 rounded-sm border border-warning/30 bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning transition-colors hover:bg-warning/20 disabled:opacity-50"
            disabled={loading}
            onClick={() => setConfirmOpen(true)}
            type="button"
          >
            {loading ? "Resetting…" : done ? "✓ Done" : "↺ Reset & Re-seed"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-error">{error}</p>}

        <ConfirmDialog
          confirmLabel="Reset & re-seed"
          confirmLoadingLabel="Resetting…"
          description="This will delete all existing built-in templates and re-seed fresh copies. This cannot be undone."
          loading={loading}
          onConfirm={() => seed(true)}
          onOpenChange={setConfirmOpen}
          open={confirmOpen}
          title="Reset and re-seed built-in templates?"
        />
      </div>
    );
  }

  return (
    <div>
      <button
        className="inline-flex items-center gap-2 rounded-sm border border-base-300 bg-base-200 px-4 py-2 text-sm font-medium text-base-content transition-colors hover:bg-base-200/80 disabled:opacity-50"
        disabled={loading || done}
        onClick={() => seed(false)}
        type="button"
      >
        {loading
          ? "Seeding…"
          : done
            ? "✓ Done"
            : "⚡ Seed 18 default templates"}
      </button>
      {error && <p className="mt-2 text-xs text-error">{error}</p>}
    </div>
  );
}
