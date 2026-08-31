// v1 function library — deliberately smaller than Notion's full Formula 2.0
// library (documented scope trim, not an oversight): Math, Text, Date, and
// Logical basics, covering the functions teams reach for most often.

import { FormulaEvalError, type FormulaValue } from "./types";

function toNumber(v: FormulaValue, fnName: string): number {
  if (typeof v === "number") {
    return v;
  }
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  throw new FormulaEvalError(`${fnName}() expects a number`);
}
function toStr(v: FormulaValue): string {
  if (v == null) {
    return "";
  }
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  return String(v);
}
function toDate(v: FormulaValue, fnName: string): Date {
  if (v instanceof Date) {
    return v;
  }
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) {
      return d;
    }
  }
  throw new FormulaEvalError(`${fnName}() expects a date`);
}
function isTruthy(v: FormulaValue): boolean {
  if (v == null) {
    return false;
  }
  if (typeof v === "boolean") {
    return v;
  }
  if (typeof v === "number") {
    return v !== 0;
  }
  if (typeof v === "string") {
    return v.length > 0;
  }
  return true;
}

const MS_PER_UNIT: Record<string, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
};

export const FORMULA_FUNCTIONS: Record<
  string,
  (args: FormulaValue[]) => FormulaValue
> = {
  // ── Math ──────────────────────────────────────────────────────────────────
  abs: (a) => Math.abs(toNumber(a[0], "abs")),
  round: (a) => Math.round(toNumber(a[0], "round")),
  ceil: (a) => Math.ceil(toNumber(a[0], "ceil")),
  floor: (a) => Math.floor(toNumber(a[0], "floor")),
  min: (a) => Math.min(...a.map((v) => toNumber(v, "min"))),
  max: (a) => Math.max(...a.map((v) => toNumber(v, "max"))),
  sum: (a) => a.reduce((s: number, v) => s + toNumber(v, "sum"), 0),

  // ── Text ──────────────────────────────────────────────────────────────────
  concat: (a) => a.map(toStr).join(""),
  length: (a) => toStr(a[0]).length,
  upper: (a) => toStr(a[0]).toUpperCase(),
  lower: (a) => toStr(a[0]).toLowerCase(),
  slice: (a) =>
    toStr(a[0]).slice(
      toNumber(a[1], "slice"),
      a[2] == null ? undefined : toNumber(a[2], "slice")
    ),
  replace: (a) => toStr(a[0]).split(toStr(a[1])).join(toStr(a[2])),

  // ── Date ──────────────────────────────────────────────────────────────────
  now: () => new Date(),
  dateAdd: (a) =>
    new Date(
      toDate(a[0], "dateAdd").getTime() +
        toNumber(a[1], "dateAdd") *
          (MS_PER_UNIT[toStr(a[2])] ?? MS_PER_UNIT.days)
    ),
  dateSubtract: (a) =>
    new Date(
      toDate(a[0], "dateSubtract").getTime() -
        toNumber(a[1], "dateSubtract") *
          (MS_PER_UNIT[toStr(a[2])] ?? MS_PER_UNIT.days)
    ),
  formatDate: (a) =>
    toDate(a[0], "formatDate").toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  dateBetween: (a) => {
    const ms =
      toDate(a[0], "dateBetween").getTime() -
      toDate(a[1], "dateBetween").getTime();
    return Math.round(ms / (MS_PER_UNIT[toStr(a[2])] ?? MS_PER_UNIT.days));
  },

  // ── Logical ───────────────────────────────────────────────────────────────
  if: (a) => (isTruthy(a[0]) ? a[1] : (a[2] ?? null)),
  and: (a) => a.every(isTruthy),
  or: (a) => a.some(isTruthy),
  not: (a) => !isTruthy(a[0]),
  empty: (a) =>
    a[0] == null ||
    a[0] === "" ||
    (typeof a[0] === "number" && Number.isNaN(a[0])),
};
