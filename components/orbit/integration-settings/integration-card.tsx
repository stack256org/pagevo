"use client";

import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface Props {
  children: ReactNode;
  /** Onboarding usage: the header becomes a toggle for the fields below, so
   * three sections don't all show at once. Omit on the Integrations page,
   * where it's already scoped to just these settings. */
  collapsible?: boolean;
  configured: boolean;
  defaultOpen?: boolean;
  description: string;
  /** Persistent callout below the fields — for something the admin needs to
   * know beyond the moment the save toast disappears (e.g. "needs a restart"). */
  note?: ReactNode;
  onSave: () => void;
  onTest?: () => void;
  saving: boolean;
  testing?: boolean;
  testLabel?: string;
  title: string;
}

/** Shared layout for the SMTP / Google OAuth / Storage sections — used on
 * both the Integrations page and inline in onboarding's Docker Project step. */
export function IntegrationCard({
  title,
  description,
  configured,
  saving,
  onSave,
  onTest,
  testing,
  testLabel = "Test",
  note,
  collapsible = false,
  defaultOpen = false,
  children,
}: Props) {
  const header = (
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-base-content">
          {title}
          <span
            className={`rounded-full px-2 py-0.5 text-2xs font-medium ${
              configured
                ? "bg-primary/10 text-primary"
                : "bg-base-200 text-base-content/70"
            }`}
          >
            {configured ? "Configured" : "Not configured"}
          </span>
        </h3>
        <p className="mt-0.5 text-xs text-base-content/70">{description}</p>
      </div>
    </div>
  );

  const body = (
    <div className="space-y-4 pt-4">
      <div className="space-y-4">{children}</div>

      {note && (
        <p className="rounded-md bg-base-200/60 px-3 py-2 text-xs text-base-content/70">
          {note}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        {onTest ? (
          <button
            className="text-sm font-medium text-base-content/70 underline underline-offset-2 transition-colors duration-150 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            disabled={saving || testing}
            onClick={onTest}
            type="button"
          >
            {testing ? "Testing…" : testLabel}
          </button>
        ) : (
          <span />
        )}
        <button
          className="flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          disabled={saving || testing}
          onClick={onSave}
          type="button"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );

  if (!collapsible) {
    return (
      <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100 p-5">
        {header}
        {body}
      </div>
    );
  }

  return (
    <Collapsible
      className="group overflow-hidden rounded-lg border border-base-300 bg-base-100 p-5"
      defaultOpen={defaultOpen}
    >
      <CollapsibleTrigger className="flex w-full items-start gap-3">
        <div className="flex-1">{header}</div>
        <ChevronDown
          className="mt-0.5 shrink-0 text-base-content/50 transition-transform duration-150 group-open:rotate-180"
          size={16}
        />
      </CollapsibleTrigger>
      <CollapsibleContent>{body}</CollapsibleContent>
    </Collapsible>
  );
}
