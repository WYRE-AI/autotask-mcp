// Unit tests for serverInfo.version resolution.
// Regression coverage for issue #94: hardcoded '1.0.0' fallback.

import { loadEnvironmentConfig } from '../src/utils/config';
import packageJson from '../package.json';

describe('loadEnvironmentConfig: server.version', () => {
  // The autotask credentials env vars don't matter for the version lookup
  // (loadEnvironmentConfig returns even when they're missing — autotask is
  // just left undefined in that case), but we save/restore to keep test
  // isolation clean.
  const SAVED = {
    MCP_SERVER_VERSION: process.env.MCP_SERVER_VERSION,
  };

  afterEach(() => {
    if (SAVED.MCP_SERVER_VERSION === undefined) {
      delete process.env.MCP_SERVER_VERSION;
    } else {
      process.env.MCP_SERVER_VERSION = SAVED.MCP_SERVER_VERSION;
    }
  });

  test('defaults to the version baked into package.json', () => {
    delete process.env.MCP_SERVER_VERSION;
    const cfg = loadEnvironmentConfig();
    expect(cfg.server.version).toBe(packageJson.version);
    // Explicitly assert we are NOT returning the old hardcoded fallback.
    // This is the regression: every release reported '1.0.0' regardless of
    // which build was running.
    expect(cfg.server.version).not.toBe('1.0.0');
  });

  test('MCP_SERVER_VERSION env override wins over package.json', () => {
    process.env.MCP_SERVER_VERSION = '99.99.99-stamp';
    const cfg = loadEnvironmentConfig();
    expect(cfg.server.version).toBe('99.99.99-stamp');
  });
});
