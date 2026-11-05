#!/usr/bin/env node
// Ep128web MCP server: lets AI agents (Claude Desktop, Claude Code, other MCP
// clients) run and debug the Enterprise 128 / Videoton TVC emulator. It opens
// the Ep128web page in a browser (Playwright, Chromium) and offers its
// automation API (window.ep, see ../docs/AUTOMATION.md) as MCP tools.
//
// Settings (environment variables):
//   EP128WEB_URL       the page (default: https://kks2003.github.io/Ep128web/)
//   EP128WEB_ROMS      path of ep128emu_roms-2.0.11.bin, loaded when the
//                      browser profile has no ROMs yet
//   EP128WEB_HEADLESS  0: show the browser window (default: headless)
//   EP128WEB_PROFILE   browser profile directory (keeps the ROMs and the
//                      settings between runs; default: ~/.ep128web-mcp)
//   EP128WEB_CHROMIUM  path of a Chromium / Chrome executable (default: the
//                      one installed by "npx playwright install chromium")

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const URL_DEFAULT = 'https://kks2003.github.io/Ep128web/';
const PAGE_URL = process.env.EP128WEB_URL || URL_DEFAULT;
const HEADLESS = process.env.EP128WEB_HEADLESS !== '0';
const PROFILE = process.env.EP128WEB_PROFILE || path.join(os.homedir(), '.ep128web-mcp');

let context = null;
let page = null;

// the browser with the emulator page, started at the first tool call
async function getPage() {
  if (page && !page.isClosed()) return page;
  if (!context) {
    context = await chromium.launchPersistentContext(PROFILE, {
      headless: HEADLESS,
      executablePath: process.env.EP128WEB_CHROMIUM || undefined,
      viewport: { width: 1100, height: 900 },
      // the page's sound starts after a click; not needed here
      args: ['--autoplay-policy=no-user-gesture-required']
    });
  }
  page = context.pages()[0] || await context.newPage();
  await page.goto(PAGE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.ep && window.ep.ready, null, { timeout: 60000 });
  // ROMs: load the package given in EP128WEB_ROMS if the page has none
  const missing = await page.evaluate(async () => {
    try { await ep.ready({ prompt: false, timeout: 3000 }); return ''; } catch (e) { return e.message; }
  });
  if (/ROMs missing/.test(missing)) {
    if (!process.env.EP128WEB_ROMS) {
      throw new Error(missing + ' — set EP128WEB_ROMS to the path of ep128emu_roms-2.0.11.bin, or call load_file with it');
    }
    await loadFile(process.env.EP128WEB_ROMS);
  }
  return page;
}

// runs fn(ep, arg) in the page; errors come back as tool errors
async function inPage(fn, arg) {
  const p = await getPage();
  return p.evaluate(fn, arg);
}

async function loadFile(file, name) {
  const p = page;
  let bytes;
  if (/^https?:\/\//.test(file)) {
    return p.evaluate(([u, n]) => ep.load(u, n || undefined), [file, name || '']);
  }
  bytes = await fs.readFile(file);
  return p.evaluate(([b64, n]) => {
    const s = atob(b64), a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return ep.load([{ name: n, bytes: a }]);
  }, [bytes.toString('base64'), name || path.basename(file)]);
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
const num = z.union([z.number().int(), z.string()]).describe('a number, or a hex string such as "C000" / "0xC000"');
const toNum = (v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/^0x|^\$|h$/i, ''), 16));

const server = new McpServer({ name: 'ep128web', version: '1.0.0' }, {
  instructions:
    'Ep128web: an Enterprise 128 / Videoton TVC emulator (ep128emu) in a browser. ' +
    'Start with emulator_start (or set_machine). Read the screen with screen_text; type with type_text ' +
    '("\\n" = Enter); BASIC shows "ok" when it waits for a command. Enterprise IS-BASIC: one statement per line. ' +
    'Use run_frames for repeatable timing (20 ms per frame). Debugger: registers, read_memory, disassemble, ' +
    'breakpoint, debug_control, monitor (ep128emu monitor commands, "?" lists them). eval_js runs any code ' +
    'with the page\'s `ep` object (docs/AUTOMATION.md).'
});

