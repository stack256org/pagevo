"use client";

import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { MonthCaptionProps } from "react-day-picker";
import { createPortal } from "react-dom";
import { formatDateValue } from "@/components/database/property-registry";
import {
  currentTimezone,
  listTimezones,
} from "@/components/database/timezone-list";
import type {
  DateFormatOption,
  DateValue,
  ReminderOption,
  TimeFormatOption,
} from "@/components/database/types";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";
import { useScrollLockWhileOpen } from "@/hooks/use-scroll-lock-while-open";
import { computeRemindAt } from "@/lib/reminders/compute-remind-at";
import { cn } from "@/lib/utils";

const DATE_FORMAT_OPTIONS: { value: DateFormatOption; label: string }[] = [
  { value: "full", label: "Full date" },
  { value: "short", label: "Short date" },
  { value: "mdy", label: "Month/Day/Year" },
  { value: "dmy", label: "Day/Month/Year" },
  { value: "ymd", label: "Year/Month/Day" },
  { value: "relative", label: "Relative" },
];

const TIME_FORMAT_OPTIONS: { value: TimeFormatOption; label: string }[] = [
  { value: "hidden", label: "Hidden" },
  { value: "12h", label: "12 hour" },
  { value: "24h", label: "24 hour" },
];

const REMINDER_OPTIONS: {
  value: ReminderOption;
  label: string;
  needsTime?: boolean;
}[] = [
  { value: "at_time", label: "At time of event", needsTime: true },
  { value: "5m", label: "5 minutes before", needsTime: true },
  { value: "10m", label: "10 minutes before", needsTime: true },
  { value: "15m", label: "15 minutes before", needsTime: true },
  { value: "30m", label: "30 minutes before", needsTime: true },
  { value: "1h", label: "1 hour before", needsTime: true },
  { value: "2h", label: "2 hours before", needsTime: true },
  { value: "1d", label: "1 day before" },
  { value: "2d", label: "2 days before" },
];

