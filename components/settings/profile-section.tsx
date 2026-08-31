"use client";

import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Clock,
  Globe,
  KeyRound,
  Loader2,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { IconTooltip } from "@/components/ui/icon-tooltip";
import { Input } from "@/components/ui/input";
import { useHoverTooltip } from "@/hooks/use-hover-tooltip";
import { changeEmail, changePassword } from "@/lib/auth/client";
// aliased — `passwordError` is also this component's own error-message state
import {
  PASSWORD_RULES,
  passwordError as validatePassword,
} from "@/lib/auth/password";
import { useUpload } from "@/lib/storage/use-upload";
import { getAvatarColor, getInitials } from "@/lib/utils";
import { useSettingsUser } from "./settings-user-context";
import { ThemeToggle } from "./theme-toggle";

interface UserData {
  email: string;
  id: string;
  image: string | null;
  jobTitle: string | null;
  name: string | null;
  timezone: string | null;
}
interface BlockingWorkspace {
  hasOtherMembers: boolean;
  id: string;
  name: string;
  slug: string;
}
interface Props {
  /** Whether a "credential" (email+password) account row already exists —
   *  false for a user who only ever signed in via Google. */
  hasPassword: boolean;
  /** Whether this instance has SMTP configured — without it, verification
   *  emails are only logged server-side, so the UI needs to say so instead
   *  of implying an inbox delivery that won't happen. */
  smtpConfigured: boolean;
  user: UserData;
}
interface PendingEmailChange {
  newEmail: string;
  sentAt: number;
}

const PENDING_EMAIL_TTL_MS = 60 * 60 * 1000; // matches the server's 1h verification-token expiry

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Vancouver",
  "America/Toronto",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
  "Pacific/Auckland",
  "Pacific/Honolulu",
];

function timeInZone(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
      weekday: "short",
      hour12: true,
    }).format(new Date());
  } catch {
    return "";
  }
}

/* ── Timezone dropdown — Headless UI Popover (anchor-based flip off its own
   PopoverButton) wrapping a Combobox used only for the internal search +
   keyboard nav, replacing the hand-rolled computePos()/scroll/resize-
   reposition/outside-click code select.tsx's Listbox already showed the
   pattern for. Combobox's own `anchor` positions off ComboboxInput — here
   the input only exists inside the panel it would be positioning, so
   anchoring lives on the outer Popover/PopoverButton instead (same split
   relation-database-picker.tsx uses for a button-triggered search list). */
function TimezoneDropdown({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <Popover>
      {(bag) => (
        <TimezonePopoverBody {...bag} onChange={onChange} value={value} />
      )}
    </Popover>
  );
}

