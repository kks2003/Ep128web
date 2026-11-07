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

const check = (ok, what) => {
  console.log((ok ? 'OK   ' : 'FAIL ') + what + '\n');
  if (!ok) process.exitCode = 1;
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

  // --- timing, symbols, keys, trace (machine code POKEd on a TVC 64k) ---
  // 6000 LD HL,7000 / LD B,0 / XOR A / 6006 LD (HL),A / INC L / DJNZ 6006 / 600A JP 6000
  await call('set_machine', { id: 'tvc64-12' });
  await call('write_memory', { address: '6000', bytes: '21 00 70 06 00 AF 77 2C 10 FC C3 00 60' });
  const symFile = path.join(profile, 'loop.sym');
  fs.writeFileSync(symFile, 'START: EQU 0x00006000\nLOOP: EQU 0x00006006\nDONE: EQU 0x0000600A\n');
  await call('load_sym', { file: symFile });
  check(/START:/.test(await call('disassemble', { address: 'START', lines: 4 })), 'labels in the disassembly');
  check(/21 00 70/.test(await call('read_memory', { address: 'START', length: 3 })), 'read_memory with a symbol');
  await call('debug_control', { action: 'pause' });
  await call('eval_js', { code: 'ep.setReg("PC", ep.sym("START")); ep.cont(); return ep.regs().PC;' });
  // 10 + 7 + 4 + 255 * (7 + 4 + 13) + (7 + 4 + 8) = 6160 T, no wait states in RAM
  const m = JSON.parse(await call('measure', { start: 'START', stop: 'DONE', frames: 5, exclude_irq: true, samples: 2 }));
  check(m.count > 10 && m.min === 6160 && m.max === 6160, 'measure: the loop takes 6160 cycles (' + m.min + '..' + m.max + ')');
  const per = JSON.parse(await call('measure', { start: 'LOOP', frames: 1, samples: 0 }));
  check(per.min === 24, 'measure: one iteration takes 24 cycles');
  const st = JSON.parse(await call('state'));
  check(typeof st.cycles === 'number' && st.beam && st.beam.frameLines > 0 && Array.isArray(st.io.crtc), 'state: cycles, beam, CRTC');
  await call('trace', { action: 'on', from: 'LOOP', to: 'LOOP' });
  await call('run_frames', { frames: 1 });
  check(/6006 F9/.test(await call('trace', { action: 'dump', count: 3 })), 'trace: PC and segment');
  await call('trace', { action: 'off' });
  // profile: the loop and its wait states; video memory and pixels
  const prof = await call('profile', { frames: 5, top: 5 });
  check(/LOOP/.test(prof.split('\n')[1] || ''), 'profile: the loop first');
  await call('eval_js', { code: 'ep.out(2, 0x50); ep.poke(3, 0x50); ep.poke(0x8100, 0x5A); return ep.regs().pages;' });
  check(/^0100 {2}5A/m.test(await call('read_memory', { address: '0100', length: 1, source: 'vid' })), 'read_memory: video memory');
  check(/colors:/.test(await call('pixels', { x: 0, y: 0, w: 8, h: 2 })), 'pixels');
  // keys: back to BASIC, then type with run_frames keys / key_down
  await call('debug_control', { action: 'pause' });
  await call('eval_js', { code: 'ep.setReg("PC", 0x6000 + 13); ep.poke(0x600D, 0xC9); ep.cont(); return 1;' });
  await call('run_frames', { frames: 20 });
  await call('eval_js', { code: 'ep.reset(true); await ep.ready(); return ep.atPrompt();' });
  await call('run_frames', { frames: 3, keys: ['KeyA'] });
  await call('run_frames', { frames: 10 });
  await call('key_down', { keys: ['KeyB'] });
  await call('run_frames', { frames: 3 });
  await call('key_up', {});
  await call('run_frames', { frames: 10 });
  check(/ab/i.test(await call('screen_text')), 'keys typed "ab"');
  // determinism: the same input from the same state gives the same memory and cycles
  const det = JSON.parse(await call('eval_js', { code: `
    const s = ep.snapshot();
    const run = () => { ep.restore(s); ep.runFrames(30, { perFrame: (i) => (i === 2 ? ['KeyC'] : i === 7 ? ['Joy1Fire'] : []) });
                        return ep.cycles() + ':' + ep.read(0, 65536).join(','); };
    return run() === run();` }));
  check(det === true, 'runFrames with perFrame keys is repeatable');
  // manual mode stays on after a reload and a machine switch: the machine
  // does not run between the calls
  for (const step of [['emulator_start', { reload: true }], ['set_machine', { id: 'tvc64-12' }]]) {
    await call(...step);
    const t1 = JSON.parse(await call('state')).timeMs;
    await new Promise((r) => setTimeout(r, 1000));
    const t2 = JSON.parse(await call('state'));
    check(t2.manual === true && t2.timeMs === t1, 'manual mode after ' + step[0] + ' (' + t1 + ' -> ' + t2.timeMs + ' ms)');
  }
  // a local path in eval_js (ep.loadSym / ep.load fetch it through the server)
  check(await call('eval_js', { code: 'return await ep.loadSym(' + JSON.stringify(symFile) + ', { prefix: "L_" });' }) === '3', 'loadSym with a local path');
} finally {
  await client.close();
  fs.rmSync(profile, { recursive: true, force: true });
}
