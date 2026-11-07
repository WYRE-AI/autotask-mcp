// Argument validation for tool calls.
//
// The MCP server registers a raw `tools/call` handler, so the SDK never checks
// arguments against a tool's inputSchema, and `autotask_execute_tool` forwards
// its `arguments` object straight to the target handler. A caller that sent
// `id` instead of `ticketId` therefore reached the handler with `ticketId`
// undefined and the failure surfaced as an unrelated Autotask HTTP 500.
//
// This is deliberately a small checker (required + unknown names only), not a
// full JSON Schema validator: handlers already coerce types, and a stricter
// check would reject calls that work today.

export interface ArgSchema {
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean | Record<string, unknown>;
}

export interface ArgValidationOptions {
  /** Property names accepted even though they are not in the schema (deprecated args that a handler rejects with its own message). */
  tolerated?: readonly string[];
  /** Alternative spellings a handler reads (alias -> canonical name). An alias is not "unknown" and satisfies a required canonical name. */
  aliases?: Readonly<Record<string, string>>;
  /** Required parameters the handler checks itself with a more helpful message; skipped in the required check. */
  handlerChecked?: readonly string[];
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

/** Best valid parameter name for an unrecognised one, or undefined when nothing is close. */
export function suggestParam(unknown: string, valid: readonly string[]): string | undefined {
  const lower = unknown.toLowerCase();
  const caseMatch = valid.find(v => v.toLowerCase() === lower);
  if (caseMatch) return caseMatch;
  // `id` -> `ticketId`, `ticket_id` -> `ticketId`: a bare or snake-cased id.
  const squashed = lower.replace(/[_-]/g, '');
  const squashedMatch = valid.find(v => v.toLowerCase() === squashed);
  if (squashedMatch) return squashedMatch;
  const idLike = valid.filter(v => /id$/i.test(v));
  if (lower === 'id' && idLike.length === 1) return idLike[0];
  if (lower.length >= 4) {
    let best: string | undefined;
    let bestDist = 3;
    for (const v of valid) {
      const d = levenshtein(lower, v.toLowerCase());
      if (d < bestDist) { best = v; bestDist = d; }
    }
    return best;
  }
  return undefined;
}

/**
 * Check `args` against a tool's inputSchema. Returns an error message naming
 * the tool, the missing/unknown parameters and the valid parameter names, or
 * null when the arguments are acceptable.
 */
export function validateToolArguments(
  toolName: string,
  schema: ArgSchema,
  args: Record<string, any> | null | undefined,
  options: ArgValidationOptions = {},
): string | null {
  const given = args ?? {};
  const valid = Object.keys(schema.properties ?? {});
  const aliases = options.aliases ?? {};
  const tolerated = new Set([...(options.tolerated ?? []), ...Object.keys(aliases)]);
  const skip = new Set(options.handlerChecked ?? []);
  const required = (schema.required ?? []).filter(p => !skip.has(p));

  const aliasGiven = (p: string) =>
    Object.entries(aliases).some(([alias, canonical]) => canonical === p && given[alias] !== undefined);
  const missing = required.filter(p => given[p] === undefined && !aliasGiven(p));
  const allowsExtra = schema.additionalProperties === true
    || (typeof schema.additionalProperties === 'object' && schema.additionalProperties !== null);
  const unknown = allowsExtra
    ? []
    : Object.keys(given).filter(k => !valid.includes(k) && !tolerated.has(k));

  if (missing.length === 0 && unknown.length === 0) return null;

  const parts: string[] = [];
  if (missing.length) {
    parts.push(`missing required parameter${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`);
  }
  if (unknown.length) {
    parts.push(`unknown parameter${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}`);
  }
  const hints: string[] = [];
  for (const u of unknown) {
    // Prefer a suggestion that fills a missing required parameter.
    const s = suggestParam(u, missing.length ? missing : valid) ?? suggestParam(u, valid);
    if (s) hints.push(`did you mean '${s}'? (sent as '${u}')`);
  }
  const validList = valid.length ? valid.join(', ') : '(none)';
  return `Invalid arguments for ${toolName}: ${parts.join('; ')}. `
    + `Valid parameters: ${validList}.`
    + (hints.length ? ` Hint: ${hints.join(' ')}` : '');
}
