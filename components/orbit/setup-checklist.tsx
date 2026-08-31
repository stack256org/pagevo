"use client";

import {
  CheckCircle2,
  ChevronRight,
  Palette,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

const DISMISS_KEY = "orbit-setup-checklist-dismissed";

interface SetupChecklistProps {
  appSecretIsPlaceholder: boolean;
  smtpConfigured: boolean;
  storageConfigured: boolean;
  storageDriver: "local" | "s3" | "r2";
}

export function SetupChecklist({
  smtpConfigured,
  storageConfigured,
  storageDriver,
  appSecretIsPlaceholder,
}: SetupChecklistProps) {
  const [dismissed, setDismissed] = useState(true); // start hidden, avoid a flash before we can check localStorage

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  const items = [
    {
      key: "smtp",
      done: smtpConfigured,
      label: "Email (SMTP)",
      doneNote:
        "Configured — invite and notification emails will actually send.",
      todoNote:
        "Not configured — sign-in links and invites are only logged to the worker's console.",
      href: null,
    },
    {
      key: "storage",
      done: storageConfigured,
      label: "File storage",
      doneNote:
        storageDriver === "local"
          ? "Using local disk — fine for a single-server instance."
          : "S3-compatible storage configured.",
      todoNote: `STORAGE_DRIVER is set to "${storageDriver}" but one or more required S3 credentials are missing.`,
      href: null,
    },
    {
      key: "secret",
      done: !appSecretIsPlaceholder,
      label: "APP_SECRET",
      doneNote: "Set to a real, unique value.",
      todoNote:
        "Still looks like the placeholder from .env.example — sessions aren't safely signed.",
      href: null,
    },
  ];

  const remaining = items.filter((i) => !i.done).length;

  if (dismissed) {
    return null;
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="overflow-hidden rounded-lg border border-base-300 bg-base-100">
      <div className="flex items-center justify-between gap-4 border-b border-base-300 px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10">
            <ShieldAlert className="text-primary" size={14} />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-base-content">
              Setup checklist
            </h2>
            <p className="text-xs text-base-content/70">
              {remaining === 0
                ? "Everything looks good."
                : `${remaining} thing${remaining === 1 ? "" : "s"} worth checking before inviting your team.`}
            </p>
          </div>
        </div>
        <button
          aria-label="Dismiss setup checklist"
          className="flex size-6 shrink-0 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content"
          onClick={dismiss}
          type="button"
        >
          <X size={14} />
        </button>
      </div>

      <div className="divide-y divide-base-300">
        {items.map((item) => (
          <div className="flex items-center gap-3.5 px-5 py-3" key={item.key}>
            <span
              className={`flex size-6 shrink-0 items-center justify-center rounded-full ${
                item.done
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              }`}
            >
              {item.done ? (
                <CheckCircle2 size={14} />
              ) : (
                <span className="size-1.5 rounded-full bg-warning" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-base-content">
                {item.label}
              </p>
              <p className="mt-0.5 text-xs text-base-content/70">
                {item.done ? item.doneNote : item.todoNote}
              </p>
            </div>
          </div>
        ))}

        <Link
          className="group flex items-center gap-3.5 px-5 py-3 transition-colors duration-150 hover:bg-base-200"
          href="/orbit-admin/orbit/settings"
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-base-200 text-base-content/70">
            <Palette size={12} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-base-content">
              Sign-in methods
            </p>
            <p className="mt-0.5 text-xs text-base-content/70">
              Review which methods are enabled for this instance.
            </p>
          </div>
          <ChevronRight
            className="shrink-0 text-base-content/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100"
            size={14}
          />
        </Link>
      </div>
    </div>
  );
}
