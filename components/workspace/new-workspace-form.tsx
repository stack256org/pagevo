"use client";

import { useState } from "react";
import { createWorkspaceAction } from "@/app/actions/workspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { PRODUCT_NAME } from "@/config/platform";

export function NewWorkspaceForm() {
  const [kind, setKind] = useState<"personal" | "team">("personal");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-base-200 px-4 py-16">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-96 w-96 rounded-full bg-primary/8 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center">
        {/* Logo mark */}
        <div className="mb-7">
          <Logo className="h-11 w-auto" height={45} width={180} />
        </div>

        {/* Heading */}
        <h1 className="mb-2 text-center text-[1.75rem] font-black leading-tight tracking-tight text-base-content">
          Create your workspace
        </h1>
        <p className="mb-8 max-w-88 text-center text-sm leading-relaxed text-base-content/70">
          A workspace is where your team organises, collaborates, and ships —
          all in one place.
        </p>

        {/* Card */}
        <div className="w-full rounded-lg border border-base-300 bg-base-100">
          <form action={createWorkspaceAction} className="space-y-5 p-7">
            {/* Workspace type */}
            <div className="space-y-2">
              <p className="text-xs font-medium tracking-wide text-base-content/70">
                Workspace type
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-md border border-base-300 bg-base-200 p-3.5 text-left transition-all has-checked:border-primary has-checked:bg-secondary hover:border-primary/40 hover:bg-base-200">
                  <input
                    className="sr-only"
                    defaultChecked
                    name="kind"
                    onChange={() => setKind("personal")}
                    type="radio"
                    value="personal"
                  />
                  <span className="text-xl leading-none">👤</span>
                  <p className="text-xs font-semibold text-base-content group-has-checked:text-primary">
                    Personal
                  </p>
                  <p className="text-xs leading-tight text-base-content/70">
                    Solo work, private by default
                  </p>
                </label>
                <label className="group flex cursor-pointer flex-col items-start gap-1.5 rounded-md border border-base-300 bg-base-200 p-3.5 text-left transition-all has-checked:border-primary has-checked:bg-secondary hover:border-primary/40 hover:bg-base-200">
                  <input
                    className="sr-only"
                    name="kind"
                    onChange={() => setKind("team")}
                    type="radio"
                    value="team"
                  />
                  <span className="text-xl leading-none">🏢</span>
                  <p className="text-xs font-semibold text-base-content group-has-checked:text-primary">
                    Teamspace
                  </p>
                  <p className="text-xs leading-tight text-base-content/70">
                    Shared with your team
                  </p>
                </label>
              </div>
            </div>

            {/* Workspace name */}
            <div className="space-y-2">
              <label
                className="block text-xs font-medium tracking-wide text-base-content/70"
                htmlFor="name"
              >
                Workspace name
              </label>
              <Input
                autoFocus
                className="h-11 text-base"
                id="name"
                maxLength={100}
                name="name"
                placeholder={
                  kind === "team" ? "e.g. Acme Corp" : "e.g. My Notes"
                }
                required
              />
            </div>

            <Button className="w-full" size="default" type="submit">
              Create workspace
              <svg
                className="ml-1 size-3.5"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Button>
          </form>

          <div className="border-t border-base-300 px-7 py-4">
            <p className="text-center text-xs leading-relaxed text-base-content/70">
              You can rename or create more workspaces later in settings.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-base-content/70">
          {PRODUCT_NAME} · Your work, organised
        </p>
      </div>
    </div>
  );
}
