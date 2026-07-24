#!/usr/bin/env node
// Dual-era smoke test: proves the HTTP entrypoint serves BOTH protocol eras
// after the @modelcontextprotocol v2 migration.
//
//   (a) LEGACY leg — hand-crafted 2025-era JSON-RPC POSTs (the classic
//       initialize handshake, no per-request envelope): initialize →
//       notifications/initialized → tools/list.
//   (b) MODERN leg — @modelcontextprotocol/client@2 (StreamableHTTP
//       transport, 2026-07-28 negotiation): connect → tools/list.
//
// Both legs must see the same non-empty tool surface. Exits non-zero on any
// failure. Run from the repo root after `npm run build`:
//
//   node scripts/smoke-dual-era.mjs

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const serverEntry = resolve(root, 'dist/index.js');
const PORT = 38700 + Math.floor(Math.random() * 200);
const BASE = `http://127.0.0.1:${PORT}`;

const failures = [];
function check(label, ok, detail = '') {
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(label);
}

/** Parse a Streamable HTTP response body: plain JSON or a single-message SSE stream. */
async function mcpBody(res) {
  const text = await res.text();
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/event-stream')) {
    const dataLines = text.split('\n').filter((line) => line.startsWith('data:'));
    const last = dataLines[dataLines.length - 1];
    if (!last) throw new Error(`No data frame in SSE body: ${JSON.stringify(text)}`);
    return JSON.parse(last.slice('data:'.length).trim());
  }
  return JSON.parse(text);
}

async function legacyPost(body) {
  return fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify(body),
  });
}

async function waitForHealth(timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return res.json();
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become healthy on ${BASE} within ${timeoutMs}ms`);
}

async function legacyLeg() {
  console.log('\nLEGACY leg (2025-era classic JSON-RPC handshake):');

  // 1. initialize with a 2025 protocolVersion — the pre-envelope handshake.
  const initRes = await legacyPost({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'smoke-legacy', version: '0.0.0' },
    },
  });
  check('initialize HTTP 200', initRes.status === 200, `status=${initRes.status}`);
  const init = await mcpBody(initRes);
  const result = init?.result;
  check(
    'InitializeResult has protocolVersion + serverInfo + capabilities',
    typeof result?.protocolVersion === 'string' &&
      result?.serverInfo?.name === 'autotask-mcp' &&
      typeof result?.capabilities === 'object',
    `protocolVersion=${result?.protocolVersion} serverInfo=${result?.serverInfo?.name}`
  );

  // 2. notifications/initialized — must be accepted (202 in Streamable HTTP).
  const notifRes = await legacyPost({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
  });
  check(
    'notifications/initialized accepted',
    notifRes.status >= 200 && notifRes.status < 300,
    `status=${notifRes.status}`
  );

  // 3. tools/list — the tool surface must be non-empty.
  const toolsRes = await legacyPost({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });
  check('tools/list HTTP 200', toolsRes.status === 200, `status=${toolsRes.status}`);
  const tools = (await mcpBody(toolsRes))?.result?.tools ?? [];
  check('tools/list returns >0 tools', tools.length > 0, `count=${tools.length}`);
  return tools;
}

async function modernLeg() {
  console.log('\nMODERN leg (@modelcontextprotocol/client v2, 2026-07-28 era):');
  const { Client, StreamableHTTPClientTransport } = await import(
    '@modelcontextprotocol/client'
  );

  const client = new Client({ name: 'smoke-modern', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${BASE}/mcp`));
  await client.connect(transport);
  check('client connected', true);

  const { tools } = await client.listTools();
  check('tools/list returns >0 tools', tools.length > 0, `count=${tools.length}`);
  await client.close();
  return tools;
}

async function main() {
  if (!existsSync(serverEntry)) {
    console.error(`Missing ${serverEntry} — run 'npm run build' first.`);
    process.exit(1);
  }

  console.log(`Starting HTTP server on ${BASE} (env-mode dummy credentials)...`);
  const child = spawn(process.execPath, [serverEntry], {
    cwd: root,
    env: {
      ...process.env,
      MCP_TRANSPORT: 'http',
      MCP_HTTP_PORT: String(PORT),
      MCP_HTTP_HOST: '127.0.0.1',
      AUTOTASK_USERNAME: 'smoke@example.com',
      AUTOTASK_SECRET: 'dummy-secret',
      AUTOTASK_INTEGRATION_CODE: 'DUMMYCODE',
      LOG_LEVEL: 'error',
      LOG_FORMAT: 'simple',
    },
    stdio: ['ignore', 'inherit', 'inherit'],
  });

  try {
    const health = await waitForHealth();
    check('health probe ok', health?.status === 'ok', `version=${health?.version}`);

    const legacyTools = await legacyLeg();
    const modernTools = await modernLeg();

    console.log('\nCross-era comparison:');
    check(
      'both eras serve the same tool count',
      legacyTools.length === modernTools.length,
      `legacy=${legacyTools.length} modern=${modernTools.length}`
    );
    const legacyNames = new Set(legacyTools.map((t) => t.name));
    const modernNames = new Set(modernTools.map((t) => t.name));
    const drift = [...legacyNames]
      .filter((n) => !modernNames.has(n))
      .concat([...modernNames].filter((n) => !legacyNames.has(n)));
    check('both eras serve the same tool names', drift.length === 0, drift.join(', ') || 'no drift');
  } catch (error) {
    check('smoke run completed without exception', false, String(error));
  } finally {
    child.kill('SIGTERM');
  }

  if (failures.length > 0) {
    console.error(`\nSMOKE FAILED: ${failures.length} check(s) failed: ${failures.join('; ')}`);
    process.exit(1);
  }
  console.log('\nSMOKE PASSED: both protocol eras served by the same factory.');
  process.exit(0);
}

main().catch((error) => {
  console.error('Smoke script crashed:', error);
  process.exit(1);
});