server.registerTool('emulator_start', {
  title: 'Start the emulator',
  description: 'Opens the emulator page (if needed) and waits until BASIC waits for a command. Optionally switches machine first. Returns the screen text.',
  inputSchema: {
    machine: z.string().optional().describe('machine id, see list_machines (e.g. "tvc64-12", "tvc64p-22", "ep128uk-exdos")'),
    reload: z.boolean().optional().describe('reload the page first')
  }
}, async ({ machine, reload }) => {
  const p = await getPage();
  if (reload) {
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.ep && window.ep.ready, null, { timeout: 60000 });
  }
  if (machine) await p.evaluate((id) => ep.machine(id), machine);
  else await p.evaluate(() => ep.ready());
  return text(await p.evaluate(() => ({ state: ep.state(), screen: ep.screenText() })));
});

server.registerTool('list_machines', {
  title: 'List the machines',
  description: 'The machines the emulator can run (id, name, ep / tvc).',
  inputSchema: {}
}, async () => text(await inPage(() => ep.machines())));

server.registerTool('set_machine', {
  title: 'Switch machine',
  description: 'Switches to a machine with a cold start and waits for the BASIC prompt.',
  inputSchema: {
    id: z.string().describe('machine id (list_machines)'),
    slots: z.array(z.enum(['empty', 'file', 'vtdos', 'upm', 'gamecard', 'soundcard', 'card256'])).length(4).optional()
      .describe('TVC expansion ports 0-3'),
    fx: z.boolean().optional().describe('the 2dfx graphics card')
  }
}, async ({ id, slots, fx }) => {
  await inPage(([i, s, f]) => ep.machine(i, Object.assign({}, s ? { slots: s } : {}, f !== null ? { fx: f } : {})), [id, slots || null, fx === undefined ? null : fx]);
  return text(await inPage(() => ({ state: ep.state(), screen: ep.screenText() })));
});

server.registerTool('load_file', {
  title: 'Load a file',
  description: 'Loads a file as if dropped on the screen: programs (.cas, .com, .bas, .zip…) start automatically, .tap/.wav go to the tape, .dsk/.img to drive A:, .ep128s snapshots, .bin/.rom ROMs. A local path or an http(s) URL.',
  inputSchema: {
    file: z.string().describe('local path or URL'),
    name: z.string().optional().describe('file name to use (default: from the path)')
  }
}, async ({ file, name }) => {
  await getPage();
  await loadFile(file, name);
  return text(await inPage(() => ({ state: ep.state(), screen: ep.screenText() })));
});

server.registerTool('type_text', {
  title: 'Type text',
  description: 'Types on the emulated keyboard ("\\n" = Enter) and returns the screen text afterwards.',
  inputSchema: {
    text: z.string(),
    settle_frames: z.number().int().min(0).max(5000).optional().describe('frames to run after typing (default 10)')
  }
}, async ({ text: t, settle_frames }) => {
  return text(await inPage(async ([s, n]) => {
    // a breakpoint can stop the machine while it types: then return at once
    let stopped = false;
    await Promise.race([ep.type(s), (async () => {
      while (!ep.stopped()) await new Promise((r) => setTimeout(r, 50));
      stopped = true;
    })()]);
    if (stopped) return 'STOPPED by the debugger: ' + JSON.stringify(ep.state().stop) + ' (the typing continues after debug_control continue)\n' + ep.screenText();
    if (n) ep.runFrames(n);
    return ep.screenText();
  }, [t, settle_frames === undefined ? 10 : settle_frames]));
});

server.registerTool('press_key', {
  title: 'Press a key',
  description: 'Holds a key for some emulated time. Keys are KeyboardEvent.code names: Space, Enter, KeyA, Digit1, ArrowUp, Escape, F1, End (STOP), ShiftLeft…',
  inputSchema: { key: z.string(), ms: z.number().int().min(1).max(10000).optional() }
}, async ({ key, ms }) => {
  await inPage(([k, m]) => ep.press(k, m), [key, ms || 100]);
  return text('ok');
});

server.registerTool('screen_text', {
  title: 'Read the screen',
  description: 'The text on the screen (EP: text screens; TVC: read back with the ROM font, unknown characters as "?"), and whether BASIC waits for a command.',
  inputSchema: {}
}, async () => text(await inPage(() => ({ atPrompt: ep.atPrompt(), screen: ep.screenText() }))));

