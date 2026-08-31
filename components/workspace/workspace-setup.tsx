"use client";

import { ArrowLeft, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Logo } from "@/components/ui/logo";
import { RoleSelect } from "@/components/ui/role-select";

const INVITE_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;

/* ─── Step definitions ──────────────────────────────────────────── */

const PERSONAL_STEPS = [
  {
    key: "use_case",
    question: "What will you use this space for?",
    subtitle: "Pick the one that fits best — you can always change later.",
    options: [
      {
        value: "notes",
        label: "Personal notes",
        description: "Ideas, journaling, quick captures",
      },
      {
        value: "tasks",
        label: "Task management",
        description: "To-dos, goals, habits",
      },
      {
        value: "knowledge",
        label: "Knowledge base",
        description: "Reference docs and research",
      },
      {
        value: "planning",
        label: "Planning",
        description: "Roadmaps, schedules, projects",
      },
    ],
  },
];

const TEAM_STEPS = [
  {
    key: "focus",
    question: "What does your team work on?",
    subtitle: "We'll suggest the best defaults for your workspace.",
    options: [
      {
        value: "product",
        label: "Product & Engineering",
        description: "Sprints, roadmaps, tech docs",
      },
      {
        value: "design",
        label: "Design & Creative",
        description: "Briefs, assets, feedback",
      },
      {
        value: "marketing",
        label: "Marketing & Growth",
        description: "Campaigns, content, analytics",
      },
      {
        value: "operations",
        label: "Operations & HR",
        description: "Processes, policies, SOPs",
      },
    ],
  },
];

/* ─── Invite row ─────────────────────────────────────────────────── */

