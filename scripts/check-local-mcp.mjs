// Verify the exact stdio entry point configured in Codex, without printing credentials.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['dist/entry.js'], {
  cwd: root,
  env: { ...process.env, MCP_TRANSPORT: 'stdio', LOG_LEVEL: 'error' },
  stdio: ['pipe', 'pipe', 'pipe'],
});
let nextId = 0;
const pending = new Map();
const httpStatuses = new Set();
child.stderr.on('data', chunk => {
  // Only report HTTP status codes; server logs may contain account details.
  for (const match of String(chunk).matchAll(/\b(?:HTTP\s+|status(?:Code)?[":\s]+)([45]\d\d)\b/gi)) {
    httpStatuses.add(match[1]);
  }
});
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  try {
    const message = JSON.parse(line);
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`MCP error code ${message.error.code}`));
    else request.resolve(message.result);
  } catch {
    // Ignore non-JSON lines; the entry point should keep these off stdout.
  }
});
function rejectPending(error) {
  for (const request of pending.values()) {
    clearTimeout(request.timer);
    request.reject(error);
  }
  pending.clear();
}
child.on('error', () => rejectPending(new Error('Could not launch the server')));
child.on('exit', code => rejectPending(new Error(`Server exited with code ${code}`)));
function request(method, params) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, 90000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
try {
  const initialized = await request('initialize', {
    protocolVersion: '2025-03-26', capabilities: {},
    clientInfo: { name: 'local-connection-check', version: '1.0.0' },
  });
  console.log(`MCP initialized: ${initialized.serverInfo.name}`);
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  const { tools } = await request('tools/list', {});
  console.log(`MCP tools discovered: ${tools.length}`);
  if (!tools.some(tool => tool.name === 'autotask_test_connection')) {
    throw new Error('Connection test tool was not advertised');
  }
  const result = await request('tools/call', { name: 'autotask_test_connection', arguments: {} });
  if (result.isError) {
    console.log('Autotask API connection: FAILED');
    if (httpStatuses.size) console.log(`HTTP errors: ${[...httpStatuses].join(', ')}`);
    process.exitCode = 1;
  } else {
    console.log('Autotask API connection: PASSED');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  lines.close();
  child.kill();
}
