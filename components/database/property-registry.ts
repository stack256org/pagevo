// Property Registry — one entry per type. Never scatter switch(type) across the codebase.
// Each entry defines: icon, label, empty value, display formatter, cell editor component name.

import {
  ArrowLeftRight,
  Calendar,
  CheckSquare,
  CircleDashed,
  CircleDot,
  Hash,
  Link,
  type LucideIcon,
  Mail,
  Paperclip,
  Phone,
  Sigma,
  SquareFunction,
  Tag,
  Type,
  User,
} from "lucide-react";
import type {
  DateValue,
  SelectOption,
  StatusGroupKey,
} from "@/components/database/types";

export type PropertyType =
  | "text"
  | "number"
  | "select"
  | "multi_select"
  | "status"
  | "date"
  | "checkbox"
  | "url"
  | "email"
  | "phone"
  | "person"
  | "relation"
  | "rollup"
  | "formula"
  | "created_by"
  | "files";

export interface PropertyDefinition {
  emptyValue: unknown; // default JSONB value when a cell is first touched
  filterable: boolean;
  icon: string; // emoji or symbol shown in header
  label: string;
  sortable: boolean;
  type: PropertyType;
}

export const PROPERTY_REGISTRY: Record<PropertyType, PropertyDefinition> = {
  text: {
    type: "text",
    label: "Text",
    icon: "T",
    emptyValue: { text: "" },
    sortable: true,
    filterable: true,
  },
  number: {
    type: "number",
    label: "Number",
    icon: "#",
    emptyValue: { number: null },
    sortable: true,
    filterable: true,
  },
  select: {
    type: "select",
    label: "Select",
    icon: "◉",
    emptyValue: { optionId: null },
    sortable: true,
    filterable: true,
  },
  multi_select: {
    type: "multi_select",
    label: "Multi-select",
    icon: "⊕",
    emptyValue: { optionIds: [] },
    sortable: false,
    filterable: true,
  },
  status: {
    type: "status",
    label: "Status",
    icon: "◍",
    emptyValue: { optionId: null },
    sortable: true,
    filterable: true,
  },
  date: {
    type: "date",
    label: "Date",
    icon: "📅",
    emptyValue: { date: null },
    sortable: true,
    filterable: true,
  },
  checkbox: {
    type: "checkbox",
    label: "Checkbox",
    icon: "☑",
    emptyValue: { checked: false },
    sortable: true,
    filterable: true,
  },
  url: {
    type: "url",
    label: "URL",
    icon: "🔗",
    emptyValue: { url: "" },
    sortable: false,
    filterable: true,
  },
  email: {
    type: "email",
    label: "Email",
    icon: "✉",
    emptyValue: { email: "" },
    sortable: false,
    filterable: true,
  },
  phone: {
    type: "phone",
    label: "Phone",
    icon: "☎",
    emptyValue: { phone: "" },
    sortable: false,
    filterable: true,
  },
  person: {
    type: "person",
    label: "Person",
    icon: "👤",
    emptyValue: { userIds: [] },
    sortable: false,
    filterable: true,
  },
  relation: {
    type: "relation",
    label: "Relation",
    icon: "↗",
    emptyValue: { entryIds: [] },
    sortable: false,
    filterable: true,
  },
  rollup: {
    type: "rollup",
    label: "Rollup",
    icon: "Σ",
    // Computed server-side on every read (see app/api/databases/[id]/entries/route.ts)
    // — never written directly, so there's no meaningful "empty" client value.
    emptyValue: null,
    sortable: false,
    filterable: false,
  },
  formula: {
    type: "formula",
    label: "Formula",
    icon: "ƒ",
    // Also computed server-side (see lib/formula/), same reasoning as Rollup.
    emptyValue: null,
    sortable: false,
    filterable: false,
  },
  created_by: {
    type: "created_by",
    label: "Created by",
    icon: "👤",
    // Computed server-side from the entry's own createdBy column on every
    // read (see app/api/databases/[id]/entries/route.ts) — never written
    // directly, same reasoning as Rollup/Formula.
    emptyValue: null,
    sortable: false,
    filterable: false,
  },
  files: {
    type: "files",
    label: "Files & media",
    icon: "📎",
    emptyValue: { files: [] },
    sortable: false,
    filterable: true,
  },
};

export const PROPERTY_TYPES = Object.values(PROPERTY_REGISTRY);

// Single source of truth for the icon COMPONENT shown for each property type —
// column headers, the edit-property panel, entry side panels, and the "add
// property" type picker must all render the same icon for a given type, or a
// property visually looks like a different type depending on where it's shown.
export const PROPERTY_TYPE_ICON: Record<PropertyType, LucideIcon> = {
  text: Type,
  number: Hash,
  select: CircleDashed,
  multi_select: Tag,
  status: CircleDot,
  date: Calendar,
  checkbox: CheckSquare,
  url: Link,
  email: Mail,
  phone: Phone,
  person: User,
  relation: ArrowLeftRight,
  rollup: Sigma,
  formula: SquareFunction,
  created_by: User,
  files: Paperclip,
};