function TimezonePopoverBody({
  open,
  close,
  value,
  onChange,
}: {
  open: boolean;
  close: () => void;
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) {
      setQuery("");
    }
  }, [open]);

  const filtered = query.trim()
    ? TIMEZONES.filter((tz) =>
        tz.toLowerCase().includes(query.trim().toLowerCase())
      )
    : TIMEZONES;

  const regionGroups: Record<string, string[]> = {};
  for (const tz of filtered) {
    const region = tz.includes("/") ? tz.split("/")[0]! : "Global";
    if (!regionGroups[region]) {
      regionGroups[region] = [];
    }
    regionGroups[region]!.push(tz);
  }

  return (
    <>
      <PopoverButton className="flex w-55 items-center justify-between rounded-sm border border-base-300 bg-base-200/20 px-3 py-2 text-sm text-base-content outline-none transition-colors duration-150 hover:border-base-300 data-open:border-primary data-open:bg-base-100">
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="shrink-0 text-base-content/70" size={14} />
          <span className="truncate">{value.replace(/_/g, " ")}</span>
        </div>
        <ChevronDown
          className={`shrink-0 text-base-content/70 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          size={14}
        />
      </PopoverButton>
      <PopoverPanel
        anchor={{ to: "bottom end", gap: 6 }}
        className="z-600 w-70 overflow-hidden rounded-lg border border-base-300 bg-neutral transition duration-100 ease-out data-closed:opacity-0 data-closed:scale-95 data-leave:opacity-0 data-leave:scale-95"
        transition
      >
        <Combobox
          onChange={(next: string | null) => {
            if (next) {
              onChange(next);
              close();
            }
          }}
          value={value}
        >
          {/* Search */}
          <div className="border-b border-base-300 px-3 py-2.5">
            <div className="flex items-center gap-2 rounded-sm border border-base-300 bg-base-200/30 px-2.5 py-1.5">
              <Search className="shrink-0 text-base-content/70" size={14} />
              <ComboboxInput
                autoFocus
                className="flex-1 bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/50"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search timezone…"
                value={query}
              />
              {query && (
                <button
                  className="text-base-content/70 hover:text-base-content/70"
                  onClick={() => setQuery("")}
                  type="button"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List — plain divs grouping ComboboxOptions by region, no special primitive needed */}
          <ComboboxOptions className="max-h-60 overflow-y-auto py-1" static>
            {Object.entries(regionGroups).map(([region, tzs]) => (
              <div key={region}>
                <p className="sticky top-0 z-10 bg-base-100/90 px-3.5 py-1.5 text-xs font-semibold tracking-wide text-base-content/70">
                  {region}
                </p>
                {tzs.map((tz) => (
                  <ComboboxOption
                    className="flex w-full cursor-default items-center gap-2.5 px-3.5 py-2 text-left text-sm text-base-content outline-none transition-colors duration-150 data-focus:bg-base-200 data-selected:font-semibold"
                    key={tz}
                    value={tz}
                  >
                    {({ selected }) => (
                      <>
                        <span
                          className={`flex size-4 shrink-0 items-center justify-center ${selected ? "" : "opacity-0"}`}
                        >
                          <Check size={12} />
                        </span>
                        {tz.replace(/_/g, " ")}
                      </>
                    )}
                  </ComboboxOption>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <div className="py-6 text-center text-sm text-base-content/70">
                No timezones found
              </div>
            )}
          </ComboboxOptions>
        </Combobox>
      </PopoverPanel>
    </>
  );
}

/* ── ProfileSection ───────────────────────────────────────── */
export function ProfileSection({
  user,
  smtpConfigured,
  hasPassword: initialHasPassword,
}: Props) {
  const [name, setName] = useState(user.name ?? "");
  const [jobTitle, setJobTitle] = useState(user.jobTitle ?? "");
  const [timezone, setTimezone] = useState(user.timezone ?? "UTC");
  const [currentImage, setCurrentImage] = useState(user.image);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [tzTime, setTzTime] = useState(() =>
    timeInZone(user.timezone ?? "UTC")
  );
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [blockingWorkspaces, setBlockingWorkspaces] = useState<
    BlockingWorkspace[]
  >([]);
  const [removePhotoConfirm, setRemovePhotoConfirm] = useState(false);
  const { tooltip, showTooltip, hideTooltip } = useHoverTooltip();

  // ── Change email ──
  const pendingEmailKey = `wf_pending_email_change:${user.id}`;
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [pendingEmail, setPendingEmail] = useState<PendingEmailChange | null>(
    null
  );
  const [emailChangedBanner, setEmailChangedBanner] = useState(false);

  // ── Set / change password ── — "Set password" (no currentPassword needed)
  // for Google-only accounts with no credential row yet, "Change password"
  // (requires currentPassword) once one exists.
  const [hasPassword, setHasPassword] = useState(initialHasPassword);
  const [editingPassword, setEditingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSetDone, setPasswordSetDone] = useState(false);

  function closePasswordForm() {
    setEditingPassword(false);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  }

  const nameRef = useRef(name);
  nameRef.current = name;
  const jobRef = useRef(jobTitle);
  jobRef.current = jobTitle;
  const fileRef = useRef<HTMLInputElement>(null);
  const {
    upload,
    uploading: avatarUploading,
    getLastError,
  } = useUpload({
    kind: "user_avatar",
  });
  const { updateUser } = useSettingsUser();

  // Restore a pending change-email request across refreshes (better-auth
  // keeps no server-side record of it — the token itself is the only state —
  // so this is purely a local UI convenience, not a source of truth).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(pendingEmailKey);
      if (!raw) {
        return;
      }
      const parsed = JSON.parse(raw) as PendingEmailChange;
      const expired = Date.now() - parsed.sentAt > PENDING_EMAIL_TTL_MS;
      const alreadyApplied = parsed.newEmail === user.email;
      if (expired || alreadyApplied) {
        localStorage.removeItem(pendingEmailKey);
        return;
      }
      setPendingEmail(parsed);
    } catch {
      localStorage.removeItem(pendingEmailKey);
    }
    // `pendingEmailKey` is derived from user.id, so in practice this still runs
    // once; a user.email change just re-runs it into the `alreadyApplied`
    // branch, which is exactly the stale-entry cleanup we'd want anyway.
  }, [pendingEmailKey, user.email]);

  // better-auth redirects back here with ?emailChanged=1 once the
  // verification link is clicked and the swap completes server-side.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("emailChanged") !== "1") {
      return;
    }
    setEmailChangedBanner(true);
    localStorage.removeItem(pendingEmailKey);
    setPendingEmail(null);
    params.delete("emailChanged");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "")
    );
    // Still effectively mount-only: `pendingEmailKey` is derived from user.id,
    // and the `?emailChanged=1` guard short-circuits any repeat run.
  }, [pendingEmailKey]);

  async function sendChangeEmail(target: string) {
    setEmailSending(true);
    setEmailError("");
    const result = await changeEmail({
      newEmail: target,
      callbackURL: `${window.location.pathname}?emailChanged=1`,
    });
    setEmailSending(false);
    if (result.error) {
      setEmailError(
        result.error.message ?? "Something went wrong. Please try again."
      );
      return false;
    }
    const pending: PendingEmailChange = {
      newEmail: target,
      sentAt: Date.now(),
    };
    localStorage.setItem(pendingEmailKey, JSON.stringify(pending));
    setPendingEmail(pending);
    return true;
  }

  async function handleSendChangeEmail() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!trimmed) {
      return;
    }
    if (trimmed === user.email.toLowerCase()) {
      setEmailError("That's already your current email.");
      return;
    }
    if (await sendChangeEmail(trimmed)) {
      setChangingEmail(false);
      setNewEmail("");
    }
  }

  function handleDismissPending() {
    localStorage.removeItem(pendingEmailKey);
    setPendingEmail(null);
  }

  async function handleSubmitPassword() {
    if (hasPassword && !currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    const strengthError = validatePassword(newPassword);
    if (strengthError) {
      setPasswordError(strengthError);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords don't match.");
      return;
    }
    if (hasPassword && newPassword === currentPassword) {
      setPasswordError(
        "Your new password must be different from your current one."
      );
      return;
    }
    setPasswordError("");
    setPasswordSubmitting(true);
    try {
      if (hasPassword) {
        const result = await changePassword({
          currentPassword,
          newPassword,
          revokeOtherSessions: false,
        });
        if (result.error) {
          // better-auth reports a wrong current password as a bare "Invalid
          // password", which with three password fields on screen doesn't say
          // *which* one it means — name the field instead.
          const raw = result.error.message ?? "";
          const isWrongCurrent =
            result.error.status === 400 && /invalid password/i.test(raw);
          setPasswordError(
            isWrongCurrent
              ? "Your current password is incorrect."
              : raw || "Something went wrong. Please try again."
          );
          return;
        }
      } else {
        const res = await fetch("/api/user/set-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newPassword }),
        });
        if (!res.ok) {
          const d = await res.json().catch(() => ({}));
          setPasswordError(
            d.error ?? "Something went wrong. Please try again."
          );
          return;
        }
        setHasPassword(true);
      }
      closePasswordForm();
      setPasswordSetDone(true);
      setTimeout(() => setPasswordSetDone(false), 4000);
    } catch {
      setPasswordError("Network error — please try again.");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  useEffect(() => {
    setTzTime(timeInZone(timezone));
    const id = setInterval(() => setTzTime(timeInZone(timezone)), 30_000);
    return () => clearInterval(id);
  }, [timezone]);

  async function patch(field: string, value: unknown) {
    setSaving(field);
    setSaved(null);
    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        setSaved(field);
        setTimeout(() => setSaved(null), 2500);
        if (field === "name" && typeof value === "string") {
          updateUser({ name: value });
          window.dispatchEvent(
            new CustomEvent("pagevo:user-name-changed", {
              detail: { name: value },
            })
          );
        }
      }
    } catch {
      /* no-op */
    } finally {
      setSaving(null);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }
    e.target.value = "";
    if (
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        file.type
      )
    ) {
      setAvatarError("Please select a JPG, PNG, WebP, or GIF image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setAvatarError("Image must be smaller than 1 MB.");
      return;
    }
    setAvatarError("");
    const blobUrl = URL.createObjectURL(file);
    setAvatarPreview(blobUrl);
    const result = await upload(file);
    URL.revokeObjectURL(blobUrl);
    setAvatarPreview(null);
    if (result) {
      await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: result.fileUrl }),
      });
      setCurrentImage(result.fileUrl);
      updateUser({ image: result.fileUrl });
      window.dispatchEvent(
        new CustomEvent("pagevo:user-image-changed", {
          detail: { image: result.fileUrl },
        })
      );
    } else {
      const detail = getLastError();
      setAvatarError(
        detail ? `Upload failed: ${detail}` : "Upload failed. Please try again."
      );
    }
  }

  async function handleRemovePhoto() {
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: null }),
    });
    if (res.ok) {
      setCurrentImage(null);
      updateUser({ image: null });
      window.dispatchEvent(
        new CustomEvent("pagevo:user-image-changed", {
          detail: { image: null },
        })
      );
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    // Floor the visible loading duration so a fast rejection doesn't read as a flicker.
    const minDuration = new Promise((resolve) => setTimeout(resolve, 400));
    try {
      const [res] = await Promise.all([
        fetch("/api/user/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: deleteEmail }),
        }),
        minDuration,
      ]);
      if (res.ok) {
        window.location.href = "/";
        return;
      }
      const d = await res.json().catch(() => ({}));
      setDeleteError(d.error ?? "Something went wrong");
      setBlockingWorkspaces(
        Array.isArray(d.blockingWorkspaces) ? d.blockingWorkspaces : []
      );
    } catch {
      await minDuration;
      setDeleteError("Network error");
    } finally {
      setDeleting(false);
    }
  }

  const displayImage = avatarPreview ?? currentImage;
  const displayName = name || user.email;
  const initials = getInitials(displayName);
  const bg = getAvatarColor(displayName);

  return (
    <div className="mx-auto max-w-195 px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6 md:pb-10">
      {emailChangedBanner && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/5 px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success">
              <Check className="text-white" size={11} strokeWidth={3} />
            </span>
            <p className="text-sm font-medium text-success">
              Your email address has been updated.
            </p>
          </div>
          <button
            className="shrink-0 text-success/60 hover:text-success"
            onClick={() => setEmailChangedBanner(false)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Photo ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Photo
      </p>
      <div className="mb-7 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="flex items-center gap-5 px-5 py-5">
          {/* Clickable avatar — a real button, so Enter *and* Space work and
             it is announced as a button without role/tabIndex scaffolding. */}
          <button
            className="group relative size-18 shrink-0 cursor-pointer rounded-full"
            disabled={avatarUploading}
            onClick={() => fileRef.current?.click()}
            onMouseEnter={(e) => showTooltip("Click to upload a photo", e)}
            onMouseLeave={hideTooltip}
            type="button"
          >
            {displayImage ? (
              // biome-ignore lint/performance/noImgElement: avatar src is an OAuth provider URL (Google) or a STORAGE_DRIVER CDN host, neither of which is in next.config images.remotePatterns
              <img
                alt={displayName}
                className="size-18 rounded-full object-cover ring-1 ring-base-300"
                src={displayImage}
              />
            ) : (
              <div
                className={`flex size-18 items-center justify-center rounded-full text-2xl font-bold text-white ring-1 ring-base-300 ${bg}`}
              >
                {initials}
              </div>
            )}
            <div
              className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/45 transition-opacity ${avatarUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
            >
              {avatarUploading ? (
                <Loader2 className="animate-spin text-white" size={20} />
              ) : (
                <Camera className="text-white" size={20} />
              )}
            </div>
          </button>
          {/* Sibling, not a child of the button above — a <button> may not
             contain a form control, even a hidden one. */}
          <input
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarChange}
            ref={fileRef}
            type="file"
          />

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-base-content">
                  {displayName}
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  {avatarUploading
                    ? "Uploading…"
                    : "Click the photo to change it"}
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  JPG, PNG, WebP or GIF · Max 1 MB
                </p>
                {avatarError && (
                  <p className="mt-1.5 text-xs text-error">{avatarError}</p>
                )}
              </div>
              {currentImage && !avatarUploading && (
                <Button
                  className="shrink-0 border-error/30 text-error hover:bg-error/5 hover:border-error/50 hover:text-error"
                  onClick={() => setRemovePhotoConfirm(true)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <X size={12} />
                  Remove photo
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Appearance ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Appearance
      </p>
      <div className="mb-7 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-base-content">Theme</p>
            <p className="mt-0.5 text-xs text-base-content/70">
              Choose a colour theme, or follow your device setting.
            </p>
          </div>
          <ThemeToggle />
        </div>
      </div>

      {/* ── Identity ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Identity
      </p>
      <div className="mb-7 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        {/* Name */}
        <div className="flex items-center justify-between gap-4 border-b border-base-300 px-5 py-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-base-content">
              Preferred name
            </p>
            <p className="mt-0.5 text-xs text-base-content/70">
              How your name appears to teammates.
            </p>
          </div>
          <div className="relative shrink-0">
            <Input
              className="w-55 focus-visible:border-primary"
              onBlur={() => {
                const v = nameRef.current.trim();
                if (v && v !== (user.name ?? "")) {
                  patch("name", v);
                }
              }}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              type="text"
              value={name}
            />
            {saving === "name" && (
              <span className="absolute -bottom-5 right-0 text-xs text-base-content/70">
                Saving…
              </span>
            )}
            {saved === "name" && (
              <span className="absolute -bottom-5 right-0 text-xs text-base-content/70">
                Saved ✓
              </span>
            )}
          </div>
        </div>

        {/* Job title */}
        <div className="flex items-center justify-between gap-4 border-b border-base-300 px-5 py-4">
          <p className="text-sm font-medium text-base-content">Job title</p>
          <div className="relative shrink-0">
            <Input
              className="w-55 focus-visible:border-primary"
              onBlur={() => {
                const v = jobRef.current.trim() || null;
                if (v !== (user.jobTitle ?? null)) {
                  patch("jobTitle", v);
                }
              }}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Product Designer"
              type="text"
              value={jobTitle}
            />
            {saving === "jobTitle" && (
              <span className="absolute -bottom-5 right-0 text-xs text-base-content/70">
                Saving…
              </span>
            )}
            {saved === "jobTitle" && (
              <span className="absolute -bottom-5 right-0 text-xs text-base-content/70">
                Saved ✓
              </span>
            )}
          </div>
        </div>

        {/* Email */}
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium text-base-content">Email</p>
              <p className="mt-0.5 text-xs text-base-content/70">
                Used to sign in to your account.
              </p>
            </div>
            {!changingEmail && (
              <div className="shrink-0 flex flex-col items-end gap-1">
                <Input
                  className="w-55 cursor-not-allowed text-base-content/70"
                  disabled
                  readOnly
                  type="text"
                  value={user.email}
                />
                <button
                  className="text-xs font-medium text-primary hover:underline"
                  onClick={() => {
                    setChangingEmail(true);
                    setNewEmail("");
                    setEmailError("");
                  }}
                  type="button"
                >
                  Change email
                </button>
              </div>
            )}
          </div>

          {changingEmail && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Input
                  autoFocus
                  className="w-65 focus-visible:border-primary"
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="new@email.com"
                  type="email"
                  value={newEmail}
                />
                <Button
                  disabled={emailSending || !newEmail.trim()}
                  onClick={handleSendChangeEmail}
                  size="sm"
                  type="button"
                >
                  {emailSending ? "Sending…" : "Send verification link"}
                </Button>
                <Button
                  onClick={() => {
                    setChangingEmail(false);
                    setNewEmail("");
                    setEmailError("");
                  }}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
              {emailError && <p className="text-xs text-error">{emailError}</p>}
            </div>
          )}

          {pendingEmail && !changingEmail && (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-md border border-primary/20 bg-primary/5 px-3.5 py-2.5">
              <div className="min-w-0 flex items-start gap-2">
                <Clock className="mt-0.5 shrink-0 text-primary" size={14} />
                <div className="min-w-0">
                  <p className="text-xs font-medium text-base-content">
                    Check{" "}
                    <span className="font-semibold">
                      {pendingEmail.newEmail}
                    </span>{" "}
                    for a confirmation link.
                  </p>
                  <p className="mt-0.5 text-[11px] text-base-content/70">
                    {smtpConfigured
                      ? "Link expires in 1 hour. Your current email keeps working until you confirm."
                      : "This instance has no email sending configured — ask your admin to check the server logs for the link."}
                  </p>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  className="text-xs font-medium text-primary hover:underline disabled:opacity-50"
                  disabled={emailSending}
                  onClick={() => sendChangeEmail(pendingEmail.newEmail)}
                  type="button"
                >
                  {emailSending ? "Sending…" : "Resend"}
                </button>
                <span className="text-base-content/50">·</span>
                <button
                  className="text-xs font-medium text-base-content/70 hover:text-base-content"
                  onClick={handleDismissPending}
                  type="button"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Password ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Password
      </p>
      <div className="mb-7 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="px-5 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex items-start gap-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-sm bg-base-200/50">
                <KeyRound className="text-base-content/70" size={14} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-base-content">
                  {hasPassword ? "Password" : "No password set"}
                </p>
                <p className="mt-0.5 text-xs text-base-content/70">
                  {hasPassword
                    ? "You can sign in with either Google or your email and password."
                    : "You currently sign in with Google only. Add a password to also sign in with your email."}
                </p>
              </div>
            </div>
            {!editingPassword && (
              <Button
                className="shrink-0"
                onClick={() => {
                  setEditingPassword(true);
                  setPasswordError("");
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {hasPassword ? "Change password" : "Set password"}
              </Button>
            )}
          </div>

          {editingPassword && (
            <div className="mt-4 space-y-3 border-t border-base-300 pt-4">
              <div className="flex flex-col gap-2">
                {hasPassword && (
                  <Input
                    autoFocus
                    className="w-70 focus-visible:border-primary"
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    type="password"
                    value={currentPassword}
                  />
                )}
                <Input
                  autoFocus={!hasPassword}
                  className="w-70 focus-visible:border-primary"
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  type="password"
                  value={newPassword}
                />
                <Input
                  className="w-70 focus-visible:border-primary"
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  type="password"
                  value={confirmPassword}
                />
              </div>

              {/* Live requirement checklist — shown as soon as the user starts typing
           a new password, so the rules are discoverable up front instead of
           only after a failed submit. */}
              {newPassword.length > 0 && (
                <ul className="flex w-70 flex-col gap-1">
                  {PASSWORD_RULES.map((rule) => {
                    const met = rule.test(newPassword);
                    return (
                      <li
                        className={`flex items-center gap-1.5 text-xs transition-colors duration-150 ${met ? "text-success" : "text-base-content/70"}`}
                        key={rule.id}
                      >
                        {met ? (
                          <Check className="shrink-0" size={12} />
                        ) : (
                          <Circle className="shrink-0" size={12} />
                        )}
                        {rule.label}
                      </li>
                    );
                  })}
                </ul>
              )}

              {passwordError && (
                <p className="text-xs text-error">{passwordError}</p>
              )}
              <div className="flex gap-2">
                <Button
                  disabled={
                    passwordSubmitting ||
                    !newPassword ||
                    !confirmPassword ||
                    (hasPassword && !currentPassword)
                  }
                  onClick={handleSubmitPassword}
                  size="sm"
                  type="button"
                >
                  {passwordSubmitting && (
                    <Loader2 className="animate-spin" size={13} />
                  )}
                  {passwordSubmitting ? "Saving…" : "Save password"}
                </Button>
                <Button
                  onClick={closePasswordForm}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {passwordSetDone && (
            <div className="mt-4 flex items-center gap-1.5 border-t border-base-300 pt-3">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
                <Check className="text-white" size={9} strokeWidth={3} />
              </span>
              <p className="text-xs font-medium text-success">
                Password saved.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Language & time ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Language &amp; time
      </p>
      <div className="mb-7 overflow-hidden rounded-lg border border-base-300 bg-base-100">
        <div className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-base-content">Timezone</p>
            <p className="mt-0.5 text-xs text-base-content/70">
              Used for digest emails and date/time displays.
            </p>
          </div>
          <div className="shrink-0 flex items-center gap-3">
            {tzTime && (
              <p className="flex items-center gap-1.5 text-xs text-base-content/70">
                <Clock className="shrink-0" size={12} />
                Current time:{" "}
                <span className="font-semibold text-base-content">
                  {tzTime}
                </span>
              </p>
            )}
            {saving === "timezone" && (
              <p className="text-xs text-base-content/70">Saving…</p>
            )}
            <TimezoneDropdown
              onChange={(tz) => {
                setTimezone(tz);
                patch("timezone", tz);
              }}
              value={timezone}
            />
          </div>
        </div>
        {saved === "timezone" && (
          <div className="flex items-center justify-end gap-1.5 border-t border-base-300 px-5 py-2">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
              <Check className="text-white" size={9} strokeWidth={3} />
            </span>
            <p className="text-xs font-medium text-success">
              Saved successfully
            </p>
          </div>
        )}
      </div>

      {/* ── Danger zone ── */}
      <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
        Danger zone
      </p>
      <div className="overflow-hidden rounded-lg border border-error/20 bg-error/5">
        <div className="flex items-start gap-4 px-5 py-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-error/10">
            <svg
              className="size-5 text-error"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.75"
              viewBox="0 0 20 20"
            >
              <path d="M10 2L2 17h16L10 2z" />
              <path d="M10 8v4M10 14.5v.5" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-base-content">
              Delete account
            </p>
            <p className="mt-0.5 text-sm text-base-content/70">
              Permanently delete your account and all personal data. This cannot
              be undone.
            </p>
            {deleteOpen ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-base-content">
                  Type{" "}
                  <strong className="font-semibold text-error">
                    {user.email}
                  </strong>{" "}
                  to confirm:
                </p>
                <Input
                  className="w-full border-error/30 focus-visible:border-error"
                  onChange={(e) => setDeleteEmail(e.target.value)}
                  placeholder={user.email}
                  type="email"
                  value={deleteEmail}
                />
                {deleteError && blockingWorkspaces.length === 0 && (
                  <p className="text-xs text-error">{deleteError}</p>
                )}
                {blockingWorkspaces.length > 0 && (
                  <div className="rounded-md border border-warning/30 bg-warning/5 px-3.5 py-3">
                    <div className="flex items-start gap-2.5">
                      <ShieldAlert
                        className="mt-0.5 shrink-0 text-warning"
                        size={16}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-base-content">
                          {deleteError}
                        </p>
                        <ul className="mt-2.5 space-y-1.5">
                          {blockingWorkspaces.map((w) => (
                            <li
                              className="flex items-center justify-between gap-3 rounded-sm border border-base-300 bg-base-100 px-3 py-2"
                              key={w.id}
                            >
                              <div className="min-w-0">
                                <p className="truncate text-xs font-semibold text-base-content">
                                  {w.name}
                                </p>
                                <p className="mt-0.5 text-[11px] text-base-content/70">
                                  {w.hasOtherMembers
                                    ? "You're the only Admin — promote or transfer to someone else"
                                    : "No other members yet — invite someone before deleting your account"}
                                </p>
                              </div>
                              <Link
                                className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:underline"
                                href={`/app/${w.slug}/settings/members`}
                              >
                                Manage members <ArrowRight size={12} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      setDeleteOpen(false);
                      setDeleteEmail("");
                      setDeleteError("");
                      setBlockingWorkspaces([]);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    disabled={
                      deleting ||
                      deleteEmail !== user.email ||
                      blockingWorkspaces.length > 0
                    }
                    onClick={handleDeleteAccount}
                    size="sm"
                    type="button"
                    variant="destructive"
                  >
                    {deleting && <Loader2 className="animate-spin" size={13} />}
                    {deleting ? "Deleting…" : "Delete account"}
                  </Button>
                </div>
              </div>
            ) : (
              <Button
                className="mt-4 border-error/30 text-error hover:bg-error/5 hover:text-error hover:border-error/30"
                onClick={() => setDeleteOpen(true)}
                size="sm"
                type="button"
                variant="outline"
              >
                Delete account…
              </Button>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        confirmLabel="Remove photo"
        description="Your profile photo will be removed and replaced with your initials."
        onConfirm={handleRemovePhoto}
        onOpenChange={setRemovePhotoConfirm}
        open={removePhotoConfirm}
        title="Remove profile photo?"
      />

      {tooltip &&
        typeof document !== "undefined" &&
        createPortal(
          <IconTooltip label={tooltip.label} rect={tooltip.rect} />,
          document.body
        )}
    </div>
  );
}
