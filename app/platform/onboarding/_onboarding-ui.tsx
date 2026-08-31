"use client";

import { X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  completeOnboardingAction,
  type InviteEntry,
} from "@/app/actions/onboarding";
import { GoogleOAuthSettingsForm } from "@/components/orbit/integration-settings/google-oauth-settings-form";
import { SmtpSettingsForm } from "@/components/orbit/integration-settings/smtp-settings-form";
import { StorageSettingsForm } from "@/components/orbit/integration-settings/storage-settings-form";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Logo } from "@/components/ui/logo";
import { RoleSelect } from "@/components/ui/role-select";
import { PRODUCT_NAME } from "@/config/platform";
import type { IntegrationSettingsSummary } from "@/lib/integration-settings";

const INVITE_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "editor", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;

/* ─── Data ──────────────────────────────────────────────────────── */

const QUESTION_STEPS = [
  {
    question: "What best describes you?",
    subtitle: "We'll tailor your experience based on your role.",
    options: [
      {
        value: "student",
        label: "Student",
        description: "Learning and personal projects",
      },
      {
        value: "professional",
        label: "Professional",
        description: "Individual work and productivity",
      },
      {
        value: "team_lead",
        label: "Team Lead",
        description: "Managing a team or department",
      },
      {
        value: "founder",
        label: "Founder / Owner",
        description: "Running a startup or business",
      },
    ],
  },
  {
    question: "What will you use it for?",
    subtitle: "Pick the option that fits best — you can do more later.",
    options: [
      {
        value: "notes",
        label: "Personal notes",
        description: "Capture ideas and tasks",
      },
      {
        value: "projects",
        label: "Project management",
        description: "Plan and track work",
      },
      {
        value: "knowledge",
        label: "Knowledge base",
        description: "Team docs and wikis",
      },
      {
        value: "collaboration",
        label: "Team collaboration",
        description: "Work together in real time",
      },
    ],
  },
  {
    question: "Who's joining you?",
    subtitle: "This helps us set up the right defaults for your workspace.",
    options: [
      { value: "solo", label: "Just me", description: "Personal workspace" },
      { value: "small", label: "Small team", description: "2–10 people" },
      { value: "medium", label: "Growing team", description: "11–50 people" },
      {
        value: "large",
        label: "Large organization",
        description: "50+ people",
      },
    ],
  },
];

const TEMPLATES = [
  { key: "blank", label: "Start blank", desc: "A clean slate, just for you" },
  {
    key: "getting-started",
    label: "Getting Started",
    desc: "Intro guide for your workspace",
  },
  {
    key: "project-tracker",
    label: "Project Tracker",
    desc: "Tasks, milestones, and progress",
  },
  {
    key: "meeting-notes",
    label: "Meeting Notes",
    desc: "Capture agendas and action items",
  },
  {
    key: "personal-journal",
    label: "Personal Journal",
    desc: "Daily reflections and ideas",
  },
];

/* ─── Step indices ──────────────────────────────────────────────── */

const PROFILE_STEP = 0;
const DOCKER_STEP = 1; // only reachable when isAdmin — the very first user
const Q_FIRST_STEP = 2;
const Q_LAST_STEP = 4;
const WORKSPACE_STEP = 5;
const INVITE_STEP = 6;
const TEMPLATE_TEAM = 7;
const TEMPLATE_SOLO = 6;

const EMPTY_INVITE: InviteEntry = { email: "", role: "editor" };

