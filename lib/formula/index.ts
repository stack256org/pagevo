import {
  evaluateFormula,
  type FormulaEvalContext,
  FormulaEvalError,
  type FormulaValue,
} from "./evaluator";
import { type FormulaNode, FormulaParseError, parseFormula } from "./parser";

export type { FormulaEvalContext, FormulaNode, FormulaValue };
export { FormulaEvalError, FormulaParseError };

export function tryParseFormula(expression: string): {
  ast: FormulaNode | null;
  error: string | null;
} {
  if (!expression.trim()) {
    return { ast: null, error: null };
  }
  try {
    return { ast: parseFormula(expression), error: null };
  } catch (e) {
    return {
      ast: null,
      error: e instanceof Error ? e.message : "Invalid formula",
    };
  }
}

export function formatFormulaValue(value: FormulaValue): string {
  if (value == null) {
    return "";
  }
  if (value instanceof Date) {
    return value.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? String(value)
      : String(Math.round(value * 100) / 100);
  }
  return value;
}

// Raw (unformatted) parse + evaluate — used when one Formula references
// another, which needs the typed value back, not a display-formatted string.
export function evaluateFormulaValue(
  expression: string,
  ctx: FormulaEvalContext
): { value: FormulaValue | null; error: string | null } {
  const { ast, error: parseError } = tryParseFormula(expression);
  if (parseError) {
    return { value: null, error: parseError };
  }
  if (!ast) {
    return { value: null, error: null };
  }
  try {
    return { value: evaluateFormula(ast, ctx), error: null };
  } catch (e) {
    return {
      value: null,
      error: e instanceof Error ? e.message : "Couldn't evaluate formula",
    };
  }
}

// Parses, evaluates, and formats in one call — the {display, error} shape
// both the API route (computing a cell's final displayed value) and the
// property-editor's live preview want.
export function runFormula(
  expression: string,
  ctx: FormulaEvalContext
): { display: string | null; error: string | null } {
  const { value, error } = evaluateFormulaValue(expression, ctx);
  if (error) {
    return { display: null, error };
  }
  return { display: formatFormulaValue(value) || null, error: null };
}
