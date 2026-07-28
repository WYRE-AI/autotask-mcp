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
 * Empty secret => always returns false. The caller is expected to treat an
 * empty CONDUIT_S2S_SECRET as "S2S enforcement disabled" (dark-by-default,
 * matches the dormant/pre-provisioning state) rather than calling this at
 * all — see the enforcement check at the call site.
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
