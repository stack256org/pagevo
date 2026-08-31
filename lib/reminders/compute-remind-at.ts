import { addDays, addMinutes } from "date-fns";
import { fromZonedTime } from "date-fns-tz";

// Kept structurally compatible with components/database/types.ts's DateValue
// without importing it — lib/ code stays independent of components/.
export interface DateReminderInput {
  date: string | null;
  includeTime?: boolean;
  reminder?: string | null;
  time?: string | null;
  timezone?: string | null;
}

const MINUTES_BEFORE: Record<string, number> = {
  at_time: 0,
  "5m": 5,
  "10m": 10,
  "15m": 15,
  "30m": 30,
  "1h": 60,
  "2h": 120,
};

// Day-based reminders (and "at time of event" on a date with no time set)
// anchor to 9:00 AM local on the target day — matches Notion's own
// "1 day before (9:00 AM)" behavior shown in the reference screenshots.
const DAY_REMINDER_HOUR = 9;

export function computeRemindAt(value: DateReminderInput): Date | null {
  if (!value.reminder || !value.date) {
    return null;
  }
  const timezone =
    value.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  if (value.reminder === "1d" || value.reminder === "2d") {
    const daysBefore = value.reminder === "1d" ? 1 : 2;
    const anchorDate = addDays(new Date(`${value.date}T00:00:00`), -daysBefore);
    const y = anchorDate.getFullYear();
    const m = String(anchorDate.getMonth() + 1).padStart(2, "0");
    const d = String(anchorDate.getDate()).padStart(2, "0");
    const hh = String(DAY_REMINDER_HOUR).padStart(2, "0");
    return fromZonedTime(`${y}-${m}-${d}T${hh}:00:00`, timezone);
  }

  const minutesBefore = MINUTES_BEFORE[value.reminder];
  if (minutesBefore == null) {
    return null;
  }

  if (!value.includeTime || !value.time) {
    // No time on the due date — "at time of event" and the minute/hour
    // options all fall back to the same 9:00 AM anchor as day-based ones.
    const hh = String(DAY_REMINDER_HOUR).padStart(2, "0");
    const anchor = fromZonedTime(`${value.date}T${hh}:00:00`, timezone);
    return addMinutes(anchor, -minutesBefore);
  }

  const eventInstant = fromZonedTime(
    `${value.date}T${value.time}:00`,
    timezone
  );
  return addMinutes(eventInstant, -minutesBefore);
}