function InviteRow({
  index,
  value,
  role,
  onChange,
  onRoleChange,
  onRemove,
  isFirst,
}: {
  index: number;
  value: string;
  role: string;
  isFirst: boolean;
  onChange: (v: string) => void;
  onRoleChange: (v: string) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-0 ${isFirst ? "" : "border-t border-base-300"}`}
    >
      <input
        className="h-11 flex-1 bg-transparent px-4 text-sm text-base-content placeholder:text-base-content/50 focus:outline-none"
        onChange={(e) => onChange(e.target.value)}
        placeholder={`teammate${index + 1}@company.com`}
        type="email"
        value={value}
      />
      <div className="h-6 w-px bg-base-300" />
      <div className="px-2">
        <RoleSelect
          onChange={onRoleChange}
          options={INVITE_ROLE_OPTIONS}
          value={role}
        />
      </div>
      {onRemove && (
        <button
          aria-label="Remove this invite"
          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-error/10 hover:text-error"
          onClick={onRemove}
          type="button"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */

type Props = {
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceKind: string;
  smtpConfigured: boolean;
};

const EMPTY_INVITE = { email: "", role: "editor" };

// Rows are added and removed from the middle, so an array index is not a
// stable identity — removing row 1 of 3 would hand its key to the row below
// and React would reuse the removed row's DOM (and its focus/selection) for
// it. The id is client-only; sendInvites posts email/role explicitly.
function newInvite() {
  return { ...EMPTY_INVITE, id: crypto.randomUUID() };
}

export function WorkspaceSetup({
  workspaceId,
  workspaceName,
  workspaceSlug,
  workspaceKind,
  smtpConfigured,
}: Props) {
  const router = useRouter();
  const isTeam = workspaceKind === "team";

  const steps = isTeam ? TEAM_STEPS : PERSONAL_STEPS;
  const totalSteps = isTeam ? steps.length + 1 : steps.length;

  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<string[]>(steps.map(() => ""));
  const [invites, setInvites] = useState(() => [
    newInvite(),
    newInvite(),
    newInvite(),
  ]);
  const [inviteError, setInviteError] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null
  );

  const isInviteStep = isTeam && step === steps.length;
  const isLastStep = step === totalSteps - 1;
  const currentStep = isInviteStep ? null : steps[step];
  const selected = isInviteStep ? "skip" : selections[step];

  function selectOption(value: string) {
    setSelections((prev) => {
      const next = [...prev];
      next[step] = value;
      return next;
    });
  }

  function updateInvite(i: number, email: string) {
    setInvites((prev) =>
      prev.map((inv, idx) => (idx === i ? { ...inv, email } : inv))
    );
  }

  function updateRole(i: number, role: string) {
    setInvites((prev) =>
      prev.map((inv, idx) => (idx === i ? { ...inv, role } : inv))
    );
  }

  function addInviteRow() {
    if (invites.length < 8) {
      setInvites((prev) => [...prev, newInvite()]);
    }
  }

  function removeInviteRow(i: number) {
    setInvites((prev) =>
      prev.length > 1 ? prev.filter((_, idx) => idx !== i) : prev
    );
  }

  async function sendInvites(): Promise<string[]> {
    const toSend = invites.filter(
      (inv) => inv.email.trim() && inv.email.includes("@")
    );
    const failed: string[] = [];
    for (const inv of toSend) {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inv.email.trim().toLowerCase(),
            role: inv.role,
          }),
        });
        if (!res.ok) {
          failed.push(inv.email.trim());
        }
      } catch {
        failed.push(inv.email.trim());
      }
    }
    return failed;
  }

  function handleContinue() {
    if (isInviteStep) {
      startTransition(async () => {
        setInviteError("");
        const failed = await sendInvites();
        if (failed.length > 0) {
          setInviteError(
            `Couldn't send an invite to: ${failed.join(", ")}. You can try again from workspace settings.`
          );
          return;
        }
        router.push(`/app/${workspaceSlug}`);
      });
    } else if (isLastStep) {
      router.push(`/app/${workspaceSlug}`);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleSkip() {
    if (isLastStep || isInviteStep) {
      router.push(`/app/${workspaceSlug}`);
    } else {
      setStep((s) => s + 1);
    }
  }

  function handleBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center">
        {/* Logo */}
        <div className="mb-8">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </div>

        {/* Progress dots */}
        <div className="mb-8 flex items-center gap-1.5">
          {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              className={`h-1 rounded-full transition-[width,background-color] duration-300 ${
                i === step
                  ? "w-6 bg-primary"
                  : i < step
                    ? "w-3 bg-primary/30"
                    : "w-3 bg-base-300"
              }`}
              key={i}
            />
          ))}
          {/* biome-ignore-end lint/suspicious/noArrayIndexKey: end of placeholder list */}
        </div>

        {/* Step label */}
        <p className="mb-3 text-xs font-semibold tracking-wide text-base-content/70">
          {isInviteStep
            ? "Invite your team"
            : `Step ${step + 1} of ${totalSteps}`}
        </p>

        {/* ── Question step ── */}
        {!isInviteStep && currentStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              {currentStep.question}
            </h1>
            <p className="mb-8 text-center text-sm text-base-content/70">
              {currentStep.subtitle}
            </p>

            {/* Vertical radio list */}
            <div className="mb-6 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {currentStep.options.map((opt, idx) => {
                const isSelected = selections[step] === opt.value;
                return (
                  <label
                    className={`group relative flex w-full cursor-pointer items-center gap-4 px-5 py-4 text-left transition-colors duration-150 has-checked:bg-primary/5 hover:bg-base-200 ${
                      idx > 0 ? "border-t border-base-300" : ""
                    }`}
                    key={opt.value}
                  >
                    <input
                      checked={isSelected}
                      className="sr-only"
                      name={currentStep.key}
                      onChange={() => selectOption(opt.value)}
                      type="radio"
                      value={opt.value}
                    />
                    <span className="absolute inset-y-0 left-0 hidden w-0.75 rounded-r-sm bg-primary group-has-checked:block" />
                    <div className="flex-1 min-w-0 pl-1">
                      <p className="text-[14.5px] font-semibold leading-snug text-base-content group-has-checked:text-primary">
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-base-content/70">
                        {opt.description}
                      </p>
                    </div>
                    <div className="flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 border-base-300 transition-colors duration-150 group-has-checked:border-primary group-has-checked:bg-primary">
                      <span className="hidden size-1.5 rounded-full bg-primary-content group-has-checked:block" />
                    </div>
                  </label>
                );
              })}
            </div>
          </>
        )}

        {/* ── Invite step ── */}
        {isInviteStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              Invite your team to{" "}
              <span className="text-primary">{workspaceName}</span>
            </h1>
            <p className="mb-6 text-center text-sm text-base-content/70">
              {smtpConfigured
                ? "They'll get an email invite and can join right away."
                : "Email isn't configured on this instance yet, so invite links won't be emailed — you'll need to share them manually from workspace settings."}
            </p>

            <div className="mb-3 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {invites.map((inv, i) => (
                <InviteRow
                  index={i}
                  isFirst={i === 0}
                  key={inv.id}
                  onChange={(v) => updateInvite(i, v)}
                  onRemove={
                    invites.length > 1
                      ? () => setPendingRemoveIndex(i)
                      : undefined
                  }
                  onRoleChange={(v) => updateRole(i, v)}
                  role={inv.role}
                  value={inv.email}
                />
              ))}
            </div>

            <ConfirmDialog
              confirmLabel="Remove"
              description={
                pendingRemoveIndex !== null &&
                invites[pendingRemoveIndex]?.email.trim()
                  ? `"${invites[pendingRemoveIndex]!.email.trim()}" won't be invited.`
                  : "This empty row will be removed."
              }
              onConfirm={() => {
                if (pendingRemoveIndex !== null) {
                  removeInviteRow(pendingRemoveIndex);
                }
                setPendingRemoveIndex(null);
              }}
              onOpenChange={(o) => !o && setPendingRemoveIndex(null)}
              open={pendingRemoveIndex !== null}
              title="Remove this invite?"
            />

            {invites.length < 8 && (
              <button
                className="mb-6 flex items-center gap-1.5 text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80"
                onClick={addInviteRow}
                type="button"
              >
                <svg
                  className="size-3.5"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  viewBox="0 0 24 24"
                >
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add another
              </button>
            )}

            {inviteError && (
              <p className="mb-4 text-xs text-error">{inviteError}</p>
            )}

            <p className="mb-6 text-xs text-base-content/70">
              Invites are valid for 7 days. You can invite more teammates from
              workspace settings at any time.
            </p>
          </>
        )}

        {/* Actions */}
        <div className="flex w-full items-center gap-2">
          {step > 0 && (
            <button
              aria-label="Back"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-base-300 text-base-content/70 transition-colors duration-150 hover:bg-base-200 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pending}
              onClick={handleBack}
              type="button"
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <button
            className="flex h-11 flex-1 items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={(!isInviteStep && !selected) || pending}
            onClick={handleContinue}
            type="button"
          >
            {pending
              ? "Setting up…"
              : isInviteStep
                ? "Send invites & continue"
                : isLastStep
                  ? `Open ${workspaceName}`
                  : "Continue"}
            {!pending && !isLastStep && !isInviteStep && (
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
            )}
          </button>
        </div>

        <button
          className="mt-3 text-xs text-base-content/70 transition-colors duration-150 hover:text-base-content/70"
          disabled={pending}
          onClick={handleSkip}
          type="button"
        >
          {isInviteStep ? "Skip for now" : "Skip this step"}
        </button>
      </div>
    </div>
  );
}
