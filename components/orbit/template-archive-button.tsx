"use client";

import { Archive, ArchiveRestore } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";

interface Props {
  currentStatus: string;
  templateId: string;
  templateName: string;
}

export function TemplateArchiveButton({
  templateId,
  templateName,
  currentStatus,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingArchive, setPendingArchive] = useState(false);
  const isArchived = currentStatus === "archived";
  const isPublished = currentStatus === "published";

  async function run(action: "archive" | "unarchive") {
    setBusy(true);
    try {
      const res = await fetch(`/api/orbit/templates/${templateId}/${action}`, {
        method: "PATCH",
      });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <IconTooltipButton
        icon={isArchived ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        label={busy ? "…" : isArchived ? "Unarchive" : "Archive"}
        onClick={() => {
          if (busy) {
            return;
          }
          if (isArchived) {
            run("unarchive");
          } else if (isPublished) {
            setPendingArchive(true);
          } else {
            run("archive");
          }
        }}
      />

      {/* Archiving a live template removes it from every workspace's gallery,
          so it gets the same confirm treatment as unpublish. */}
      <ConfirmDialog
        confirmLabel="Archive"
        confirmLoadingLabel="Archiving…"
        description={
          <>
            &ldquo;{templateName}&rdquo; will disappear from the user-facing
            template gallery immediately. It stays saved here and can be
            unarchived anytime.
          </>
        }
        loading={busy}
        onConfirm={() => run("archive")}
        onOpenChange={setPendingArchive}
        open={pendingArchive}
        title="Archive this template?"
      />
    </>
  );
}
