"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";

export function CreateWorkspaceSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button
      className="mt-5 flex h-11 w-full items-center justify-center gap-2"
      disabled={pending}
      size="sm"
      type="submit"
    >
      {pending ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          Creating…
        </>
      ) : (
        <>
          {label}
          <svg
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            viewBox="0 0 24 24"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </>
      )}
    </Button>
  );
}
