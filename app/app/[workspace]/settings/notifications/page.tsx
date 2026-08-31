"use client";

import { Check, Loader2, Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

type Frequency = "realtime" | "daily" | "weekly" | "off";

const DAYS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_FULL = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const FREQ_OPTIONS: {
  value: Frequency;
  icon: string;
  label: string;
  desc: string;
}[] = [
  {
    value: "realtime",
    icon: "⚡",
    label: "Real-time",
    desc: "Get notified instantly",
  },
  {
    value: "daily",
    icon: "🌅",
    label: "Daily digest",
    desc: "One email every morning",
  },
  {
    value: "weekly",
    icon: "📆",
    label: "Weekly digest",
    desc: "One email per week",
  },
];

type EventKey =
  | "notifyMentions"
  | "notifyPageUpdates"
  | "notifyWorkspaceInvites"
  | "notifyTaskAssignments";

const EVENTS: { key: EventKey; icon: string; label: string; desc: string }[] = [
  {
    key: "notifyMentions",
    icon: "💬",
    label: "Mentions",
    desc: "Someone @mentions you in a comment or page",
  },
  {
    key: "notifyPageUpdates",
    icon: "📝",
    label: "Page updates",
    desc: "Pages you follow are edited or published",
  },
  {
    key: "notifyWorkspaceInvites",
    icon: "✉️",
    label: "Workspace invites",
    desc: "You're invited to join a workspace",
  },
  {
    key: "notifyTaskAssignments",
    icon: "📋",
    label: "Task assignments",
    desc: "A task or action item is assigned to you",
  },
];

export default function NotificationSettingsPage() {
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [weeklyDay, setWeeklyDay] = useState(1);
  const [emailOn, setEmailOn] = useState(true);
  const [events, setEvents] = useState<Record<EventKey, boolean>>({
    notifyMentions: true,
    notifyPageUpdates: true,
    notifyWorkspaceInvites: true,
    notifyTaskAssignments: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  // Snapshot of the last loaded/saved values, so the Save button can stay
  // disabled until something actually changes rather than just "not saving".
  const [savedSnapshot, setSavedSnapshot] = useState("");

  useEffect(() => {
    fetch("/api/user/notification-preferences")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) {
          return;
        }
        const freq: Frequency = d.emailFrequency ?? "daily";
        const nextEmailOn = freq !== "off";
        const nextFrequency = freq === "off" ? "daily" : freq;
        const nextWeeklyDay = d.weeklyDigestDay ?? 1;
        const nextEvents: Record<EventKey, boolean> = {
          notifyMentions: d.notifyMentions ?? true,
          notifyPageUpdates: d.notifyPageUpdates ?? true,
          notifyWorkspaceInvites: d.notifyWorkspaceInvites ?? true,
          notifyTaskAssignments: d.notifyTaskAssignments ?? true,
        };
        setEmailOn(nextEmailOn);
        setFrequency(nextFrequency);
        setWeeklyDay(nextWeeklyDay);
        setEvents(nextEvents);
        setSavedSnapshot(
          JSON.stringify({
            emailOn: nextEmailOn,
            frequency: nextFrequency,
            weeklyDay: nextWeeklyDay,
            events: nextEvents,
          })
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const isDirty =
    savedSnapshot !== JSON.stringify({ emailOn, frequency, weeklyDay, events });

  async function save() {
    setSaving(true);
    setSaved(false);
    setSaveError("");
    // The PATCH below usually resolves in well under 100ms, which makes the
    // spinner flash imperceptibly — hold it up for a minimum stretch so the
    // saving -> saved transition actually reads as feedback to the user.
    const minSpinner = new Promise((resolve) => setTimeout(resolve, 500));
    try {
      const [res] = await Promise.all([
        fetch("/api/user/notification-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            emailFrequency: emailOn ? frequency : "off",
            weeklyDigestDay: weeklyDay,
            ...events,
          }),
        }),
        minSpinner,
      ]);
      if (res.ok) {
        setSavedSnapshot(
          JSON.stringify({ emailOn, frequency, weeklyDay, events })
        );
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setSaveError("Failed to save — please try again.");
      }
    } catch {
      await minSpinner;
      setSaveError("Network error — change wasn't saved.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-base-content/70" size={28} />
          <p className="text-sm text-base-content/70">Loading preferences…</p>
        </div>
      </div>
    );
  }

  const freqLabel = emailOn
    ? frequency === "realtime"
      ? "Instant"
      : frequency === "daily"
        ? "Daily"
        : "Weekly"
    : "Off";

  return (
    <div className="mx-auto max-w-195 px-4 pt-4 pb-8 sm:px-6 md:px-8 md:pt-6 md:pb-10">
      <p className="rounded-md border border-base-300 bg-base-200/20 px-4 py-2.5 text-xs text-base-content/70">
        These preferences are per-account, not per-workspace — they apply the
        same way across every workspace you&apos;re a member of.
      </p>

      {/* ── Email channel card ── */}
      <div className="mt-8">
        <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
          Channel
        </p>
        <div
          className={`overflow-hidden rounded-lg border transition-colors duration-150 ${emailOn ? "border-base-300 bg-base-100" : "border-base-300 bg-base-200/20"}`}
        >
          <div className="flex items-center gap-4 p-5">
            <div
              className={`flex size-11 shrink-0 items-center justify-center rounded-md transition-colors ${emailOn ? "bg-primary" : "bg-base-200"}`}
            >
              <Mail
                className={
                  emailOn ? "text-primary-content" : "text-base-content/70"
                }
                size={20}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Label className="text-[14.5px] font-semibold text-base-content">
                  Email notifications
                </Label>
                <span
                  className={`rounded-xs px-2 py-0.5 text-xs font-bold ${emailOn ? "bg-base-200 text-base-content" : "bg-base-200 text-base-content/70"}`}
                >
                  {emailOn ? "Active" : "Paused"}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-base-content/70">
                {emailOn
                  ? `Receiving ${freqLabel.toLowerCase()} digests`
                  : "All email notifications are paused"}
              </p>
            </div>
            <Switch
              aria-label="Toggle email notifications"
              checked={emailOn}
              onCheckedChange={setEmailOn}
            />
          </div>
        </div>
      </div>

      {/* ── Delivery frequency ── */}
      <div
        className={`mt-7 transition-opacity duration-300 ${emailOn ? "" : "pointer-events-none select-none opacity-40"}`}
      >
        <p className="mb-2 text-xs font-semibold tracking-wide text-base-content/70">
          Delivery frequency
        </p>
        <div className="grid grid-cols-3 gap-3">
          {FREQ_OPTIONS.map((opt) => {
            const isActive = frequency === opt.value;
            return (
              <button
                className={`flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors duration-150 ${
                  isActive
                    ? "border-primary/30 bg-base-200"
                    : "border-base-300 bg-base-100 hover:border-base-300 hover:bg-base-200"
                }`}
                key={opt.value}
                onClick={() => setFrequency(opt.value)}
                type="button"
              >
                <div
                  className={`flex size-9 items-center justify-center rounded-sm text-lg ${isActive ? "bg-base-100" : "bg-base-200/50"}`}
                >
                  {opt.icon}
                </div>
                <div className="flex-1">
                  <p
                    className={`text-sm font-semibold leading-tight ${isActive ? "text-base-content" : "text-base-content"}`}
                  >
                    {opt.label}
                  </p>
                  <p className="mt-0.5 text-xs text-base-content/70">
                    {opt.desc}
                  </p>
                </div>
                {isActive && (
                  <div className="ml-auto flex size-5 items-center justify-center rounded-xs bg-primary self-end">
                    <Check
                      className="text-primary-content"
                      size={11}
                      strokeWidth={3}
                    />
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Weekly day picker */}
        {frequency === "weekly" && (
          <div className="mt-4 overflow-hidden rounded-md border border-base-300 bg-base-100 p-4">
            <p className="mb-3 text-sm text-base-content/70">
              Send digest every
              <span className="ml-1.5 font-semibold text-base-content">
                {DAY_FULL[weeklyDay]}
              </span>
            </p>
            <div className="flex gap-2">
              {DAYS.map((d, i) => (
                <button
                  className={`flex size-9 items-center justify-center rounded-sm text-sm font-bold transition-colors duration-150 ${
                    weeklyDay === i
                      ? "bg-primary text-primary-content"
                      : "bg-base-200/50 text-base-content/70 hover:bg-base-200"
                  }`}
                  key={DAY_FULL[i]}
                  onClick={() => setWeeklyDay(i)}
                  type="button"
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── What you'll receive ── */}
      <div className="mt-7">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold tracking-wide text-base-content/70">
            What you'll receive
          </p>
          <span className="rounded-xs bg-base-200 px-2 py-0.5 text-xs font-bold text-base-content/70">
            {freqLabel}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {EVENTS.map((ev) => (
            <div
              className={`flex flex-col gap-3 rounded-md border border-base-300 bg-base-100 p-4 transition-colors duration-150 ${emailOn ? "" : "opacity-40"}`}
              key={ev.key}
            >
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-sm bg-base-200/50 text-base">
                  {ev.icon}
                </span>
                <Switch
                  aria-label={`Toggle ${ev.label.toLowerCase()} notifications`}
                  checked={events[ev.key]}
                  disabled={!emailOn}
                  onCheckedChange={(checked) =>
                    setEvents((prev) => ({ ...prev, [ev.key]: checked }))
                  }
                />
              </div>
              <div>
                <p className="text-sm font-semibold text-base-content">
                  {ev.label}
                </p>
                <p className="mt-0.5 text-xs text-base-content/70 leading-relaxed">
                  {ev.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Save button ── */}
      <div className="mt-8 flex items-center justify-end gap-3">
        {saveError && <span className="text-sm text-error">{saveError}</span>}
        {saved && (
          <span className="flex items-center gap-1.5">
            <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-success">
              <Check className="text-white" size={9} strokeWidth={3} />
            </span>
            <span className="text-sm font-medium text-success">Saved</span>
          </span>
        )}
        <Button
          disabled={saving || !isDirty}
          onClick={save}
          size="sm"
          type="button"
        >
          {saving && <Loader2 className="animate-spin" size={13} />}
          {saving ? "Saving…" : "Save preferences"}
        </Button>
      </div>
    </div>
  );
}
