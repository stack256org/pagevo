// Hand-rolled tokenizer + recursive-descent parser for the Formula expression
// language — no parsing dependency, kept small enough to stay auditable.
// Precedence (low to high): or, and, equality, comparison, additive,
// multiplicative, power, unary, primary.

export type FormulaNode =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "boolean"; value: boolean }
  | { type: "prop"; name: string }
  | { type: "call"; name: string; args: FormulaNode[] }
  | { type: "binary"; op: string; left: FormulaNode; right: FormulaNode }
  | { type: "unary"; op: string; operand: FormulaNode };

export class FormulaParseError extends Error {}

type Token =
  | { type: "number"; value: number }
  | { type: "string"; value: string }
  | { type: "ident"; value: string }
  | { type: "op"; value: string }
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "comma" }
  | { type: "eof" };

const MULTI_CHAR_OPS = ["==", "!=", "<=", ">="];
const SINGLE_CHAR_OPS = "+-*/%^<>(),";

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }

    if (c === "(") {
      tokens.push({ type: "lparen" });
      i++;
      continue;
    }
    if (c === ")") {
      tokens.push({ type: "rparen" });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }

    const two = src.slice(i, i + 2);
    if (MULTI_CHAR_OPS.includes(two)) {
      tokens.push({ type: "op", value: two });
      i += 2;
      continue;
    }

    if (SINGLE_CHAR_OPS.includes(c) && c !== "(" && c !== ")" && c !== ",") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "<" || c === ">" || c === "=") {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }

    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let value = "";
      while (j < src.length && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < src.length) {
          value += src[j + 1];
          j += 2;
          continue;
        }
        value += src[j];
        j++;
      }
      if (j >= src.length) {
        throw new FormulaParseError(
          `Unterminated string starting at position ${i}`
        );
      }
      tokens.push({ type: "string", value });
      i = j + 1;
      continue;
    }

    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) {
        j++;
      }
      const raw = src.slice(i, j);
      const num = Number(raw);
      if (Number.isNaN(num)) {
        throw new FormulaParseError(`Invalid number "${raw}" at position ${i}`);
      }
      tokens.push({ type: "number", value: num });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) {
        j++;
      }
      tokens.push({ type: "ident", value: src.slice(i, j) });
      i = j;
      continue;
    }

    throw new FormulaParseError(`Unexpected character "${c}" at position ${i}`);
  }
  tokens.push({ type: "eof" });
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.pos];
  }
  private advance(): Token {
    return this.tokens[this.pos++];
  }
  private isOp(...ops: string[]): boolean {
    const t = this.peek();
    return t.type === "op" && ops.includes(t.value);
  }
  private isIdent(...names: string[]): boolean {
    const t = this.peek();
    return t.type === "ident" && names.includes(t.value.toLowerCase());
  }

  parseExpression(): FormulaNode {
    const node = this.parseOr();
    if (this.peek().type !== "eof") {
      throw new FormulaParseError(`Unexpected token near position ${this.pos}`);
    }
    return node;
  }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.isIdent("or")) {
      this.advance();
      left = { type: "binary", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }

  private parseAnd(): FormulaNode {
    let left = this.parseEquality();
    while (this.isIdent("and")) {
      this.advance();
      left = { type: "binary", op: "and", left, right: this.parseEquality() };
    }
    return left;
  }

  private parseEquality(): FormulaNode {
    let left = this.parseComparison();
    while (this.isOp("==", "!=")) {
      const op = (this.advance() as { type: "op"; value: string }).value;
      left = { type: "binary", op, left, right: this.parseComparison() };
    }
    return left;
  }

  private parseComparison(): FormulaNode {
    let left = this.parseAdditive();
    while (this.isOp("<", ">", "<=", ">=")) {
      const op = (this.advance() as { type: "op"; value: string }).value;
      left = { type: "binary", op, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseMultiplicative();
    while (this.isOp("+", "-")) {
      const op = (this.advance() as { type: "op"; value: string }).value;
      left = { type: "binary", op, left, right: this.parseMultiplicative() };
    }
    return left;
  }

  private parseMultiplicative(): FormulaNode {
    let left = this.parsePower();
    while (this.isOp("*", "/", "%")) {
      const op = (this.advance() as { type: "op"; value: string }).value;
      left = { type: "binary", op, left, right: this.parsePower() };
    }
    return left;
  }

  private parsePower(): FormulaNode {
    let left = this.parseUnary();
    while (this.isOp("^")) {
      this.advance();
      left = { type: "binary", op: "^", left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): FormulaNode {
    if (this.isIdent("not")) {
      this.advance();
      return { type: "unary", op: "not", operand: this.parseUnary() };
    }
    if (this.isOp("-")) {
      this.advance();
      return { type: "unary", op: "-", operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const t = this.peek();

    if (t.type === "number") {
      this.advance();
      return { type: "number", value: t.value };
    }
    if (t.type === "string") {
      this.advance();
      return { type: "string", value: t.value };
    }

    if (t.type === "lparen") {
      this.advance();
      const inner = this.parseOr();
      if (this.peek().type !== "rparen") {
        throw new FormulaParseError("Expected closing parenthesis");
      }
      this.advance();
      return inner;
    }

    if (t.type === "ident") {
      const name = t.value;
      const lower = name.toLowerCase();
      if (lower === "true" || lower === "false") {
        this.advance();
        return { type: "boolean", value: lower === "true" };
      }

      this.advance();
      if (this.peek().type !== "lparen") {
        throw new FormulaParseError(
          `Unexpected identifier "${name}" — expected a function call like ${name}(...)`
        );
      }
      this.advance(); // consume "("

      if (lower === "prop") {
        if (this.peek().type !== "string") {
          throw new FormulaParseError(
            'prop(...) expects a quoted property name, e.g. prop("Status")'
          );
        }
        const propName = (this.advance() as { type: "string"; value: string })
          .value;
        if (this.peek().type !== "rparen") {
          throw new FormulaParseError(
            "Expected closing parenthesis after prop(...)"
          );
        }
        this.advance();
        return { type: "prop", name: propName };
      }

      const args: FormulaNode[] = [];
      if (this.peek().type !== "rparen") {
        args.push(this.parseOr());
        while (this.peek().type === "comma") {
          this.advance();
          args.push(this.parseOr());
        }
      }
      if (this.peek().type !== "rparen") {
        throw new FormulaParseError(
          `Expected closing parenthesis in ${name}(...)`
        );
      }
      this.advance();
      return { type: "call", name: lower, args };
    }

    throw new FormulaParseError(
      "Expected a value, property reference, or function call"
    );
  }
}

export function parseFormula(expression: string): FormulaNode {
  const tokens = tokenize(expression);
  return new Parser(tokens).parseExpression();
}