function formatTime12h(time: string): string {
  const [h, m] = time.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

interface DateValueEditorProps {
  onClose: () => void;
  onSave: (value: DateValue) => void;
  value: unknown;
}

export function DateValueEditor({
  value,
  onSave,
  onClose,
}: DateValueEditorProps) {
  const v: DateValue = (value as DateValue | null) ?? { date: null };
  const rangeOn = !!v.endDate;
  const includeTime = !!v.includeTime;

  const [openFlyout, setOpenFlyout] = useState<
    "format" | "timeFormat" | "timezone" | "remind" | null
  >(null);
  const [flyoutAnchor, setFlyoutAnchor] = useState<DOMRect | null>(null);

  function openFlyoutAt(kind: typeof openFlyout, e: React.MouseEvent) {
    setFlyoutAnchor((e.currentTarget as HTMLElement).getBoundingClientRect());
    setOpenFlyout(kind);
  }

  function save(patch: Partial<DateValue>) {
    onSave({ ...v, ...patch });
  }

  function selectSingle(date: Date | undefined) {
    save({ date: date ? toISODate(date) : null, endDate: null });
  }

  function selectRange(range: { from?: Date; to?: Date } | undefined) {
    save({
      date: range?.from ? toISODate(range.from) : v.date,
      endDate: range?.to ? toISODate(range.to) : null,
    });
  }

  function toggleRange(on: boolean) {
    save({ endDate: on ? (v.date ?? toISODate(new Date())) : null });
  }

  function toggleIncludeTime(on: boolean) {
    save({
      includeTime: on,
      time: on ? (v.time ?? "09:00") : v.time,
      endTime: on && v.endDate ? (v.endTime ?? "09:00") : v.endTime,
    });
  }

  const selectedSingle = v.date ? new Date(`${v.date}T00:00:00`) : undefined;
  const selectedRange = v.date
    ? {
        from: new Date(`${v.date}T00:00:00`),
        to: v.endDate ? new Date(`${v.endDate}T00:00:00`) : undefined,
      }
    : undefined;

  const [viewMonth, setViewMonth] = useState(selectedSingle ?? new Date());

  // Which date/time field ("Now" and, implicitly, clicking either box)
  // targets — start by default; clicking the end date/time box switches it,
  // matching Notion's own click-to-target-a-field behavior.
  const [activeField, setActiveField] = useState<"start" | "end">("start");

  // Calendar-header quick jump — "Today" when there's no time to set, "Now"
  // when there is (matching Notion's own label switch). Applies to whichever
  // field (start/end) is currently active — everything else (the other
  // field, range/time toggles, format, timezone, reminder) stays untouched.
  function jumpToNow() {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (activeField === "end" && rangeOn) {
      save({
        endDate: toISODate(now),
        ...(includeTime ? { endTime: nowTime } : {}),
      });
    } else {
      save({ date: toISODate(now), ...(includeTime ? { time: nowTime } : {}) });
    }
    setViewMonth(now);
  }

  const dateFormat = v.dateFormat ?? "mdy";
  const timeFormat = v.timeFormat ?? "12h";
  const timezone = v.timezone ?? currentTimezone();

  // Picking a new timezone preserves the same absolute moment rather than
  // just relabeling it — e.g. "9:00 AM Calcutta" becomes "12:30 PM Tokyo",
  // not a stale "9:00 AM Tokyo" that's actually a different instant.
  function changeTimezone(newTz: string) {
    if (!v.includeTime || !v.date) {
      save({ timezone: newTz });
      return;
    }
    const patch: Partial<DateValue> = { timezone: newTz };
    if (v.time) {
      const instant = fromZonedTime(`${v.date}T${v.time}:00`, timezone);
      const converted = toZonedTime(instant, newTz);
      patch.date = toISODate(converted);
      patch.time = `${String(converted.getHours()).padStart(2, "0")}:${String(converted.getMinutes()).padStart(2, "0")}`;
    }
    if (v.endDate && v.endTime) {
      const instant = fromZonedTime(`${v.endDate}T${v.endTime}:00`, timezone);
      const converted = toZonedTime(instant, newTz);
      patch.endDate = toISODate(converted);
      patch.endTime = `${String(converted.getHours()).padStart(2, "0")}:${String(converted.getMinutes()).padStart(2, "0")}`;
    }
    save(patch);
  }

  const reminderLabel =
    REMINDER_OPTIONS.find((o) => o.value === v.reminder)?.label ?? "None";
  const dateFormatLabel = DATE_FORMAT_OPTIONS.find(
    (o) => o.value === dateFormat
  )?.label;
  const timeFormatLabel = TIME_FORMAT_OPTIONS.find(
    (o) => o.value === timeFormat
  )?.label;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      {/* Date / time input row(s) — with a time, start and end each get their
          own [date, time] row (stacked); without one, start and end share a
          single [date, date] row, matching Notion's layout either way. */}
      <div className="flex flex-col gap-1.5 p-2.5">
        {includeTime ? (
          <>
            <div className="flex gap-1.5">
              <DateBox
                active={activeField === "start"}
                label={
                  v.date
                    ? formatDateValue({ date: v.date, dateFormat })
                    : "Pick a date"
                }
                onClick={() => setActiveField("start")}
              />
              <TimeInput
                active={activeField === "start"}
                onChange={(t) => save({ time: t })}
                onFocus={() => setActiveField("start")}
                value={v.time ?? "09:00"}
              />
            </div>
            {rangeOn && (
              <div className="flex gap-1.5">
                <DateBox
                  active={activeField === "end"}
                  label={
                    v.endDate
                      ? formatDateValue({ date: v.endDate, dateFormat })
                      : "End date"
                  }
                  onClick={() => setActiveField("end")}
                />
                <TimeInput
                  active={activeField === "end"}
                  onChange={(t) => save({ endTime: t })}
                  onFocus={() => setActiveField("end")}
                  value={v.endTime ?? "09:00"}
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex gap-1.5">
            <DateBox
              active={activeField === "start"}
              label={
                v.date
                  ? formatDateValue({ date: v.date, dateFormat })
                  : "Pick a date"
              }
              onClick={() => setActiveField("start")}
            />
            {rangeOn && (
              <DateBox
                active={activeField === "end"}
                label={
                  v.endDate
                    ? formatDateValue({ date: v.endDate, dateFormat })
                    : "End date"
                }
                onClick={() => setActiveField("end")}
              />
            )}
          </div>
        )}
      </div>

      {rangeOn ? (
        <Calendar
          autoFocus
          components={{
            MonthCaption: monthCaptionWith(includeTime, jumpToNow),
          }}
          mode="range"
          month={viewMonth}
          onMonthChange={setViewMonth}
          onSelect={selectRange}
          selected={selectedRange}
        />
      ) : (
        <Calendar
          autoFocus
          components={{
            MonthCaption: monthCaptionWith(includeTime, jumpToNow),
          }}
          mode="single"
          month={viewMonth}
          onMonthChange={setViewMonth}
          onSelect={selectSingle}
          selected={selectedSingle}
        />
      )}

      <div className="flex flex-col gap-2.5 border-t border-base-300 px-3 py-2.5">
        <ToggleRow
          checked={rangeOn}
          label="End date"
          onCheckedChange={toggleRange}
        />

        <MenuRow
          label="Date format"
          onClick={(e) => openFlyoutAt("format", e)}
          value={dateFormatLabel}
        />

        <ToggleRow
          checked={includeTime}
          label="Include time"
          onCheckedChange={toggleIncludeTime}
        />

        {includeTime && (
          <>
            <MenuRow
              label="Time format"
              onClick={(e) => openFlyoutAt("timeFormat", e)}
              value={timeFormatLabel}
            />
            <MenuRow
              label="Timezone"
              onClick={(e) => openFlyoutAt("timezone", e)}
              value={
                listTimezones().find((z) => z.value === timezone)?.city ??
                timezone
              }
            />
          </>
        )}

        <MenuRow
          label="Remind"
          onClick={(e) => openFlyoutAt("remind", e)}
          value={reminderLabel}
        />
      </div>

      <div className="border-t border-base-300 px-3 py-2">
        <button
          className="text-xs font-medium text-base-content/70 transition-colors duration-150 hover:text-base-content disabled:cursor-not-allowed disabled:opacity-40"
          disabled={!v.date}
          onClick={() => {
            onSave({ date: null });
            onClose();
          }}
          type="button"
        >
          Clear
        </button>
      </div>

      {openFlyout === "format" && flyoutAnchor && (
        <SimpleFlyout
          anchorRect={flyoutAnchor}
          items={DATE_FORMAT_OPTIONS}
          onClose={() => setOpenFlyout(null)}
          onSelect={(val) => save({ dateFormat: val as DateFormatOption })}
          selected={dateFormat}
        />
      )}
      {openFlyout === "timeFormat" && flyoutAnchor && (
        <SimpleFlyout
          anchorRect={flyoutAnchor}
          items={TIME_FORMAT_OPTIONS}
          onClose={() => setOpenFlyout(null)}
          onSelect={(val) => save({ timeFormat: val as TimeFormatOption })}
          selected={timeFormat}
        />
      )}
      {openFlyout === "remind" && flyoutAnchor && (
        <SimpleFlyout
          anchorRect={flyoutAnchor}
          items={[
            { value: "none", label: "None" },
            ...REMINDER_OPTIONS.filter(
              (o) => includeTime || !o.needsTime || o.value === "at_time"
            ).map((o) => ({
              value: o.value,
              label: dayAnchorSuffix(o.value, includeTime, v.date)
                ? `${o.label} (${dayAnchorSuffix(o.value, includeTime, v.date)})`
                : o.label,
            })),
          ]}
          onClose={() => setOpenFlyout(null)}
          onSelect={(val) =>
            save({ reminder: val === "none" ? null : (val as ReminderOption) })
          }
          selected={v.reminder ?? "none"}
        />
      )}
      {openFlyout === "timezone" && flyoutAnchor && (
        <TimezoneFlyout
          anchorRect={flyoutAnchor}
          onClose={() => setOpenFlyout(null)}
          onSelect={changeTimezone}
          selected={timezone}
        />
      )}
    </div>
  );
}

function dayAnchorSuffix(
  reminder: ReminderOption,
  includeTime: boolean,
  date: string | null
): string | null {
  if (includeTime) {
    return null;
  }
  if (reminder !== "1d" && reminder !== "2d" && reminder !== "at_time") {
    return null;
  }
  if (!date) {
    return null;
  }
  const remindAt = computeRemindAt({ date, reminder, includeTime: false });
  return remindAt
    ? formatTime12h(
        `${String(remindAt.getHours()).padStart(2, "0")}:${String(remindAt.getMinutes()).padStart(2, "0")}`
      )
    : null;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Small building blocks ─────────────────────────────────────────────────────

// Calendar month caption ("July 2026") plus a "Today"/"Now" quick-jump link,
// matching Notion's own calendar header. react-day-picker renders the label
// itself as `children` — this just adds the jump link alongside it rather
// than reimplementing the label.
// Hoisted out of the editor's body so it isn't a component defined inside
// another component. The returned identity still changes per render, exactly
// as the previous inline arrow did, so react-day-picker behaves identically.
function monthCaptionWith(includeTime: boolean, onJump: () => void) {
  return function MonthCaption(p: MonthCaptionProps) {
    return <MonthCaptionNow {...p} includeTime={includeTime} onJump={onJump} />;
  };
}

function MonthCaptionNow({
  className,
  children,
  calendarMonth: _calendarMonth,
  displayIndex: _displayIndex,
  includeTime,
  onJump,
  ...divProps
}: MonthCaptionProps & { includeTime: boolean; onJump: () => void }) {
  return (
    <div className={className} {...divProps}>
      {children}
      <button
        className="ml-2.5 rounded-xs px-1.5 py-0.5 text-xs font-medium text-primary transition-colors duration-150 hover:bg-base-200"
        onClick={onJump}
        type="button"
      >
        {includeTime ? "Now" : "Today"}
      </button>
    </div>
  );
}

// `active` marks which field (start/end) "Now"/"Today" and clicking a
// calendar day currently target — clicking the box switches the target,
// matching Notion's own click-to-target-a-field behavior.
function DateBox({
  label,
  active,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={cn(
        "flex h-8 flex-1 items-center rounded-xs border bg-base-100 px-2.5 text-left text-xs text-base-content transition-colors duration-150",
        active ? "border-primary ring-1 ring-primary/30" : "border-base-300"
      )}
      onClick={onClick}
      type="button"
    >
      <span className="truncate">{label}</span>
    </button>
  );
}

// Plain text field, not <input type="time"> — that triggers the browser's
// native OS time-picker widget on click, which can't be themed and looks
// completely out of place next to the rest of this popover.
function TimeInput({
  value,
  onChange,
  active,
  onFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  active?: boolean;
  onFocus?: () => void;
}) {
  const [draft, setDraft] = useState(() => formatTime12h(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatTime12h(value));
    }
  }, [value, focused]);

  function commit() {
    const parsed = parseTime(draft);
    setDraft(formatTime12h(parsed ?? value));
    setFocused(false);
    if (parsed && parsed !== value) {
      onChange(parsed);
    }
  }

  return (
    <input
      className={cn(
        "h-8 w-28 shrink-0 rounded-xs border bg-base-100 px-2 text-xs text-base-content focus:outline-none focus:border-primary/50",
        active ? "border-primary" : "border-base-300"
      )}
      inputMode="numeric"
      onBlur={commit}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.currentTarget as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setDraft(formatTime12h(value));
          setFocused(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      placeholder="9:00 AM"
      type="text"
      value={draft}
    />
  );
}

// Accepts "9:00 AM", "9:00am", "9am", "09:00", "21:00" — anything with an
// AM/PM suffix is 12-hour, otherwise treated as 24-hour. Returns "HH:mm" or
// null when unparseable (caller keeps the previous value).
function parseTime(input: string): string | null {
  const m = input.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/i);
  if (!m) {
    return null;
  }
  let h = Number.parseInt(m[1], 10);
  const min = m[2] ? Number.parseInt(m[2], 10) : 0;
  const meridiem = m[3]?.toUpperCase();
  if (min > 59) {
    return null;
  }
  if (meridiem) {
    if (h < 1 || h > 12) {
      return null;
    }
    h = meridiem === "AM" ? (h === 12 ? 0 : h) : h === 12 ? 12 : h + 12;
  } else if (h > 23) {
    return null;
  }
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function ToggleRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-base-content">{label}</span>
      <Switch
        aria-label={label}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
      />
    </div>
  );
}

