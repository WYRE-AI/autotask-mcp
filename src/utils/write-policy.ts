// Write Policy
// Read-only mode and the narrow allowlist that reopens it.
//
// Several MSPs will not deploy a write-capable Autotask server until they
// trust it. AUTOTASK_READ_ONLY=true hides every mutating tool from tools/list
// and refuses it at dispatch; AUTOTASK_WRITE_ALLOWLIST names the few tools
// that stay enabled (e.g. "autotask_update_ticket") without reopening the
// other forty.
//
// Pure and I/O-free so the policy can be unit-tested on its own — an
// enforcement gate that can be bypassed is worse than no gate at all.

/**
 * True if a tool mutates Autotask. Every mutating tool follows the verb-first
 * `autotask_{create,update,delete}_*` naming convention, so a prefix test is
 * exact. `autotask_raw_request` is the one exception — it mutates or not
 * depending on its `method` argument, and is handled by `denyReason`.
 */
export function isWriteTool(name: string): boolean {
  return /^autotask_(create|update|delete)_/.test(name);
}

/** The untyped REST escape hatch, whose HTTP method decides if it writes. */
const RAW_REQUEST_TOOL = 'autotask_raw_request';

/** The only HTTP method `autotask_raw_request` may use in read-only mode. */
const READ_ONLY_RAW_METHOD = 'GET';

export class WritePolicy {
  private readonly allowlist: ReadonlySet<string>;

  constructor(public readonly readOnly: boolean, allowlist: Iterable<string> = []) {
    this.allowlist = new Set(allowlist);
  }

  /**
   * Build the policy from the environment. AUTOTASK_READ_ONLY accepts
   * "true"/"1" (matching LAZY_LOADING); AUTOTASK_WRITE_ALLOWLIST is a
   * comma-separated list of tool names.
   */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): WritePolicy {
    const readOnly = env.AUTOTASK_READ_ONLY === 'true' || env.AUTOTASK_READ_ONLY === '1';
    const allowlist = (env.AUTOTASK_WRITE_ALLOWLIST ?? '')
      .split(',')
      .map(name => name.trim())
      .filter(name => name.length > 0);
    return new WritePolicy(readOnly, allowlist);
  }

  /** Allowlisted tool names, sorted. */
  get allowed(): string[] {
    return [...this.allowlist].sort();
  }

  /**
   * Allowlist entries that name nothing this policy can re-enable — a typo
   * ("autotask_update_tickets") silently buys no write access, so it is worth
   * warning about rather than leaving the operator to discover it at runtime.
   */
  get ineffective(): string[] {
    return this.allowed.filter(name => !isWriteTool(name) && name !== RAW_REQUEST_TOOL);
  }

  /**
   * True when this tool mutates and the policy forbids it. Blocked tools are
   * hidden from every listing (tools/list and the discovery meta-tools) as
   * well as refused at dispatch, so a read-only client never sees an
   * operation it is not allowed to call.
   */
  blocks(name: string): boolean {
    return this.readOnly && isWriteTool(name) && !this.allowlist.has(name);
  }

  /**
   * Why this call must be refused, or null if it may proceed. Covers both a
   * blocked write tool and a mutating `autotask_raw_request` — without the
   * second check, read-only mode would be one `POST` away from a bypass.
   */
  denyReason(name: string, args: Record<string, any> = {}): string | null {
    if (this.blocks(name)) {
      return `Tool "${name}" writes to Autotask and this server is running in read-only mode ` +
        `(AUTOTASK_READ_ONLY). Add it to AUTOTASK_WRITE_ALLOWLIST to enable it.`;
    }
    if (this.readOnly && name === RAW_REQUEST_TOOL && !this.allowlist.has(name)) {
      const method = String(args.method ?? '').toUpperCase();
      if (method !== READ_ONLY_RAW_METHOD) {
        return `Tool "${RAW_REQUEST_TOOL}" is limited to ${READ_ONLY_RAW_METHOD} requests in ` +
          `read-only mode (AUTOTASK_READ_ONLY); "${method || 'none'}" would write. ` +
          `Add "${RAW_REQUEST_TOOL}" to AUTOTASK_WRITE_ALLOWLIST to enable it.`;
      }
    }
    return null;
  }

  /** One-line summary for the startup log. */
  describe(): string {
    if (!this.readOnly) {
      return 'Read-only mode off — write tools are enabled.';
    }
    const allowed = this.allowed;
    return 'Read-only mode ON (AUTOTASK_READ_ONLY): write tools are hidden and refused' +
      (allowed.length > 0 ? `, except allowlisted: ${allowed.join(', ')}.` : '.');
  }
}
