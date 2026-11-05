// A smoke test of the MCP server with the MCP SDK's own client:
//   EP128WEB_ROMS=/path/ep128emu_roms-2.0.11.bin node test.js
// (EP128WEB_URL can point to a local build; a temporary browser profile is used)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ep128web-mcp-test-'));
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.join(path.dirname(new URL(import.meta.url).pathname), 'server.js')],
  env: { ...process.env, EP128WEB_PROFILE: profile }
});
const client = new Client({ name: 'ep128web-mcp-test', version: '1.0.0' });
await client.connect(transport);

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  const t = r.content.map((c) => (c.type === 'text' ? c.text : '[' + c.type + ' ' + (c.data || '').length + ' chars]')).join('\n');
  console.log('### ' + name + ' ' + JSON.stringify(args) + (r.isError ? '  (ERROR)' : '') + '\n' + t.slice(0, 1200) + '\n');
  if (r.isError) process.exitCode = 1;
  return t;
};

const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '), '\n');
try {
  await call('emulator_start', { machine: 'tvc64-12' });
  await call('type_text', { text: '10 FOR I=1 TO 3: PRINT I*I: NEXT\nRUN\n', settle_frames: 20 });
  await call('wait_text', { regex: '^ *9$' });
  await call('screen_text');
  await call('state');
  await call('write_memory', { address: '8000', bytes: '3E 05 C9' });
  await call('read_memory', { address: '8000', length: 16 });
  await call('read_memory', { address: '0000', length: 32 });
  await call('disassemble', { address: '0000', lines: 4 });
  await call('monitor', { command: 'R' });
  await call('run_frames', { frames: 50 });
  await call('screenshot');
  await call('snapshot', { action: 'save', path: path.join(profile, 's.json') });
  await call('set_machine', { id: 'ep128uk-exdos' });
  await call('type_text', { text: 'PRINT 6*7\n' });
  await call('snapshot', { action: 'restore', path: path.join(profile, 's.json') });
  await call('breakpoint', { action: 'add', address: '0030' });
  await call('type_text', { text: 'PRINT 1\n', settle_frames: 0 });
  await call('debug_control', { action: 'step' });
  await call('breakpoint', { action: 'clear' });
  await call('debug_control', { action: 'continue' });
  await call('press_key', { key: 'Space', ms: 60 });
  if (process.env.EP128WEB_ROMS) await call('load_file', { file: process.env.EP128WEB_ROMS });
  await call('eval_js', { code: 'return { lines: ep.screenLines().length, prompt: ep.atPrompt() };' });
  await call('list_machines');
} finally {
  await client.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