// ── Select / Multi-select option colors ──────────────────────────────────────
// Using inline style values so colors apply immediately without Tailwind JIT compilation.
// Append-only: never reorder or remove entries — saved `option.color` ids must stay valid.
export const OPTION_COLORS = [
  { id: "gray", bg: "#d4d4d8", text: "#3f3f46", dot: "#71717a" },
  { id: "red", bg: "#fecaca", text: "#b91c1c", dot: "#f87171" },
  { id: "orange", bg: "#fed7aa", text: "#c2410c", dot: "#fb923c" },
  { id: "yellow", bg: "#fef08a", text: "#a16207", dot: "#facc15" },
  { id: "green", bg: "#bbf7d0", text: "#15803d", dot: "#4ade80" },
  { id: "teal", bg: "#99f6e4", text: "#0f766e", dot: "#2dd4bf" },
  { id: "blue", bg: "#bae6fd", text: "#0369a1", dot: "#38bdf8" },
  { id: "purple", bg: "#ddd6fe", text: "#6d28d9", dot: "#a78bfa" },
  { id: "pink", bg: "#fbcfe8", text: "#be185d", dot: "#f472b6" },
  { id: "default", bg: "#f1f1ef", text: "#787774", dot: "#c9c9c7" },
  { id: "brown", bg: "#e9dfd4", text: "#8a5a3b", dot: "#a18072" },
] as const;

export type OptionColorId = (typeof OPTION_COLORS)[number]["id"];

export function getOptionColor(colorId: string | undefined) {
  return OPTION_COLORS.find((c) => c.id === colorId) ?? OPTION_COLORS[0];
}

// ── Status groups ─────────────────────────────────────────────────────────────

export const STATUS_GROUPS = [
  { key: "todo", label: "To-do" },
  { key: "in_progress", label: "In progress" },
  { key: "complete", label: "Complete" },
] as const satisfies readonly { key: StatusGroupKey; label: string }[];

export interface OptionGroup {
  key: string;
  label: string;
  options: SelectOption[];
}

// Single source of truth for sectioning options — shared by the cell dropdown
// and the edit-property side panel so grouped vs. flat rendering never diverges.
export function groupOptions(
  options: SelectOption[],
  grouped: boolean
): OptionGroup[] {
  if (!grouped) {
    return [{ key: "flat", label: "", options }];
  }
  return STATUS_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    options: options.filter((o) => (o.group ?? "in_progress") === g.key),
  }));
}

// One-time heuristic to bucket ungrouped options into status groups by name.
export function inferStatusGroups(options: SelectOption[]): SelectOption[] {
  return options.map((o) => {
    if (o.group) {
      return o;
    }
    const name = o.name.toLowerCase();
    if (/not started|todo|to-do|backlog|planning/.test(name)) {
      return { ...o, group: "todo" as StatusGroupKey };
    }
    if (/done|complete|finished/.test(name)) {
      return { ...o, group: "complete" as StatusGroupKey };
    }
    return { ...o, group: "in_progress" as StatusGroupKey };
  });
}

// ── Number format helpers ─────────────────────────────────────────────────────
export type NumberFormat =
  | "number"
  | "currency_usd"
  | "currency_eur"
  | "percent"
  | "scientific";

export function formatNumber(
  value: number | null | undefined,
  format: NumberFormat = "number"
): string {
  if (value == null) {
    return "";
  }
  switch (format) {
    case "currency_usd":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(value);
    case "currency_eur":
      return new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(value);
    case "percent":
      return `${value}%`;
    case "scientific":
      return value.toExponential(2);
    default:
      return new Intl.NumberFormat().format(value);
  }
}

// ── Date format helpers ───────────────────────────────────────────────────────
export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Built manually (no toLocaleDateString): locale/ICU defaults padded formats
// inconsistently and could differ between server-render and client-hydrate.
function formatSingleDate(
  dateStr: string,
  format: DateValue["dateFormat"] = "mdy"
): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const yyyy = d.getFullYear();
  switch (format) {
    case "full":
      return `${MONTH_LONG[d.getMonth()]} ${d.getDate()}, ${yyyy}`;
    case "short":
      return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
    case "dmy":
      return `${dd}/${mm}/${yyyy}`;
    case "ymd":
      return `${yyyy}/${mm}/${dd}`;
    case "relative": {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
      if (days === 0) {
        return "Today";
      }
      if (days === 1) {
        return "Tomorrow";
      }
      if (days === -1) {
        return "Yesterday";
      }
      // Matches this app's own relative-timestamp convention (Hard Rule 36):
      // relative wording for < 7 days out, absolute date beyond that — so a
      // date a year away doesn't render as an absurd "510 days ago".
      if (days > 1 && days < 7) {
        return `In ${days} days`;
      }
      if (days < -1 && days > -7) {
        return `${-days} days ago`;
      }
      return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}, ${yyyy}`;
    }
    default:
      return `${mm}/${dd}/${yyyy}`;
  }
}

function formatSingleTime(
  time: string,
  format: DateValue["timeFormat"] = "12h"
): string {
  if (format === "hidden") {
    return "";
  }
  const [h, m] = time.split(":").map(Number);
  if (format === "24h") {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

// Single source of truth for rendering a `date`-type property's value —
// range, chosen format, and optional time, used by every read-only display
// site (cell-display, table/board/gallery views) so they all agree with what
// the rich date editor lets you configure.
export function formatDateValue(value: unknown): string {
  const v = value as DateValue | null | undefined;
  if (!v?.date) {
    return "";
  }

  const startDate = formatSingleDate(v.date, v.dateFormat);
  const startTime =
    v.includeTime && v.time ? formatSingleTime(v.time, v.timeFormat) : "";
  const start = startTime ? `${startDate} ${startTime}` : startDate;

  if (!v.endDate || v.endDate === v.date) {
    return start;
  }

  const endDate = formatSingleDate(v.endDate, v.dateFormat);
  const endTime =
    v.includeTime && v.endTime ? formatSingleTime(v.endTime, v.timeFormat) : "";
  const end = endTime ? `${endDate} ${endTime}` : endDate;

  return `${start} → ${end}`;
}
