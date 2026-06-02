/**
 * Safe mini-DSL evaluator for `visible_when` / `required_when` / `include_when` predicates.
 *
 * Grammar (subset, no eval, no function calls):
 *   expr      := or
 *   or        := and ('or' and)*
 *   and       := not ('and' not)*
 *   not       := 'not' not | comparison
 *   comparison:= primary (op primary)?
 *   op        := '==' | '!=' | '>=' | '<=' | '>' | '<' | 'in' | 'not in'
 *   primary   := literal | identifier | '(' expr ')' | '[' list ']'
 *   literal   := number | string | 'true' | 'false' | 'null'
 *   list      := primary (',' primary)*
 *
 * Identifiers are dotted paths resolved against the `answers` context, e.g.
 *   parties.length, employment_type, salary.amount.
 *
 * Examples:
 *   employment_type == 'permanent'
 *   parties.length > 1 and has_signature == true
 *   sector in ['it', 'finance']
 *   not (probation_period == null)
 */

export type Ctx = Record<string, unknown>;

type Token =
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "ident"; v: string }
  | { t: "op"; v: string }
  | { t: "punct"; v: "(" | ")" | "[" | "]" | "," }
  | { t: "kw"; v: "and" | "or" | "not" | "in" | "true" | "false" | "null" };

const KEYWORDS = new Set(["and", "or", "not", "in", "true", "false", "null"]);
const MULTI_OPS = ["==", "!=", ">=", "<="];
const SINGLE_OPS = [">", "<"];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "(" || c === ")" || c === "[" || c === "]" || c === ",") {
      out.push({ t: "punct", v: c as "(" }); i++; continue;
    }
    const two = src.slice(i, i + 2);
    if (MULTI_OPS.includes(two)) { out.push({ t: "op", v: two }); i += 2; continue; }
    if (SINGLE_OPS.includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    if (c === "'" || c === '"') {
      const quote = c; i++;
      let s = "";
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\" && i + 1 < src.length) { s += src[i + 1]; i += 2; }
        else { s += src[i]; i++; }
      }
      if (src[i] !== quote) throw new Error("unterminated string");
      i++;
      out.push({ t: "str", v: s });
      continue;
    }
    if (/[0-9]/.test(c) || (c === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: "num", v: Number(src.slice(i, j)) });
      i = j; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const word = src.slice(i, j);
      if (KEYWORDS.has(word)) out.push({ t: "kw", v: word as "and" });
      else out.push({ t: "ident", v: word });
      i = j; continue;
    }
    throw new Error(`unexpected char '${c}' at ${i}`);
  }
  return out;
}

type Node =
  | { kind: "lit"; v: unknown }
  | { kind: "ident"; path: string[] }
  | { kind: "list"; items: Node[] }
  | { kind: "not"; child: Node }
  | { kind: "bin"; op: string; left: Node; right: Node };

class Parser {
  private p = 0;
  constructor(private toks: Token[]) {}
  private peek(): Token | undefined { return this.toks[this.p]; }
  private eat(): Token { return this.toks[this.p++]; }
  private expect(predicate: (t: Token) => boolean, msg: string): Token {
    const tk = this.peek();
    if (!tk || !predicate(tk)) throw new Error(msg);
    return this.eat();
  }

