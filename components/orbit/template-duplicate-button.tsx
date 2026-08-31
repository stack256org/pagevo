"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconTooltipButton } from "@/components/ui/icon-tooltip-button";

interface Props {
  templateId: string;
}

export function TemplateDuplicateButton({ templateId }: Props) {
  const router = useRouter();
  const [duplicating, setDuplicating] = useState(false);

  async function handleDuplicate() {
    if (duplicating) {
      return;
    }
    setDuplicating(true);
    try {
      const res = await fetch(`/api/orbit/templates/${templateId}/duplicate`, {
        method: "POST",
      });
      if (res.ok) {
        const copy = (await res.json()) as { id: string };
        router.push(`/orbit-admin/orbit/templates/${copy.id}/edit`);
        router.refresh();
      }
    } finally {
      setDuplicating(false);
    }
  }

  return (
    <IconTooltipButton
      icon={<Copy size={14} />}
      label={duplicating ? "Duplicating…" : "Duplicate"}
      onClick={handleDuplicate}
    />
  );
}
