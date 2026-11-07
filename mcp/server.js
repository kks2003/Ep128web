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
//   EP128WEB_MANUAL    0: the machine runs in real time between the tool
//                      calls (default: manual mode, it runs only when a tool
//                      runs it: repeatable)

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
const MANUAL = process.env.EP128WEB_MANUAL !== '0';
// local files for the page (ep.load / ep.loadSym with a local path in
// eval_js): served under this path of the page's own origin
const LOCAL_PREFIX = '/__ep128web_local__/';
const expandHome = (f) => (/^~[\\/]/.test(f) ? path.join(os.homedir(), f.slice(2)) : f);

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
    const origin = new URL(PAGE_URL).origin;
    await context.addInitScript((u) => { window.__ep128webLocal = u; }, origin + LOCAL_PREFIX);
    await context.route((u) => u.origin === origin && u.pathname.startsWith(LOCAL_PREFIX), async (route) => {
      const u = new URL(route.request().url());
      const file = expandHome(decodeURIComponent(u.pathname.slice(LOCAL_PREFIX.length)));
      try {
        await route.fulfill({ status: 200, body: await fs.readFile(file), contentType: 'application/octet-stream' });
      } catch (e) {
        await route.fulfill({ status: 404, body: String(e.message) });
      }
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
  // manual mode: the machine runs only in the tools (run_frames, typing,
  // waiting...); the execution history is recorded for the debugger
  await page.evaluate((m) => { ep.manual(m); ep.history(0); }, MANUAL);
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
  bytes = await fs.readFile(expandHome(file));
  return p.evaluate(([b64, n]) => {
    const s = atob(b64), a = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
    return ep.load([{ name: n, bytes: a }]);
  }, [bytes.toString('base64'), name || path.basename(file)]);
}

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const hex = (v, n) => v.toString(16).toUpperCase().padStart(n, '0');
const num = z.union([z.number().int(), z.string()]).describe('a number, a hex string such as "C000" / "0xC000", or a symbol (load_sym), symbol+offset');
const toNum = (v) => (typeof v === 'number' ? v : parseInt(String(v).replace(/^0x|^\$|h$/i, ''), 16));
// a CPU address: a number, hex, or a symbol known in the page
const toAddr = async (v) => (typeof v === 'number' || /^(0x|\$)?[0-9a-f]+h?$/i.test(String(v).trim()) ? toNum(String(v).trim())
  : inPage((x) => ep.addr(x), String(v)));

const server = new McpServer({ name: 'ep128web', version: '1.0.0' }, {
  instructions:
    'Ep128web: an Enterprise 128 / Videoton TVC emulator (ep128emu) in a browser. ' +
    'Start with emulator_start (or set_machine). Read the screen with screen_text; type with type_text ' +
    '("\\n" = Enter); BASIC shows "ok" when it waits for a command. Enterprise IS-BASIC: one statement per line. ' +
    'The machine runs only while a tool runs it (manual mode; manual_mode turns it off): run_frames runs ' +
    'n frames of 20 ms, with keys held (keys) — repeatable, the same input gives the same result. ' +
    'Debugger: state (registers, cycles, beam, I/O), read_memory, disassemble, breakpoint, debug_control, ' +
    'monitor (ep128emu monitor commands, "?" lists them), trace. Timing: measure (exact Z80 cycles between ' +
    'two addresses). load_sym loads assembler symbols (sjasmplus --sym); names work as addresses. ' +
    'eval_js runs any code with the page\'s `ep` object (docs/AUTOMATION.md).'
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

const keyNames = z.array(z.string()).describe('key names: KeyboardEvent.code (KeyA, Digit1, Space, Enter, ArrowUp, ShiftLeft, End = STOP…) or joysticks: Joy1Up, Joy1Down, Joy1Left, Joy1Right, Joy1Fire (Joy2…; TVC: Joy3, Joy4 = GameCard)');

server.registerTool('run_frames', {
  title: 'Run frames',
  description: 'Runs n frames (20 ms emulated each) at once, as fast as possible. Stops early at a breakpoint. Optionally holds keys during all of them (released after). Returns the frames run and the state.',
  inputSchema: {
    frames: z.number().int().min(1).max(100000),
    keys: keyNames.optional()
  }
}, async ({ frames, keys }) => {
  return text(await inPage(([n, k]) => {
    let run = 0;
    while (run < n) {
      const r = ep.runFrames(Math.min(500, n - run), k ? { perFrame: () => k } : undefined);
      run += r;
      if (r === 0 || ep.stopped()) break;
    }
    return { framesRun: run, state: ep.state() };
  }, [frames, keys || null]));
});

server.registerTool('key_down', {
  title: 'Hold keys',
  description: 'Presses keys (or joystick directions) at once and holds them until key_up — also across breakpoints and run_frames calls.',
  inputSchema: { keys: keyNames }
}, async ({ keys }) => {
  await inPage((k) => ep.keyDown(k), keys);
  return text(await inPage(() => ({ held: ep.state().keys })));
});

server.registerTool('key_up', {
  title: 'Release keys',
  description: 'Releases keys held by key_down (no keys: all of them, and any pending press_key).',
  inputSchema: { keys: keyNames.optional() }
}, async ({ keys }) => {
  await inPage((k) => (k && k.length ? ep.keyUp(k) : ep.keysUp()), keys || null);
  return text(await inPage(() => ({ held: ep.state().keys })));
});

server.registerTool('manual_mode', {
  title: 'Manual mode',
  description: 'on (default for this server): the machine runs only when a tool runs it; off: it runs in real time in the browser between the tool calls.',
  inputSchema: { on: z.boolean() }
}, async ({ on }) => text({ manual: await inPage((m) => ep.manual(m), on) }));

server.registerTool('measure', {
  title: 'Measure cycles',
  description: 'Runs `frames` frames and measures the exact Z80 cycles (T-states, with the wait states) from the instruction at `start` to the instruction at `stop`, every time it runs. Nested starts count as the outermost pair; without stop: from one start to the next. Addresses: hex, a symbol (load_sym), symbol+offset, or "seg:offset". exclude_irq leaves out the interrupts taken meanwhile (acceptance to return).',
  inputSchema: {
    start: z.string(),
    stop: z.string().optional(),
    frames: z.number().int().min(1).max(10000).optional().describe('default 50'),
    exclude_irq: z.boolean().optional(),
    samples: z.number().int().min(0).max(10000).optional().describe('samples to return (default 20)'),
    keys: keyNames.optional().describe('keys held during the frames')
  }
}, async ({ start, stop, frames, exclude_irq, samples, keys }) => {
  return text(await inPage((o) => {
    const k = o.keys;
    delete o.keys;
    if (k) o.perFrame = () => k;
    return ep.measure(o);
  }, { start, stop, frames: frames || 50, excludeIrq: !!exclude_irq, maxSamples: samples === undefined ? 20 : samples, keys: keys || null }));
});

server.registerTool('load_sym', {
  title: 'Load symbols',
  description: 'Loads assembler symbols (sjasmplus --sym "name: EQU 0x0000ABCD", also "name equ 1234h", "1234 name") from a local file, a URL or the text itself, added to the ones loaded. Afterwards the names work in breakpoint, measure, disassemble, read_memory, and labels show in the disassembly.',
  inputSchema: {
    file: z.string().optional().describe('local path or URL'),
    text: z.string().optional().describe('the symbol file\'s text'),
    prefix: z.string().optional().describe('put before each name'),
    segment: z.union([z.number().int(), z.string()]).optional().describe('the symbols are valid only with this segment paged in (hex)'),
    replace: z.boolean().optional().describe('remove the symbols loaded before')
  }
}, async ({ file, text: t, prefix, segment, replace }) => {
  let src = t;
  if (!src && file) src = /^https?:\/\//.test(file) ? null : await fs.readFile(expandHome(file), 'utf8');
  if (!src && !file) throw new Error('file or text is needed');
  const n = await inPage(async ([s, u, o]) => ep.loadSym(s !== null ? s + '\n' : u, o),
    [src === null ? null : src, file || '', { prefix: prefix || '', segment: segment === undefined ? undefined : toNum(segment), replace: !!replace }]);
  return text('loaded ' + n + ' symbols');
});

server.registerTool('trace', {
  title: 'Instruction trace',
  description: 'on: records the registers, segment and cycle count before each instruction (the last 65536; optionally only in from..to); off; dump: the last `count` entries with the disassembly.',
  inputSchema: {
    action: z.enum(['on', 'off', 'dump']),
    from: z.string().optional(),
    to: z.string().optional(),
    count: z.number().int().min(1).max(65536).optional().describe('dump: entries (default 50)')
  }
}, async ({ action, from, to, count }) => {
  if (action === 'dump') {
    const rows = await inPage((n) => ep.traceDump(n, { disasm: true }), count || 50);
    return text(rows.map((e) => hex(e.pc, 4) + ' ' + hex(e.segment, 2) + ' ' + String(e.cycle).padStart(12) + '  ' +
      (e.text || '').replace(/^\s*[0-9A-F]{4}\s+(?:[0-9A-F]{2} )*[0-9A-F]{2}\s+/, '').padEnd(22) +
      ' AF=' + hex(e.AF, 4) + ' BC=' + hex(e.BC, 4) + ' DE=' + hex(e.DE, 4) + ' HL=' + hex(e.HL, 4) +
      ' IX=' + hex(e.IX, 4) + ' IY=' + hex(e.IY, 4) + ' SP=' + hex(e.SP, 4)).join('\n') || '(empty)');
  }
  await inPage(([on, f, t]) => ep.trace(on, Object.assign({}, f ? { from: f } : {}, t ? { to: t } : {})), [action === 'on', from || '', to || '']);
  return text('trace ' + action);
});

server.registerTool('state', {
  title: 'Machine state',
  description: 'Machine, running / stopped, emulated time, CPU cycles, the beam (video line, cycles in the line), registers, the I/O registers (TVC: CRTC, paging, VRAM; EP: NICK, DAVE, paging), held keys, stop reason, the last onBreak error.',
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
  const a = src ? toNum(address) : await toAddr(address);
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
  const a = await toAddr(address);
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
  return text((await inPage(([a, n]) => ep.disasm(a === null ? ep.regs().PC : a, n), [address === undefined ? null : await toAddr(address), lines || 20])).join('\n'));
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
  }, [action, address === undefined ? 0 : await toAddr(address)]));
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
