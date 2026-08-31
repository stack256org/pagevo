"use client";

import { AlertTriangle, DatabaseZap, RotateCw } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";

// Best-effort detection of a missing-migration error, the most common self-hosted first-run failure.
// Only works in dev — production redacts error messages, so it falls back to the generic UI below.
const MIGRATION_HINT_PATTERN =
  /relation .* does not exist|column .* does not exist/i;

export default function GlobalErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const looksLikeMissingMigration = useMemo(
    () => MIGRATION_HINT_PATTERN.test(error.message ?? ""),
    [error.message]
  );

  if (looksLikeMissingMigration) {
    return (
      <main className="grid min-h-screen place-items-center bg-base-200 px-4">
        <div className="w-full max-w-lg text-center">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-lg bg-warning/10 ring-1 ring-warning/20">
            <DatabaseZap className="size-6 text-warning" strokeWidth={1.5} />
          </div>
          <h1 className="mb-2 text-lg font-bold text-base-content">
            This instance hasn't been set up yet
          </h1>
          <p className="text-sm leading-relaxed text-base-content/70">
            The database is missing tables this app expects — the migration step
            hasn't been run.
          </p>
          <div className="mt-5 space-y-2 rounded-md border border-base-300 bg-base-100 p-4 text-left">
            <p className="text-xs font-semibold text-base-content/70">
              Docker:
            </p>
            <code className="block rounded-sm bg-base-200 px-3 py-2 text-xs text-base-content">
              docker compose run --rm migrate
            </code>
            <p className="pt-1 text-xs font-semibold text-base-content/70">
              Manual / Node:
            </p>
            <code className="block rounded-sm bg-base-200 px-3 py-2 text-xs text-base-content">
              pnpm db:migrate
            </code>
          </div>
          <Button className="mt-6" onClick={reset}>
            <RotateCw className="size-4" />
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-screen place-items-center bg-base-200 px-4">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-lg bg-error/10 ring-1 ring-error/20">
          <AlertTriangle className="size-6 text-error" strokeWidth={1.5} />
        </div>
        <h1 className="mb-2 text-lg font-bold text-base-content">
          Something went wrong
        </h1>
        <p className="text-sm leading-relaxed text-base-content/70">
          An unexpected error occurred. Try again, or check the server logs if
          this keeps happening.
        </p>
        {error.digest && (
          <p className="mt-3 text-xs text-base-content/70">
            Reference: {error.digest}
          </p>
        )}
        <Button className="mt-6" onClick={reset}>
          <RotateCw className="size-4" />
          Try again
        </Button>
      </div>
    </main>
  );
}
