/**
 * Verifies the conduit gateway's service-to-service auth header
 * (gateway#377 parity — closes the confused-deputy gap where a compromised
 * sibling sidecar in the shared ACA environment could otherwise impersonate
 * the gateway to this container).
 *
 * This is a near-verbatim port of conduit's `verifyS2sHeader`
 * (src/proxy/s2s.ts) — intentionally unchanged logic, ported once and kept
 * in sync. `secret` is treated as an opaque value: since gateway#377
 * Finding B, the gateway derives a per-vendor subkey from its master
 * secret and this container is provisioned (via CONDUIT_S2S_SECRET) with
 * only its own derived value, never the raw master — a sibling sidecar
 * holds a DIFFERENT derived value and cannot forge a header that verifies
 * here. This function doesn't need to know that; it just checks whatever
 * secret it's handed.
 *
 * Empty secret => always returns false. That is not a production bypass:
 * the HTTP transport refuses to start when CONDUIT_S2S_SECRET is empty or a
 * known placeholder, unless MCP_ALLOW_INSECURE_DEV=1, which is local
 * development only and listens on 127.0.0.1.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Request header carrying the S2S proof. Node lowercases incoming header names. */
export const S2S_HEADER = "x-gateway-s2s";

const HEADER_VALUE_RE = /^t=(\d{1,15}),v1=([0-9a-f]{64})$/;

export function verifyS2sHeader(
  headerValue: string | undefined,
  secret: string,
  maxSkewSeconds = 300
): boolean {
  if (!secret || !headerValue) return false;
  const match = HEADER_VALUE_RE.exec(headerValue);
  if (!match) return false;
  const t = Number(match[1]);
  if (!Number.isSafeInteger(t)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > maxSkewSeconds) return false;
  const expected = createHmac("sha256", secret).update(`t=${t}`).digest();
  const provided = Buffer.from(match[2], "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Stand-ins that must not count as a provisioned CONDUIT_S2S_SECRET.
 * Compared case-insensitively after trim. Unresolved `${...}` templates are
 * rejected separately. A real secret equal to one of these strings will not
 * start the HTTP server.
 */
const KNOWN_S2S_PLACEHOLDERS = new Set([
  "changeme",
  "change-me",
  "change_me",
  "placeholder",
  "your-secret",
  "your-s2s-secret",
  "your_s2s_secret",
  "secret",
  "password",
  "test",
  "testing",
  "example",
  "dummy",
  "todo",
  "fixme",
  "replace-me",
  "replace_me",
  "xxx",
  "xxxx",
  "none",
  "null",
  "undefined",
  "conduit_s2s_secret",
  "s2s-secret",
  "s2s_secret",
  "set-me",
  "setme",
]);

/** Entire value is an unresolved template, e.g. `${user_config.conduit_s2s_secret}`. */
const UNRESOLVED_TEMPLATE = /^\$\{.+\}$/;

const LOOPBACK_BIND_HOST = "127.0.0.1";

/**
 * True when `secret` is non-empty and not a known placeholder or unresolved
 * `${...}` template. Whitespace is ignored. The raw value is never logged.
 */
export function isUsableConduitS2sSecret(secret: string | undefined): boolean {
  const trimmed = secret?.trim() ?? "";
  if (!trimmed) return false;
  if (UNRESOLVED_TEMPLATE.test(trimmed)) return false;
  if (KNOWN_S2S_PLACEHOLDERS.has(trimmed.toLowerCase())) return false;
  return true;
}

/** Strip brackets and case so `[::1]` and `LocalHost` compare as bind hosts. */
export function normalizeBindHost(host: string): string {
  return host.trim().toLowerCase().replace(/^\[(.+)\]$/, "$1");
}

/**
 * Listen address for the HTTP transport.
 *
 * A usable secret honors `explicitHost` (MCP_HTTP_HOST) when set, otherwise
 * the host already loaded into configuration (default `0.0.0.0` when unset).
 * No usable secret always binds `127.0.0.1`. `overriddenHost` is the explicit
 * MCP_HTTP_HOST that was ignored because it was not `127.0.0.1`.
 */
export function resolveHttpListenHost(options: {
  s2sSecret: string;
  configuredHost: string | undefined;
  explicitHost: string | undefined;
}): { host: string; overriddenHost: string | undefined } {
  const explicit = options.explicitHost?.trim() ?? "";
  if (options.s2sSecret) {
    if (explicit) return { host: explicit, overriddenHost: undefined };
    const configured = options.configuredHost?.trim() ?? "";
    return { host: configured || "0.0.0.0", overriddenHost: undefined };
  }
  if (explicit && normalizeBindHost(explicit) !== LOOPBACK_BIND_HOST) {
    return { host: LOOPBACK_BIND_HOST, overriddenHost: explicit };
  }
  return { host: LOOPBACK_BIND_HOST, overriddenHost: undefined };
}