function MenuRow({
  label,
  value,
  onClick,
}: {
  label: string;
  value?: string;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className="flex items-center justify-between rounded-xs py-0.5 text-xs transition-colors duration-150 hover:text-base-content"
      onClick={onClick}
      type="button"
    >
      <span className="text-base-content">{label}</span>
      <span className="flex items-center gap-1 text-base-content/70">
        {value}
        <ChevronRight className="text-base-content/70" size={12} />
      </span>
    </button>
  );
}

// Portal anchored to a captured trigger rect (see OptionSubmenu), paired with
// useScrollLockWhileOpen since it's positioned once and can't track scroll.
// data-edit-property-exempt keeps the parent popover's outside-click handler from closing it.
function flyoutPosition(anchorRect: DOMRect, width: number, height: number) {
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  const left = Math.max(8, Math.min(anchorRect.right + 6, winW - width - 8));
  const top =
    anchorRect.bottom + height > winH
      ? Math.max(8, winH - height - 8)
      : Math.max(8, anchorRect.top - 4);
  return {
    position: "fixed" as const,
    top,
    left,
    width,
    maxHeight: height,
    zIndex: 260,
  };
}

function useOutsideClose(
  ref: React.RefObject<HTMLDivElement | null>,
  onClose: () => void
) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    function handler(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (ref.current && !ref.current.contains(target)) {
        closeRef.current();
      }
    }
    function keyHandler(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeRef.current();
      }
    }
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [ref]);
}

