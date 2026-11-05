# Ep128web automation API (for programs and AI agents)

Ep128web runs ep128emu (Enterprise 128/64, Videoton TVC) in the browser. Everything on
the page can also be driven from code through the global object **`window.ep`**: start a
machine, load programs and ROMs, type, read the screen as text, run a fixed number of
frames, use the debugger (registers, memory, breakpoints, disassembly) and save / restore
the whole machine state.

- Live site: <https://kks2003.github.io/Ep128web/>
- Use it from the browser console, from a script on the debugger's *Script* tab, or from
  a test / agent driving a browser (Playwright, Puppeteer, Selenium, Chrome DevTools).
- For MCP clients (Claude Desktop, Claude Code…) there is a ready-made MCP server that
  wraps this API as tools: [../mcp/README.md](../mcp/README.md).
- All functions are synchronous unless marked **async** (they return a Promise).
- The emulator needs the machines' ROMs (`ep128emu_roms-2.0.11.bin`); the page stores them
  in the browser (IndexedDB) once loaded. Without them `ep.ready()` throws
  `ROMs missing: …`.

## Quick start

```js
// in the page (e.g. page.evaluate in Playwright)
await ep.load('https://example.org/ep128emu_roms-2.0.11.bin'); // only if no ROMs yet
await ep.machine('tvc64-12');          // cold start; waits for BASIC's "ok"
await ep.type('10 PRINT "HELLO"\nRUN\n');
await ep.waitText('HELLO');
console.log(ep.screenText());
```

Playwright (Node):

```js
const { chromium } = require('playwright');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('https://kks2003.github.io/Ep128web/');
await page.waitForFunction(() => window.ep);
const text = await page.evaluate(async () => {
  await ep.ready();                    // the machine last used on this browser
  await ep.type('PRINT 6*7\n');
  await ep.waitText(/^ *42$/m);
  return ep.screenText();
});
```

## Machines and loading

| Function | Description |
| --- | --- |
| `ep.machines()` | `[{id, name, type: 'ep' \| 'tvc'}]` – the available machines |
| **async** `ep.ready({timeout, prompt})` | Waits until the emulator runs, then (unless `prompt: false`) until BASIC shows `ok`. At the start-up logo it presses Space (only if no key was pressed since the reset). Default timeout 60 s. |
| **async** `ep.machine(id, opts)` | Switches to a machine with a cold start and waits for `ok`. `opts.slots` (TVC expansion ports 0–3): four of `'empty'`, `'file'`, `'vtdos'`, `'upm'`, `'gamecard'`, `'soundcard'`, `'card256'`; `opts.fx: true` adds the 2dfx graphics card; `opts.wait: false` does not wait. |
| **async** `ep.load(src, name)` | Loads files as if dropped on the screen: programs start automatically (`.cas`, `.com`, `.bas`, `.zip`…), `.tap`/`.wav` go to the tape, `.dsk`/`.img` to drive A:, `.ep128s`/`.ep128d` are snapshots / demos, `.bin`/`.rom` are ROMs. `src`: URL, `ArrayBuffer`, `Uint8Array`, `Blob`/`File`, or `[{name, bytes}]`. Resolves when the start command has been typed. |
| `ep.reset(cold)` | Warm / cold reset |
| `ep.state()` | `{machine, type, ready, paused, stopped, typing, timeMs, regs, stop, tvcSlots, fx}` |
| `ep.version()` | The build (date and commit) |

TVC programs: the default TVC is `tvc64-12` (BASIC 1.2, ports: FILE:, VT-DOS, GameCard,
empty). Programs from the TVC catalogue can also be started by URL:
`https://kks2003.github.io/Ep128web/#p=<file.zip>&t=<title>` (the title's tags pick the
machine: `(64k+)`, `(DOS)`, `(UPM)`, `(256k++)`, `(2dfx)`).

## Screen and keyboard

| Function | Description |
| --- | --- |
| `ep.screenText()` | The text on the screen, lines joined with `\n`. Enterprise: the character rows of the NICK chip (IS-BASIC, EXOS text screens; the cursor and graphics characters as spaces). TVC: the picture read back with the ROM font (8×10 pixel characters, all three graphics modes); characters not in the ROM font (graphics, accented letters, a redefined font) come back as `?`. |
| `ep.screenLines()` | The same as an array |
| `ep.atPrompt()` | `true` if BASIC waits for a command (the last line with text is `ok`) |
| **async** `ep.waitText(textOrRegExp, {timeout})` | Waits until the screen text contains / matches it (default 30 s real time); returns the text, or throws with the screen's text |
| `ep.screenshot()` | The picture as a PNG data URL |
| **async** `ep.type(text)` | Types on the emulated keyboard (`\n` = Enter); resolves when typed. Waits for an earlier typing to finish. |
| **async** `ep.press(code, ms)` | Holds a key for `ms` ms of emulated time (default 100). `code`: a `KeyboardEvent.code` such as `'Space'`, `'KeyA'`, `'Enter'`, `'ArrowUp'`, `'Escape'`, `'F1'`, `'End'` (= STOP). |