// Rows are added and removed from the middle, so an array index is not a stable
// identity (it would hand a removed row's key, and its DOM/focus, to the row
// below). The id is client-only � it is stripped before the server action.
type InviteRowState = InviteEntry & { id: string };
function newInvite(): InviteRowState {
  return { ...EMPTY_INVITE, id: crypto.randomUUID() };
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isInviteEmailInvalid(email: string) {
  const trimmed = email.trim();
  return trimmed.length > 0 && !EMAIL_REGEX.test(trimmed);
}

/* ─── Component ─────────────────────────────────────────────────── */

interface Props {
  initialName: string;
  integrationSettings: IntegrationSettingsSummary | null;
  isAdmin: boolean;
  smtpConfigured: boolean;
}

export function OnboardingUI({
  initialName,
  integrationSettings,
  isAdmin,
  smtpConfigured,
}: Props) {
  const [step, setStep] = useState(PROFILE_STEP);
  const [displayName, setDisplayName] = useState(initialName);
  const [jobTitle, setJobTitle] = useState("");
  const [selections, setSelections] = useState(["", "", ""]);
  const [workspaceName, setWorkspaceName] = useState("");
  const [invites, setInvites] = useState<InviteRowState[]>(() => [
    newInvite(),
    newInvite(),
    newInvite(),
  ]);
  const [templateKey, setTemplateKey] = useState("blank");
  const [invitesTouched, setInvitesTouched] = useState([false, false, false]);
  const [pending, startTransition] = useTransition();
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(
    null
  );

  const nameInputRef = useRef<HTMLInputElement>(null);
  const profileNameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    profileNameRef.current?.focus();
  }, []);

  const isTeam = selections[2] !== "solo" && selections[2] !== "";

  const totalSteps = (isTeam ? 7 : 6) + (isAdmin ? 1 : 0);
  // Only reflects the team/solo choice once the user has actually moved past
  // that question (clicked Continue) — using the live selection instead would
  // make the progress bar/dot count change the instant an option is clicked,
  // before the choice is confirmed. The admin-only Docker step is known from
  // the start (not a user choice), so it's always folded into this baseline.
  const preQuizTotal = 6 + (isAdmin ? 1 : 0);
  const progressTotal = step > Q_LAST_STEP ? totalSteps : preQuizTotal;

  const isProfileStep = step === PROFILE_STEP;
  const isDockerStep = isAdmin && step === DOCKER_STEP;
  const isQuestionStep = step >= Q_FIRST_STEP && step <= Q_LAST_STEP;
  const isNameStep = step === WORKSPACE_STEP;
  const isInviteStep = isTeam && step === INVITE_STEP;
  const isTemplateStep = isTeam
    ? step === TEMPLATE_TEAM
    : step === TEMPLATE_SOLO;
  const isLast = isTemplateStep;

  function selectOption(value: string) {
    setSelections((prev) => {
      const next = [...prev];
      next[step - Q_FIRST_STEP] = value;
      return next;
    });
  }

  function updateInviteEmail(i: number, email: string) {
    setInvites((prev) =>
      prev.map((inv, idx) => (idx === i ? { ...inv, email } : inv))
    );
  }

  function updateInviteRole(i: number, role: "admin" | "editor" | "viewer") {
    setInvites((prev) =>
      prev.map((inv, idx) => (idx === i ? { ...inv, role } : inv))
    );
  }

  function touchInviteEmail(i: number) {
    setInvitesTouched((prev) => prev.map((t, idx) => (idx === i ? true : t)));
  }

  function addInviteRow() {
    if (invites.length < 8) {
      setInvites((prev) => [...prev, newInvite()]);
      setInvitesTouched((prev) => [...prev, false]);
    }
  }

  function removeInviteRow(i: number) {
    if (invites.length <= 1) {
      return;
    }
    setInvites((prev) => prev.filter((_, idx) => idx !== i));
    setInvitesTouched((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleContinue() {
    if (isProfileStep) {
      setStep(isAdmin ? DOCKER_STEP : Q_FIRST_STEP);
      return;
    }
    if (isDockerStep) {
      setStep(Q_FIRST_STEP);
      return;
    }
    if (isQuestionStep) {
      const next = step + 1;
      setStep(next);
      if (next === WORKSPACE_STEP) {
        setTimeout(() => nameInputRef.current?.focus(), 50);
      }
      return;
    }
    if (isNameStep) {
      setStep(isTeam ? INVITE_STEP : TEMPLATE_SOLO);
      return;
    }
    if (isInviteStep) {
      if (invites.some((inv) => isInviteEmailInvalid(inv.email))) {
        setInvitesTouched((prev) => prev.map(() => true));
        return;
      }
      setStep(TEMPLATE_TEAM);
      return;
    }
    if (isTemplateStep) {
      finish();
    }
  }

  function handleBack() {
    if (step === PROFILE_STEP) {
      return;
    }
    // DOCKER_STEP is only ever reachable for admins, so a non-admin stepping
    // back from Q_FIRST_STEP must skip over it straight to PROFILE_STEP.
    if (step === Q_FIRST_STEP && !isAdmin) {
      setStep(PROFILE_STEP);
      return;
    }
    // Every other step's predecessor is simply step - 1 — the team/solo
    // branch reuses index 6 for either INVITE_STEP or TEMPLATE_SOLO, but only
    // one of those is ever reachable for a given isTeam value, so there's no
    // clash.
    setStep(step - 1);
  }

  function handleSkip() {
    if (isProfileStep) {
      setDisplayName("");
      setJobTitle("");
      setStep(isAdmin ? DOCKER_STEP : Q_FIRST_STEP);
      return;
    }
    if (isDockerStep) {
      setStep(Q_FIRST_STEP);
      return;
    }
    if (isQuestionStep) {
      const next = step + 1;
      setStep(next);
      if (next === WORKSPACE_STEP) {
        setTimeout(() => nameInputRef.current?.focus(), 50);
      }
      return;
    }
    if (isNameStep) {
      setWorkspaceName("");
      setStep(isTeam ? INVITE_STEP : TEMPLATE_SOLO);
      return;
    }
    if (isInviteStep) {
      setStep(TEMPLATE_TEAM);
      return;
    }
    if (isTemplateStep) {
      finish("blank");
    }
  }

  function finish(overrideTemplate?: string) {
    const kind = isTeam ? "team" : "personal";
    const timezone =
      typeof Intl === "undefined"
        ? "UTC"
        : Intl.DateTimeFormat().resolvedOptions().timeZone;
    startTransition(() =>
      completeOnboardingAction({
        kind,
        workspaceName,
        invites: isTeam
          ? invites.map((inv) => ({ email: inv.email, role: inv.role }))
          : [],
        displayName: displayName.trim(),
        jobTitle: jobTitle.trim(),
        timezone,
        templateKey: overrideTemplate ?? templateKey,
      })
    );
  }

  const canContinue = (() => {
    if (isProfileStep) {
      return displayName.trim().length > 0;
    }
    if (isQuestionStep) {
      return !!selections[step - Q_FIRST_STEP];
    }
    if (isNameStep) {
      return workspaceName.trim().length > 0;
    }
    if (isInviteStep) {
      return !invites.some((inv) => isInviteEmailInvalid(inv.email));
    }
    return true;
  })();

  const btnLabel = pending
    ? "Setting up…"
    : isInviteStep
      ? "Send invites & open workspace"
      : isLast
        ? `Start using ${PRODUCT_NAME}`
        : "Continue";

  /* ─── Render ──────────────────────────────────────────────────── */

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-base-200 px-4 py-16">
      <div className="flex w-full max-w-md flex-col items-center">
        {/* Logo */}
        <div className="mb-8">
          <Logo className="h-10 w-auto" height={45} width={180} />
        </div>

        {/* Progress bar */}
        <div className="mb-8 flex w-full items-center gap-1">
          {/* biome-ignore-start lint/suspicious/noArrayIndexKey: fixed-length placeholder list (skeleton/progress dots) — never reordered and has no per-item state, so the index is the stable identity */}
          {Array.from({ length: progressTotal }).map((_, i) => (
            <div
              className={`h-0.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= step ? "bg-primary" : "bg-base-300"
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
            : `Step ${step + 1} of ${progressTotal}`}
        </p>

        {/* ── Profile step ──────────────────────────────────── */}
        {isProfileStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              First, what&rsquo;s your name?
            </h1>
            <p className="mb-8 text-center text-sm text-base-content/70">
              This is how you&rsquo;ll appear to teammates.
            </p>

            <div className="mb-6 w-full space-y-3">
              <input
                className="h-11 w-full rounded-md border border-base-300 bg-base-100 px-4 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                maxLength={80}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canContinue) {
                    handleContinue();
                  }
                }}
                placeholder="Your full name"
                ref={profileNameRef}
                type="text"
                value={displayName}
              />
              <input
                className="h-11 w-full rounded-md border border-base-300 bg-base-100 px-4 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                maxLength={80}
                onChange={(e) => setJobTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canContinue) {
                    handleContinue();
                  }
                }}
                placeholder="Job title (optional)"
                type="text"
                value={jobTitle}
              />
            </div>
          </>
        )}

        {/* ── Docker project step (admin only) ──────────────── */}
        {isDockerStep && integrationSettings && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              Your {PRODUCT_NAME} project is running
            </h1>
            <p className="mb-6 text-center text-sm text-base-content/70">
              Email, file storage, and Google sign-in are all optional — this
              instance works without them. Set any of it up now, or skip and
              come back to it later from Orbit Admin → Integrations.
            </p>

            <div className="mb-6 w-full space-y-3">
              <SmtpSettingsForm
                collapsible
                initial={integrationSettings.smtp}
              />
              <GoogleOAuthSettingsForm
                collapsible
                initial={integrationSettings.google}
              />
              <StorageSettingsForm
                collapsible
                initial={integrationSettings.storage}
              />
            </div>
          </>
        )}

        {/* ── Question steps ────────────────────────────────── */}
        {isQuestionStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              {QUESTION_STEPS[step - Q_FIRST_STEP].question}
            </h1>
            <p className="mb-8 text-center text-sm text-base-content/70">
              {QUESTION_STEPS[step - Q_FIRST_STEP].subtitle}
            </p>

            <div className="mb-6 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {QUESTION_STEPS[step - Q_FIRST_STEP].options.map((opt, idx) => {
                const isSelected =
                  selections[step - Q_FIRST_STEP] === opt.value;
                return (
                  <button
                    className={`relative flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-150 ${
                      idx > 0 ? "border-t border-base-300" : ""
                    } ${isSelected ? "bg-primary/5" : "hover:bg-base-200"}`}
                    key={opt.value}
                    onClick={() => selectOption(opt.value)}
                    type="button"
                  >
                    {isSelected && (
                      <span className="absolute inset-y-0 left-0 w-0.75 rounded-r-sm bg-primary" />
                    )}
                    <div className="flex-1 min-w-0 pl-1">
                      <p
                        className={`text-[14.5px] font-semibold leading-snug ${isSelected ? "text-primary" : "text-base-content"}`}
                      >
                        {opt.label}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-base-content/70">
                        {opt.description}
                      </p>
                    </div>
                    <div
                      className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-base-300"
                      }`}
                    >
                      {isSelected && (
                        <span className="size-1.5 rounded-full bg-primary-content" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Workspace name step ───────────────────────────── */}
        {isNameStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              {isTeam ? "Name your team workspace" : "Name your workspace"}
            </h1>
            <p className="mb-8 text-center text-sm text-base-content/70">
              {isTeam
                ? "This is your shared space — you can rename it any time."
                : "A place just for you. Keep it simple and memorable."}
            </p>

            <div className="mb-6 w-full">
              <input
                className="h-11 w-full rounded-md border border-base-300 bg-base-100 px-4 text-sm text-base-content placeholder:text-base-content/50 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                maxLength={100}
                onChange={(e) => setWorkspaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canContinue) {
                    handleContinue();
                  }
                }}
                placeholder={isTeam ? "e.g. Acme Corp" : "e.g. My Projects"}
                ref={nameInputRef}
                type="text"
                value={workspaceName}
              />
              <p className="mt-2 text-xs text-base-content/50">
                You can rename or create more workspaces later in settings.
              </p>
            </div>
          </>
        )}

        {/* ── Invite step ───────────────────────────────────── */}
        {isInviteStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              Invite your team to{" "}
              <span className="text-primary">
                {workspaceName || "your workspace"}
              </span>
            </h1>
            <p className="mb-6 text-center text-sm text-base-content/70">
              {smtpConfigured
                ? "They’ll get an email invite and can join straight away."
                : "Email isn’t configured on this instance yet, so invite links won’t be emailed — you’ll need to share them manually from workspace settings."}
            </p>

            <div className="mb-3 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {invites.map((inv, i) => {
                const showInviteError =
                  invitesTouched[i] && isInviteEmailInvalid(inv.email);
                return (
                  <div
                    className={i > 0 ? "border-t border-base-300" : ""}
                    key={inv.id}
                  >
                    <div className="flex items-center gap-0">
                      <input
                        aria-invalid={showInviteError}
                        autoComplete="new-password"
                        className={`h-11 flex-1 bg-transparent px-4 text-sm placeholder:text-base-content/50 focus:outline-none ${
                          showInviteError ? "text-error" : "text-base-content"
                        }`}
                        inputMode="email"
                        name={`invite_member_${i}`}
                        onBlur={() => touchInviteEmail(i)}
                        onChange={(e) => updateInviteEmail(i, e.target.value)}
                        placeholder={`teammate${i + 1}@company.com`}
                        type="text"
                        value={inv.email}
                      />
                      <div className="h-6 w-px bg-base-300" />
                      <div className="px-2">
                        <RoleSelect
                          onChange={(v) =>
                            updateInviteRole(
                              i,
                              v as "admin" | "editor" | "viewer"
                            )
                          }
                          options={INVITE_ROLE_OPTIONS}
                          value={inv.role}
                        />
                      </div>
                      {invites.length > 1 && (
                        <button
                          aria-label="Remove this invite"
                          className="flex size-8 shrink-0 items-center justify-center rounded-sm text-base-content/70 transition-colors duration-150 hover:bg-error/10 hover:text-error"
                          onClick={() => setPendingRemoveIndex(i)}
                          type="button"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                    {showInviteError && (
                      <p className="px-4 pb-2 text-xs text-error">
                        Please enter a valid email address.
                      </p>
                    )}
                  </div>
                );
              })}
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
                className="mb-5 flex items-center gap-1.5 text-xs font-medium text-primary transition-colors duration-150 hover:text-primary/80"
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

            <p className="mb-5 text-xs text-base-content/50">
              Invites are valid for 7 days. You can invite more teammates from
              workspace settings at any time.
            </p>
          </>
        )}

        {/* ── Template step ─────────────────────────────────── */}
        {isTemplateStep && (
          <>
            <h1 className="mb-1.5 text-center text-[1.6rem] font-black tracking-tight text-base-content">
              Choose a starting point
            </h1>
            <p className="mb-8 text-center text-sm text-base-content/70">
              Pick a template or start blank — you can always add more later.
            </p>

            <div className="mb-6 w-full overflow-hidden rounded-lg border border-base-300 bg-base-100">
              {TEMPLATES.map((tpl, idx) => {
                const isSelected = templateKey === tpl.key;
                return (
                  <button
                    className={`relative flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-150 ${
                      idx > 0 ? "border-t border-base-300" : ""
                    } ${isSelected ? "bg-primary/5" : "hover:bg-base-200"}`}
                    key={tpl.key}
                    onClick={() => setTemplateKey(tpl.key)}
                    type="button"
                  >
                    {isSelected && (
                      <span className="absolute inset-y-0 left-0 w-0.75 rounded-r-sm bg-primary" />
                    )}
                    <div className="flex-1 min-w-0 pl-1">
                      <p
                        className={`text-[14.5px] font-semibold leading-snug ${isSelected ? "text-primary" : "text-base-content"}`}
                      >
                        {tpl.label}
                      </p>
                      <p className="mt-0.5 text-xs text-base-content/70">
                        {tpl.desc}
                      </p>
                    </div>
                    <div
                      className={`flex size-4.5 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-150 ${
                        isSelected
                          ? "border-primary bg-primary"
                          : "border-base-300"
                      }`}
                    >
                      {isSelected && (
                        <span className="size-1.5 rounded-full bg-primary-content" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* ── Actions ───────────────────────────────────────── */}
        <div className="flex w-full items-center gap-2.5">
          {step > PROFILE_STEP && (
            <button
              className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-md border border-base-300 bg-base-100 px-5 text-sm font-semibold text-base-content transition-colors duration-150 hover:bg-base-200 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={pending}
              onClick={handleBack}
              type="button"
            >
              <svg
                className="size-4"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                viewBox="0 0 24 24"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
          )}
          <button
            className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-semibold text-primary-content transition-colors duration-150 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!canContinue || pending}
            onClick={handleContinue}
            type="button"
          >
            {btnLabel}
            {!pending && !isLast && !isInviteStep && (
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
          className="mt-5 text-sm font-medium text-base-content/70 underline underline-offset-2 transition-colors duration-150 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
          disabled={pending}
          onClick={handleSkip}
          type="button"
        >
          {isInviteStep
            ? "Skip for now"
            : isLast
              ? "Start blank instead"
              : "Skip this step"}
        </button>
      </div>
    </div>
  );
}