function SimpleFlyout({
  anchorRect,
  items,
  selected,
  onSelect,
  onClose,
}: {
  anchorRect: DOMRect;
  items: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useOutsideClose(ref, onClose);
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));
  if (typeof document === "undefined") {
    return null;
  }

  const style = flyoutPosition(
    anchorRect,
    220,
    Math.min(320, 40 + items.length * 30)
  );

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: event-isolation guard, not a control — the only handler is stopPropagation, keeping clicks inside this anchored dropdown from reaching the date cell that opened it. There is no activation to key-handle, every option inside is a native button, and adding role/tabIndex here would create a tab stop that does nothing.
    <div
      className="overflow-y-auto rounded-md border border-base-300 bg-base-200 p-1 shadow-lg"
      data-edit-property-exempt
      onClick={(e) => e.stopPropagation()}
      ref={ref}
      style={style}
    >
      {items.map((item) => (
        <button
          className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
          key={item.value}
          onClick={() => {
            onSelect(item.value);
            onClose();
          }}
          type="button"
        >
          <span className="truncate text-left">{item.label}</span>
          {item.value === selected && (
            <Check className="shrink-0 text-primary" size={13} />
          )}
        </button>
      ))}
    </div>,
    document.body
  );
}

function TimezoneFlyout({
  anchorRect,
  selected,
  onSelect,
  onClose,
}: {
  anchorRect: DOMRect;
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  useOutsideClose(ref, onClose);
  useScrollLockWhileOpen(true, (target) => !!ref.current?.contains(target));
  if (typeof document === "undefined") {
    return null;
  }

  const style = flyoutPosition(anchorRect, 260, 380);
  const zones = listTimezones();
  const current = zones.find((z) => z.value === currentTimezone());
  const q = search.trim().toLowerCase();
  const filtered = q
    ? zones.filter(
        (z) =>
          z.city.toLowerCase().includes(q) || z.value.toLowerCase().includes(q)
      )
    : // No search — the current zone already has its own pinned row above,
      // so drop it from the full list instead of showing it twice.
      zones.filter((z) => z.value !== current?.value);

  return createPortal(
    // biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/noNoninteractiveElementInteractions lint/a11y/useKeyWithClickEvents: event-isolation guard, not a control — the only handler is stopPropagation, keeping clicks inside this anchored panel from reaching the date cell that opened it. There is no activation to key-handle, the search input and option buttons inside own their own keyboard handling, and adding role/tabIndex here would create a tab stop that does nothing.
    <div
      className="overflow-hidden rounded-md border border-base-300 bg-base-200 shadow-lg"
      data-edit-property-exempt
      onClick={(e) => e.stopPropagation()}
      ref={ref}
      style={{ ...style, display: "flex", flexDirection: "column" }}
    >
      <div className="shrink-0 border-b border-base-300 px-2.5 py-2">
        <input
          autoFocus
          className="w-full bg-transparent text-xs placeholder:text-base-content/50 focus:outline-none"
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cities, timezones…"
          value={search}
        />
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {!q && current && (
          <>
            <p className="px-2 pb-0.5 pt-1 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
              Current timezone
            </p>
            <TimezoneRow
              onSelect={() => {
                onSelect(current.value);
                onClose();
              }}
              selected={selected === current.value}
              zone={current}
            />
          </>
        )}
        {!q && (
          <p className="px-2 pb-0.5 pt-1.5 text-2xs font-semibold uppercase tracking-wider text-base-content/50">
            Select a timezone
          </p>
        )}
        {filtered.map((z) => (
          <TimezoneRow
            key={z.value}
            onSelect={() => {
              onSelect(z.value);
              onClose();
            }}
            selected={selected === z.value}
            zone={z}
          />
        ))}
      </div>
    </div>,
    document.body
  );
}

function TimezoneRow({
  zone,
  selected,
  onSelect,
}: {
  zone: { value: string; city: string; offsetLabel: string };
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-xs text-base-content transition-colors duration-150 hover:bg-base-200"
      onClick={onSelect}
      type="button"
    >
      <span className="flex min-w-0 flex-col text-left">
        <span className="truncate">{zone.city}</span>
        <span className="truncate text-2xs text-base-content/70">
          {zone.offsetLabel}
        </span>
      </span>
      {selected && <Check className="shrink-0 text-primary" size={13} />}
    </button>
  );
}