server.registerTool('wait_text', {
  title: 'Wait for text',
  description: 'Waits until the screen contains the text (or matches the regular expression).',
  inputSchema: {
    text: z.string().optional(),
    regex: z.string().optional().describe('JavaScript regular expression source, multiline mode'),
    timeout_ms: z.number().int().min(100).max(600000).optional()
  }
}, async ({ text: t, regex, timeout_ms }) => {
  return text(await inPage(([s, r, ms]) => ep.waitText(r ? new RegExp(r, 'm') : s, { timeout: ms }), [t || '', regex || '', timeout_ms || 30000]));
});

server.registerTool('screenshot', {
  title: 'Screenshot',
  description: 'The emulator\'s picture as a PNG image.',
  inputSchema: {}
}, async () => {
  const url = await inPage(() => ep.screenshot());
  return { content: [{ type: 'image', data: url.replace(/^data:image\/png;base64,/, ''), mimeType: 'image/png' }] };
});

server.registerTool('run_frames', {
  title: 'Run frames',
  description: 'Runs n frames (20 ms emulated each) at once, as fast as possible. Stops early at a breakpoint. Returns the frames run and the state.',
  inputSchema: { frames: z.number().int().min(1).max(100000) }
}, async ({ frames }) => {
  return text(await inPage((n) => {
    let run = 0;
    while (run < n) {
      const k = ep.runFrames(Math.min(500, n - run));
      run += k;
      if (k === 0 || ep.stopped()) break;
    }
    return { framesRun: run, state: ep.state() };
  }, frames));
});

server.registerTool('state', {
  title: 'Machine state',
  description: 'Machine, running / stopped, emulated time, registers, stop reason.',
  inputSchema: {}
}, async () => text(await inPage(() => ep.state())));

server.registerTool('read_memory', {
  title: 'Read memory',
  description: 'A hex dump of memory. source: cpu (Z80 address with the current paging), physical (segment * 16384 + offset), 2dfx, psram (TVC256k++), cardram (TVC256k++).',
  inputSchema: {
    address: num,
    length: z.number().int().min(1).max(65536),
    source: z.enum(['cpu', 'physical', '2dfx', 'psram', 'cardram']).optional()
  }
}, async ({ address, length, source }) => {
  const src = { cpu: 0, physical: 1, '2dfx': 2, psram: 3, cardram: 4 }[source || 'cpu'];
  const a = toNum(address);
  const bytes = await inPage(([x, n, s]) => ep.read(x, n, s), [a, length, src]);
  const lines = [];
  for (let o = 0; o < bytes.length; o += 16) {
    const row = bytes.slice(o, o + 16);
    lines.push(hex(a + o, src ? 6 : 4) + '  ' + row.map((b) => hex(b, 2)).join(' ').padEnd(48) + ' ' +
               row.map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join(''));
  }
  return text(lines.join('\n'));
});

server.registerTool('write_memory', {
  title: 'Write memory',
  description: 'Writes bytes to CPU memory (current paging).',
  inputSchema: { address: num, bytes: z.string().describe('hex bytes, e.g. "3E 05 C9"') }
}, async ({ address, bytes }) => {
  const a = toNum(address);
  const b = bytes.trim().split(/[\s,]+/).filter(Boolean).map((x) => parseInt(x, 16));
  if (b.some((x) => Number.isNaN(x) || x < 0 || x > 255)) throw new Error('bytes: hex values 00-FF');
  await inPage(([x, v]) => v.forEach((y, i) => ep.poke(x + i, y)), [a, b]);
  return text('written ' + b.length + ' bytes at ' + hex(a, 4));
});

server.registerTool('disassemble', {
  title: 'Disassemble',
  description: 'Z80 disassembly with labels, from a CPU address (default: PC).',
  inputSchema: { address: num.optional(), lines: z.number().int().min(1).max(500).optional() }
}, async ({ address, lines }) => {
  return text((await inPage(([a, n]) => ep.disasm(a === null ? ep.regs().PC : a, n), [address === undefined ? null : toNum(address), lines || 20])).join('\n'));
});

