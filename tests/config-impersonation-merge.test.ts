// Regression for #364: mergeWithMcpConfig() dropped impersonationResourceId in env mode.

import { loadEnvironmentConfig, mergeWithMcpConfig } from '../src/utils/config';

describe('mergeWithMcpConfig: impersonationResourceId', () => {
  const KEYS = [
    'AUTOTASK_USERNAME',
    'AUTOTASK_SECRET',
    'AUTOTASK_INTEGRATION_CODE',
    'AUTOTASK_IMPERSONATION_RESOURCE_ID',
  ] as const;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    KEYS.forEach((k) => (saved[k] = process.env[k]));
    process.env.AUTOTASK_USERNAME = 'api@example.com';
    process.env.AUTOTASK_SECRET = 'secret';
    process.env.AUTOTASK_INTEGRATION_CODE = 'code';
  });

  afterEach(() => {
    KEYS.forEach((k) => {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    });
  });

  test('keeps impersonationResourceId from the environment', () => {
    process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID = '123';
    const merged = mergeWithMcpConfig(loadEnvironmentConfig());
    expect(merged.autotask.impersonationResourceId).toBe(123);
  });

  test('leaves it undefined when the variable is unset', () => {
    delete process.env.AUTOTASK_IMPERSONATION_RESOURCE_ID;
    const merged = mergeWithMcpConfig(loadEnvironmentConfig());
    expect(merged.autotask.impersonationResourceId).toBeUndefined();
  });

  test('mcpArgs still override the credential fields', () => {
    const merged = mergeWithMcpConfig(loadEnvironmentConfig(), { autotask: { username: 'other@example.com' } });
    expect(merged.autotask.username).toBe('other@example.com');
  });
});
