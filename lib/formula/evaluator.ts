import { FORMULA_FUNCTIONS } from "./functions";
import type { FormulaNode } from "./parser";
import { FormulaEvalError, type FormulaValue } from "./types";

export { FormulaEvalError, type FormulaValue };

export interface FormulaEvalContext {
  // Resolves `count(prop("Name"))`'s list length; kept separate from
  // resolveProp since Person/Multi-select already have a scalar form there. Optional.
  resolveCount?: (name: string) => number;
  // Resolves `prop("Name")`; caller owns JSONB-to-native conversion and
  // circular-reference guarding for nested Formula properties.
  resolveProp: (name: string) => FormulaValue;
}

function asNumber(v: FormulaValue, op: string): number {
  if (typeof v === "number") {
    return v;
  }
  if (v instanceof Date) {
    return v.getTime();
  }
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  throw new FormulaEvalError(`"${op}" expects a number`);
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
function looseEquals(a: FormulaValue, b: FormulaValue): boolean {
  if (a instanceof Date || b instanceof Date) {
    return (
      (a instanceof Date ? a.getTime() : a) ===
      (b instanceof Date ? b.getTime() : b)
    );
  }
  return a === b;
}

export function evaluateFormula(
  node: FormulaNode,
  ctx: FormulaEvalContext
): FormulaValue {
  switch (node.type) {
    case "number":
      return node.value;
    case "string":
      return node.value;
    case "boolean":
      return node.value;
    case "prop":
      return ctx.resolveProp(node.name);

    case "unary": {
      const v = evaluateFormula(node.operand, ctx);
      if (node.op === "not") {
        return !isTruthy(v);
      }
      if (node.op === "-") {
        return -asNumber(v, "-");
      }
      throw new FormulaEvalError(`Unknown unary operator "${node.op}"`);
    }

    case "binary": {
      // Short-circuit and/or — the right side is only evaluated when needed,
      // matching normal boolean-operator semantics (and matters once a
      // formula references another computed property that might error).
      if (node.op === "and") {
        return (
          isTruthy(evaluateFormula(node.left, ctx)) &&
          isTruthy(evaluateFormula(node.right, ctx))
        );
      }
      if (node.op === "or") {
        return (
          isTruthy(evaluateFormula(node.left, ctx)) ||
          isTruthy(evaluateFormula(node.right, ctx))
        );
      }

      const l = evaluateFormula(node.left, ctx);
      const r = evaluateFormula(node.right, ctx);

      switch (node.op) {
        case "+":
          if (typeof l === "string" || typeof r === "string") {
            return `${l ?? ""}${r ?? ""}`;
          }
          return asNumber(l, "+") + asNumber(r, "+");
        case "-":
          return asNumber(l, "-") - asNumber(r, "-");
        case "*":
          return asNumber(l, "*") * asNumber(r, "*");
        case "/": {
          const denom = asNumber(r, "/");
          if (denom === 0) {
            throw new FormulaEvalError("Division by zero");
          }
          return asNumber(l, "/") / denom;
        }
        case "%":
          return asNumber(l, "%") % asNumber(r, "%");
        case "^":
          return asNumber(l, "^") ** asNumber(r, "^");
        case "==":
          return looseEquals(l, r);
        case "!=":
          return !looseEquals(l, r);
        case "<":
          return asNumber(l, "<") < asNumber(r, "<");
        case ">":
          return asNumber(l, ">") > asNumber(r, ">");
        case "<=":
          return asNumber(l, "<=") <= asNumber(r, "<=");
        case ">=":
          return asNumber(l, ">=") >= asNumber(r, ">=");
        default:
          throw new FormulaEvalError(`Unknown operator "${node.op}"`);
      }
    }

    case "call": {
      // count() is special-cased: it needs the raw property reference to know
      // which list to measure, since resolveProp would collapse it to a scalar.
      if (node.name === "count") {
        const arg = node.args[0];
        if (node.args.length !== 1 || arg.type !== "prop") {
          throw new FormulaEvalError(
            'count() expects a single property reference, e.g. count(prop("Upvoted by"))'
          );
        }
        if (!ctx.resolveCount) {
          throw new FormulaEvalError("count() isn't available here");
        }
        return ctx.resolveCount(arg.name);
      }

      const fn = FORMULA_FUNCTIONS[node.name];
      if (!fn) {
        throw new FormulaEvalError(`Unknown function "${node.name}(...)"`);
      }
      const args = node.args.map((a) => evaluateFormula(a, ctx));
      return fn(args);
    }

    default: {
      const _exhaustive: never = node;
      throw new FormulaEvalError(
        `Unknown node type: ${JSON.stringify(_exhaustive)}`
      );
    }
  }
}