server.registerTool('breakpoint', {
  title: 'Breakpoints and watchpoints',
  description: 'add: execution breakpoint (type x) or watchpoint (r, w, rw, ior, iow, iorw) at an address, a range "C000-FFFF" or a segment range "FF:0000-3FFF"; clear: removes all. When one hits, the machine stops (state shows the reason); continue with debug_control.',
  inputSchema: {
    action: z.enum(['add', 'clear']),
    address: z.string().optional().describe('e.g. "C000", "C000-FFFF", "FF:0000-3FFF", port "5F"'),
    type: z.enum(['x', 'r', 'w', 'rw', 'ior', 'iow', 'iorw']).optional(),
    condition: z.string().optional().describe('optional condition, as in the debugger')
  }
}, async ({ action, address, type, condition }) => {
  if (action === 'clear') { await inPage(() => ep.clearBps()); return text('cleared'); }
  if (!address) throw new Error('address is needed');
  await inPage(([a, t, c]) => (t === 'x' ? ep.bp(a, c || '') : ep.watch(t, a, c || '')), [address, type || 'x', condition || '']);
  return text('added');
});

server.registerTool('debug_control', {
  title: 'Debugger control',
  description: 'pause, continue, step (one instruction), step_over, run_to (an address). Returns the state and the disassembly at PC.',
  inputSchema: { action: z.enum(['pause', 'continue', 'step', 'step_over', 'run_to']), address: num.optional() }
}, async ({ action, address }) => {
  return text(await inPage(async ([act, a]) => {
    if (act === 'pause') ep.pause();
    else if (act === 'continue') ep.cont();
    else if (act === 'step') ep.step();
    else if (act === 'step_over') ep.stepOver();
    else if (act === 'run_to') ep.runTo(a);
    // let the page handle the stop (a frame), then report
    ep.runFrames(1);
    await new Promise((r) => setTimeout(r, 50));
    const st = ep.state();
    return { state: st, disasm: st.regs ? ep.disasm(st.regs.PC, 5) : [] };
  }, [action, address === undefined ? 0 : toNum(address)]));
});

server.registerTool('monitor', {
  title: 'Monitor command',
  description: 'Runs an ep128emu monitor command and returns its output ("?" lists the commands; e.g. "R", "D C000", "M 0000").',
  inputSchema: { command: z.string() }
}, async ({ command }) => text(await inPage((c) => ep.monitor(c), command)));

server.registerTool('snapshot', {
  title: 'Save / restore the state',
  description: 'save: writes the whole machine state (with the TVC256k++ / 2dfx cards) to a JSON file; restore: loads it back.',
  inputSchema: { action: z.enum(['save', 'restore']), path: z.string() }
}, async ({ action, path: file }) => {
  if (action === 'save') {
    const st = await inPage(() => {
      const s = ep.snapshot();
      const b64 = (u) => { let t = ''; for (let i = 0; i < u.length; i += 8192) t += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(t); };
      return Object.assign({}, s, { bytes: b64(s.bytes), card: s.card ? b64(s.card) : null });
    });
    await fs.writeFile(file, JSON.stringify(st));
    return text('saved to ' + file);
  }
  const st = JSON.parse(await fs.readFile(file, 'utf8'));
  await inPage((s) => {
    const un = (t) => { const x = atob(t), a = new Uint8Array(x.length); for (let i = 0; i < x.length; i++) a[i] = x.charCodeAt(i); return a; };
    ep.restore(Object.assign({}, s, { bytes: un(s.bytes), card: s.card ? un(s.card) : null }));
  }, st);
  return text(await inPage(() => ({ state: ep.state(), screen: ep.screenText() })));
});

server.registerTool('eval_js', {
  title: 'Run JavaScript in the page',
  description: 'Runs JavaScript in the emulator page with the `ep` automation object (see docs/AUTOMATION.md) and returns the result as JSON. The code is the body of an async function: use await and return.',
  inputSchema: { code: z.string() }
}, async ({ code }) => {
  const r = await inPage((c) => (new Function('ep', 'return (async () => {' + c + '\n})()'))(ep), code);
  return text(r === undefined ? 'undefined' : r);
});

process.on('SIGINT', async () => { if (context) await context.close(); process.exit(0); });
process.on('SIGTERM', async () => { if (context) await context.close(); process.exit(0); });

await server.connect(new StdioServerTransport());
