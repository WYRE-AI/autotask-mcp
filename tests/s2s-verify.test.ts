import { createHmac } from 'node:crypto';
import { isUsableConduitS2sSecret, resolveHttpListenHost, verifyS2sHeader } from '../src/mcp/s2s-verify.js';

function deriveRecipientSubkey(masterSecret: string, slug: string): string {
  return createHmac('sha256', masterSecret).update(`s2s-recipient:${slug}`).digest('hex');
}
function mintHeader(secret: string, unixSeconds: number): string {
  const message = `t=${unixSeconds}`;
  const hex = createHmac('sha256', secret).update(message).digest('hex');
  return `${message},v1=${hex}`;
}

describe('verifyS2sHeader', () => {
  const MASTER = 'test-master-secret-do-not-use-in-prod';
  const ownSubkey = deriveRecipientSubkey(MASTER, 'autotask');
  const siblingSubkey = deriveRecipientSubkey(MASTER, 'action1');
  // Fixed, frozen clock so skew-window boundary tests are deterministic —
  // without this, a real clock tick between minting a header and verifying
  // it can shave a second off the intended skew, flaking the boundary cases.
  const NOW = 1_800_000_000;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW * 1000);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("accepts a header minted with this vendor's own derived subkey", () => {
    expect(verifyS2sHeader(mintHeader(ownSubkey, NOW), ownSubkey)).toBe(true);
  });
  it('REJECTS a header minted for a different vendor\'s derived subkey (recipient-binding proof)', () => {
    expect(verifyS2sHeader(mintHeader(siblingSubkey, NOW), ownSubkey)).toBe(false);
  });
  it('rejects a stale timestamp outside the skew window', () => {
    expect(verifyS2sHeader(mintHeader(ownSubkey, NOW - 301), ownSubkey)).toBe(false);
  });
  it('rejects a future timestamp outside the skew window', () => {
    expect(verifyS2sHeader(mintHeader(ownSubkey, NOW + 301), ownSubkey)).toBe(false);
  });
  it('accepts a timestamp at the edge of the skew window', () => {
    expect(verifyS2sHeader(mintHeader(ownSubkey, NOW - 300), ownSubkey)).toBe(true);
  });
  it('rejects a malformed header value', () => {
    expect(verifyS2sHeader('not-a-valid-header', ownSubkey)).toBe(false);
  });
  it('rejects a missing header', () => {
    expect(verifyS2sHeader(undefined, ownSubkey)).toBe(false);
  });
  it('rejects when the secret is empty', () => {
    expect(verifyS2sHeader(mintHeader(ownSubkey, NOW), '')).toBe(false);
  });
  it('rejects known placeholders and unresolved templates as a usable secret', () => {
    expect(isUsableConduitS2sSecret(undefined)).toBe(false);
    expect(isUsableConduitS2sSecret('')).toBe(false);
    expect(isUsableConduitS2sSecret('   ')).toBe(false);
    expect(isUsableConduitS2sSecret('changeme')).toBe(false);
    expect(isUsableConduitS2sSecret('CHANGE-ME')).toBe(false);
    expect(isUsableConduitS2sSecret('your-s2s-secret')).toBe(false);
    expect(isUsableConduitS2sSecret('placeholder')).toBe(false);
    expect(isUsableConduitS2sSecret('${user_config.conduit_s2s_secret}')).toBe(false);
    expect(isUsableConduitS2sSecret('  ${CONDUIT_S2S_SECRET}  ')).toBe(false);
    expect(isUsableConduitS2sSecret(ownSubkey)).toBe(true);
  });

  it('defaults the listen address to 127.0.0.1 without a secret and honors MCP_HTTP_HOST with one', () => {
    expect(resolveHttpListenHost({
      s2sSecret: '',
      configuredHost: '0.0.0.0',
      explicitHost: undefined,
    })).toEqual({ host: '127.0.0.1', overriddenHost: undefined });

    expect(resolveHttpListenHost({
      s2sSecret: '',
      configuredHost: '127.0.0.1',
      explicitHost: '0.0.0.0',
    })).toEqual({ host: '127.0.0.1', overriddenHost: '0.0.0.0' });

    expect(resolveHttpListenHost({
      s2sSecret: '',
      configuredHost: '0.0.0.0',
      explicitHost: '[::1]',
    })).toEqual({ host: '127.0.0.1', overriddenHost: '[::1]' });

    expect(resolveHttpListenHost({
      s2sSecret: ownSubkey,
      configuredHost: '0.0.0.0',
      explicitHost: undefined,
    })).toEqual({ host: '0.0.0.0', overriddenHost: undefined });

    expect(resolveHttpListenHost({
      s2sSecret: ownSubkey,
      configuredHost: '0.0.0.0',
      explicitHost: '10.1.2.3',
    })).toEqual({ host: '10.1.2.3', overriddenHost: undefined });
  });

  it('rejects a tampered signature', () => {
    const header = mintHeader(ownSubkey, NOW);
    const tampered = header.slice(0, -1) + (header.endsWith('0') ? '1' : '0');
    expect(verifyS2sHeader(tampered, ownSubkey)).toBe(false);
  });
});