  parse(): Node {
    const node = this.parseOr();
    if (this.p < this.toks.length) throw new Error("unexpected trailing tokens");
    return node;
  }
  private parseOr(): Node {
    let left = this.parseAnd();
    while (this.peek()?.t === "kw" && (this.peek() as { v: string }).v === "or") {
      this.eat();
      left = { kind: "bin", op: "or", left, right: this.parseAnd() };
    }
    return left;
  }
  private parseAnd(): Node {
    let left = this.parseNot();
    while (this.peek()?.t === "kw" && (this.peek() as { v: string }).v === "and") {
      this.eat();
      left = { kind: "bin", op: "and", left, right: this.parseNot() };
    }
    return left;
  }
  private parseNot(): Node {
    if (this.peek()?.t === "kw" && (this.peek() as { v: string }).v === "not") {
      this.eat();
      // support "not in" only as a comparison operator (handled below)
      return { kind: "not", child: this.parseNot() };
    }
    return this.parseComparison();
  }
  private parseComparison(): Node {
    const left = this.parsePrimary();
    const tk = this.peek();
    if (!tk) return left;
    let op: string | null = null;
    if (tk.t === "op") { op = tk.v; this.eat(); }
    else if (tk.t === "kw" && tk.v === "in") { op = "in"; this.eat(); }
    if (!op) return left;
    const right = this.parsePrimary();
    return { kind: "bin", op, left, right };
  }
  private parsePrimary(): Node {
    const tk = this.eat();
    if (!tk) throw new Error("unexpected end of input");
    switch (tk.t) {
      case "num": return { kind: "lit", v: tk.v };
      case "str": return { kind: "lit", v: tk.v };
      case "kw":
        if (tk.v === "true") return { kind: "lit", v: true };
        if (tk.v === "false") return { kind: "lit", v: false };
        if (tk.v === "null") return { kind: "lit", v: null };
        throw new Error(`unexpected keyword ${tk.v}`);
      case "ident":
        return { kind: "ident", path: tk.v.split(".") };
      case "punct":
        if (tk.v === "(") {
          const inner = this.parseOr();
          this.expect((t) => t.t === "punct" && t.v === ")", "expected ')'");
          return inner;
        }
        if (tk.v === "[") {
          const items: Node[] = [];
          if (!(this.peek()?.t === "punct" && (this.peek() as { v: string }).v === "]")) {
            items.push(this.parseOr());
            while (this.peek()?.t === "punct" && (this.peek() as { v: string }).v === ",") {
              this.eat();
              items.push(this.parseOr());
            }
          }
          this.expect((t) => t.t === "punct" && t.v === "]", "expected ']'");
          return { kind: "list", items };
        }
        throw new Error(`unexpected punctuation ${tk.v}`);
      default:
        throw new Error("unexpected token");
    }
  }
}

function resolve(path: string[], ctx: Ctx): unknown {
  let cur: unknown = ctx;
  for (const seg of path) {
    if (cur == null) return undefined;
    if (seg === "length" && (Array.isArray(cur) || typeof cur === "string")) {
      cur = (cur as { length: number }).length;
      continue;
    }
    if (typeof cur === "object") {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function evalNode(n: Node, ctx: Ctx): unknown {
  switch (n.kind) {
    case "lit": return n.v;
    case "ident": return resolve(n.path, ctx);
    case "list": return n.items.map((it) => evalNode(it, ctx));
    case "not": return !truthy(evalNode(n.child, ctx));
    case "bin": {
      if (n.op === "and") return truthy(evalNode(n.left, ctx)) && truthy(evalNode(n.right, ctx));
      if (n.op === "or") return truthy(evalNode(n.left, ctx)) || truthy(evalNode(n.right, ctx));
      const l = evalNode(n.left, ctx);
      const r = evalNode(n.right, ctx);
      switch (n.op) {
        case "==": return looseEq(l, r);
        case "!=": return !looseEq(l, r);
        case ">": return (l as number) > (r as number);
        case "<": return (l as number) < (r as number);
        case ">=": return (l as number) >= (r as number);
        case "<=": return (l as number) <= (r as number);
        case "in": return Array.isArray(r) ? r.some((x) => looseEq(x, l)) : false;
        default: throw new Error(`unknown op ${n.op}`);
      }
    }
  }
}

function truthy(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0 && !Number.isNaN(v);
  if (typeof v === "string") return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (typeof a === "number" && typeof b === "string") return a === Number(b);
  if (typeof b === "number" && typeof a === "string") return b === Number(a);
  return false;
}

// Public API ---------------------------------------------------------------

const cache = new Map<string, Node>();

export function parseExpression(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const ast = new Parser(tokenize(src)).parse();
  cache.set(src, ast);
  return ast;
}

/**
 * Evaluate an expression against an answers context. Returns false on any
 * parse/runtime error (fail-closed) so wizard rendering never crashes.
 */
export function evaluateExpression(src: string | null | undefined, ctx: Ctx): boolean {
  if (!src || !src.trim()) return true; // empty predicate = always true
  try {
    return truthy(evalNode(parseExpression(src), ctx));
  } catch {
    return false;
  }
}