Keyboard mapping: the PC keyboard in the machine's layout; Enterprise: Esc = ESC,
Backspace = ERASE, Del = DEL, Ins = INS, End = STOP, Home = HOLD, Alt = ALT, F1–F8 =
function keys. TVC: Esc = ESC, End = STOP (Ctrl+Esc). IS-BASIC (Enterprise) has one
statement per line (no `:`).

## Time

The machine runs in real time (driven by the browser's animation frames; slower in a
background tab).

| Function | Description |
| --- | --- |
| `ep.runFrames(n)` | Runs `n` frames (20 ms emulated each) at once, as fast as possible, then draws the picture. Returns the number run (fewer if the debugger stopped the machine). Use it for repeatable tests. |
| **async** `ep.wait(ms)` | Resolves after `ms` ms of emulated time |
| **async** `ep.until(fn)` | Resolves at the first frame where `fn()` is true |
| `ep.time()` | Emulated time in ms |
| `ep.onFrame(fn)` | `fn(us)` after each frame (one handler; `null` removes it) |

## Debugger

| Function | Description |
| --- | --- |
| `ep.regs()` | Registers `{PC, AF, BC, DE, HL, IX, IY, SP, AF_, BC_, DE_, HL_, I, R, IM, IFF1, IFF2, pages}` (`pages`: the segments of the four 16 KB pages) and the 8-bit halves `A, F, B, C, D, E, H, L` |
| `ep.setReg(name, value)` | Sets a register (`'HL'`, `'AF_'`…) |
| `ep.peek(a)`, `ep.peek16(a)`, `ep.poke(a, v)` | CPU memory (with the current paging) |
| `ep.read(addr, n, src)` | `n` bytes; `src` 0 = CPU address (default), 1 = physical address (segment × 16384 + offset), 2 = 2dfx resource RAM, 3 = TVC256k++ PSRAM, 4 = TVC256k++ card RAM |
| `ep.out(port, v)` | Writes an I/O port |
| `ep.disasm(a, n)` | `n` lines of disassembly (with labels) |
| `ep.assemble(a, text)` | Assembles one instruction (e.g. `'LD A,5'`) to `a`; returns the next address |
| `ep.bp(addr, cond)` | Execution breakpoint: `0xC000`, `'C000'`, a range `'C000-FFFF'`, a segment `'FF:0000-3FFF'`; optional condition |
| `ep.watch(type, addr, cond)` | Watchpoint: `type` `'r'`, `'w'`, `'rw'`, `'ior'`, `'iow'`, `'iorw'` |
| `ep.clearBps()` | Removes all breakpoints / watchpoints |
| `ep.onBreak(fn)` | `fn(info)` when a breakpoint / watchpoint stops the machine (`info`: `{why, reason, pc, addr, value}`); return `true` to let it run on (e.g. for logging) |
| `ep.pause()`, `ep.cont()`, `ep.step()`, `ep.stepOver()`, `ep.runTo(a)` | Control |
| `ep.stopped()`, `ep.info()` | Stopped? Why (`{why, pc, addr, value}`) |
| `ep.hex(v, digits)` | Hex formatting |
| `ep.monitor(cmd)` | Runs a command of the ep128emu monitor (`?` lists them) and returns its output as text |
| `ep.ioRegs()` | The I/O registers as text (NICK, DAVE / CRTC, video mode…) |
| `ep.history(n)` | The last `n` executed addresses |
| `ep.sym(name)`, `ep.label(a)` | Symbols ↔ addresses (known system addresses, loaded symbol files) |
| `ep.callName(code)`, `ep.addrName(a)`, `ep.portName(p)` | Names: EXOS / TVC system call, address, port |
| `ep.log(...)` | Writes to the Script tab's output |

## State

| Function | Description |
| --- | --- |
| `ep.snapshot()` | The whole machine state (with the TVC256k++ / 2dfx cards): `{machine, slots, fx, time, bytes, card}` |
| `ep.restore(state)` | Restores a `snapshot()` (switching machine and cards if needed) |

## Recipes

Load a TVC program and wait for it to finish:

```js
await ep.machine('tvc64-12');
await ep.load('https://example.org/game.cas');
await ep.waitText(/ok$/m, { timeout: 60000 });
```

Stop at a routine and read its arguments:

```js
ep.bp(0xC000);
ep.onBreak(() => { console.log(ep.regs(), ep.read(ep.regs().HL, 16)); });   // stays stopped
// ... inspect, then: ep.cont()
```

Log every write to an address:

```js
ep.watch('w', 0x0B13);
ep.onBreak((i) => { ep.log('PC', ep.hex(ep.regs().PC, 4), 'value', ep.hex(i.value, 2)); return true; });  // runs on
```

Deterministic check after a fixed time:

```js
await ep.machine('ep128uk-exdos');
await ep.type('PRINT 1+1\n');
ep.runFrames(10);
if (!/^ *2$/m.test(ep.screenText())) throw new Error('bad');
```

## Notes

- `ep.type()`, `ep.wait()` and `ep.until()` progress only while the machine runs (not
  while paused or stopped in the debugger).
- Typing goes through the emulated keyboard; the page types faster than real time.
- Esc leaves the browser's full screen; the page's own shortcuts (F9–F12, Alt+…) are
  listed in the help (Súgó / Help menu).
- The page's language: `localStorage['ep128web.lang']` = `hu`, `en`, `de` or `uk`.
