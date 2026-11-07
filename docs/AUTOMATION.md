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
| **async** `ep.load(src, name)` | Loads files as if dropped on the screen: programs start automatically (`.cas`, `.com`, `.bas`, `.zip`…), `.tap`/`.wav` go to the tape, `.dsk`/`.img` to drive A:, `.ep128s`/`.ep128d` are snapshots / demos, `.bin`/`.rom` are ROMs. `src`: URL, `ArrayBuffer`, `Uint8Array`, `Blob`/`File`, or `[{name, bytes}]`; in the MCP server also a local path (`/home/me/game.cas`, `C:\games\game.cas`, `~/game.cas`). Resolves when the start command has been typed. |
| `ep.reset(cold)` | Warm / cold reset |
| `ep.state()` | `{machine, type, ready, paused, stopped, typing, timeMs, manual, cycles, beam, regs, stop, io, keys, breakError, tvcSlots, fx}` (`io`: see `ep.io()`; `keys`: the keys held by the program; `breakError`: the last exception thrown by the `onBreak` handler) |
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
| `ep.frameSize()` | `{width, height}` of the picture (TVC 672×288, Enterprise 768×288) |
| `ep.pixel(x, y)` | A pixel of the last finished frame, in the screenshot's coordinates: `{x, y, index, r, g, b, hex}`. `index`: what the video chip produced (TVC: its colour value, e.g. 80 = `50h` green; Enterprise: the colour byte) |
| `ep.pixels(x, y, w, h)` | A rectangle of them, row by row: `{x, y, w, h, index: [...], rgb: [[r, g, b]…], hex: ['#rrggbb'…]}` |
| **async** `ep.type(text)` | Types on the emulated keyboard (`\n` = Enter); resolves when typed. Waits for an earlier typing to finish. |
| **async** `ep.press(code, ms)` | Holds a key for `ms` ms of emulated time (default 100): pressed at once, released at the end of the frame in which the time is up, also inside `runFrames` (no `await` needed). Resolves when released. |
| `ep.keyDown(...keys)`, `ep.keyUp(...keys)` | Presses / releases keys at once; they stay held across `runFrames` calls and debugger stops until released |
| `ep.keysUp()` | Releases every key (also the pending `press`es and the PC keyboard's) |
| `ep.input(state)` | Keys held in every frame of the next `ep.runFrames`, released after it |

Key names: a `KeyboardEvent.code` such as `'Space'`, `'KeyA'`, `'Digit1'`, `'Enter'`,
`'ArrowUp'`, `'Escape'`, `'F1'`, `'ShiftLeft'`, `'End'` (= STOP), and the joysticks:
`'Joy1Up'`, `'Joy1Down'`, `'Joy1Left'`, `'Joy1Right'`, `'Joy1Fire'`, `'Joy2…'` (TVC:
`'Joy3…'`, `'Joy4…'` are the GameCard's joysticks). A key state (for `input` and
`perFrame`) is a name, an array of names, or `{keys: [...], joy1: ['up', 'fire'], …}`.
These keys do not go through the PC keyboard's queue (which keeps a minimum hold time
for real typing): they are set on the machine exactly when asked, so the same calls give
the same result every time.

Keyboard mapping: the PC keyboard in the machine's layout; Enterprise: Esc = ESC,
Backspace = ERASE, Del = DEL, Ins = INS, End = STOP, Home = HOLD, Alt = ALT, F1–F8 =
function keys. TVC: Esc = ESC, End = STOP (Ctrl+Esc). IS-BASIC (Enterprise) has one
statement per line (no `:`).

## Time

The machine runs in real time (driven by the browser's animation frames; slower in a
background tab), unless manual mode is on.

| Function | Description |
| --- | --- |
| `ep.runFrames(n, opts)` | Runs `n` frames (20 ms emulated each) at once, as fast as possible, then draws the picture. Returns the number run (fewer if the debugger stopped the machine). Runs also while the page is paused. `opts.perFrame(i)`: returns the key state for frame `i` (`null` / `undefined`: unchanged); the keys of `perFrame` and `ep.input` are released at the end. Not inside an `onBreak` handler (it throws there). |
| `ep.manual(on)` | Manual mode: the machine does not run in real time any more, only in `runFrames`, `measure`, `step` / `stepOver` / `runTo`, and (in whole 20 ms frames) while an async call waits for it: `type`, `press`, `wait`, `until`, `ready`, `waitText`, `load`, `machine`. The page shows *AI in control – manual run*; a click on it turns manual mode off. `ep.manual()` returns the mode. The MCP server turns it on. |
| **async** `ep.wait(ms)` | Resolves after `ms` ms of emulated time |
| **async** `ep.until(fn)` | Resolves at the first frame where `fn()` is true |
| `ep.time()` | Emulated time in ms |
| `ep.onFrame(fn)` | `fn(us)` after each frame (one handler; `null` removes it) |

## Debugger

| Function | Description |
| --- | --- |
| `ep.regs()` | Registers `{PC, AF, BC, DE, HL, IX, IY, SP, AF_, BC_, DE_, HL_, I, R, IM, IFF1, IFF2, pages}` (`pages`: the segments of the four 16 KB pages) and the 8-bit halves `A, F, B, C, D, E, H, L` |
| `ep.cycles()` | Z80 cycles (T-states, with the wait states) since power on. Inside an `onBreak` handler: before the instruction stopped at. |
| `ep.beam()` | `{line, col, frameLines, frameCycles}`: the video line counted from the vertical sync, the cycles since that line started, the lines and the cycles of the last whole frame |
| `ep.setReg(name, value)` | Sets a register (`'HL'`, `'AF_'`…) |
| `ep.peek(a)`, `ep.peek16(a)`, `ep.poke(a, v)` | CPU memory (with the current paging) |
| `ep.addr(a)` | The CPU address of `a`. Everywhere a CPU address is taken (peek, poke, read, disasm, assemble, bp, runTo, measure, trace) it can be a number, hex text (`'C000'`, `'0xC000'`), a symbol or symbol±offset (`'LOOP+2'`) |
| `ep.read(addr, n, src, page)` | `n` bytes; `src` 0 / `'cpu'` = CPU address (default), 1 / `'phys'` = physical address (segment × 16384 + offset), `'vid'` = the video memory whatever the paging (TVC: offset 0–3FFF in video page `page` 0–3, default the page shown; Enterprise: the video address 0–FFFF, segments FCh–FFh), 2 / `'2dfx'` = 2dfx resource RAM, 3 / `'psram'` = TVC256k++ PSRAM, 4 / `'cardram'` = TVC256k++ card RAM |
| `ep.out(port, v)` | Writes an I/O port |
| `ep.disasm(a, n)` | `n` lines of disassembly (with labels: `LOOP:   6006  77  LD (HL), A`) |
| `ep.assemble(a, text)` | Assembles one instruction (e.g. `'LD A,5'`) to `a`; returns the next address |
| `ep.bp(addr, cond)` | Execution breakpoint: `0xC000`, `'C000'`, a range `'C000-FFFF'`, a segment `'FF:0000-3FFF'`; optional condition |
| `ep.watch(type, addr, cond)` | Watchpoint: `type` `'r'`, `'w'`, `'rw'`, `'ior'`, `'iow'`, `'iorw'` |
| `ep.clearBps()` | Removes all breakpoints / watchpoints |
| `ep.onBreak(fn)` | `fn(info)` when a breakpoint / watchpoint stops the machine (`info`: `{why, reason, pc, addr, value}`); return `true` to let it run on (e.g. for logging). If it throws, the machine stays stopped and the error is written to the Script tab's output, the console and `ep.state().breakError`. Everything that reads the state works inside it (`regs`, `cycles`, `beam`, `read`, `traceDump`…); `runFrames` and `measure` do not. |
| `ep.pause()`, `ep.cont()`, `ep.step()`, `ep.stepOver()`, `ep.runTo(a)` | Control. In manual mode `step`, `stepOver` and `runTo` run the machine until it stops (`stepOver` / `runTo`: at most `{frames}`, default 500) and return `ep.stopped()`. |
| `ep.stopped()`, `ep.info()` | Stopped? Why (`{why, pc, addr, value}`) |
| `ep.hex(v, digits)` | Hex formatting |
| `ep.monitor(cmd)` | Runs a command of the ep128emu monitor (`?` lists them) and returns its output as text |
| `ep.ioRegs()` | The I/O registers as text (NICK, DAVE / CRTC, video mode…) |
| `ep.io()` (= `ep.ioRegs(true)`) | The same as an object, with `pages` (the segments paged in). TVC: `crtc` (R0–R15), `crtcSelected`, `vidX`, `vidY`, `crtcMA`, `crtcRA`, `mode`, `palette`, `border`, `port02`, `pagingExt`, `vram`, `vramSegment`, `irq`, `irqMask`, `sound`. Enterprise: `nick` (80h–83h), `nickSlot`, `lpb`, `lpbLine`, `ld1`, `ld2`, `dave` (A0h–AFh), `b4`…`b6` (and the values written), `bf`, `zx`, `disk`. Plus `text`. |
| `ep.history(n)` | The last `n` executed addresses. Recorded from the first `ep.ready`, `machine`, `load`, `manual` or `history` call on (before that it was off, so the list was empty); while it is still empty and the trace is on, the trace's addresses. |
| `ep.trace(on, {from, to})` | Records the registers, the segment and the cycle count before each instruction (the last 65536); `from`/`to`: only that address range |
| `ep.traceDump(n, {disasm})` | The last `n` entries, oldest first: `{pc, segment, cycle, AF, BC, DE, HL, IX, IY, SP}` (`disasm: true`: with `text`) |
| `ep.sym(name)`, `ep.label(a)` | Symbols ↔ addresses (known system addresses, loaded symbol files) |
| `ep.loadSym(src, opts)` | Loads assembler symbols and adds them to the ones loaded: sjasmplus `--sym` (`name: EQU 0x0000ABCD`), also `name equ 1234h`, `name = $1234`, `1234 name`. `src`: the text, a URL (MCP: a local path) or a `File` / `Blob`. `opts`: `prefix` (before each name), `segment` (valid only with that segment paged in; a breakpoint on such a name is a segment breakpoint), `replace` (remove the earlier symbols). Returns the number loaded (a Promise for a URL / file). |
| `ep.syms()` | The loaded symbols: `[{name, addr, segment}]` |
| `ep.callName(code)`, `ep.addrName(a)`, `ep.portName(p)` | Names: EXOS / TVC system call, address, port |
| `ep.log(...)` | Writes to the Script tab's output |

## Timing and profiling

| Function | Description |
| --- | --- |
| `ep.measure({start, stop, frames, excludeIrq, maxSamples, perFrame})` | Runs `frames` frames (default 50) and measures the cycles from the instruction at `start` to the instruction at `stop` (the cycles of `start`'s instruction are counted, those of `stop`'s are not), every time it runs. Nested starts (recursion) count as the outermost pair. Without `stop` (or `stop` = `start`): from one hit to the next (e.g. a loop's period). `start` / `stop`: addresses, symbols, or `'seg:offset'` (only with that segment paged in). `excludeIrq`: the interrupts taken meanwhile are not counted (from the acceptance of the interrupt to the return of its handler: the stack pointer back above the return address — `RETI`, `RET`, TVC's `EI; RET`; IM 1 and IM 2). Returns `{count, avg, min, max, kept, samples: [{startCycle, cycles}], frames, stopped}` (`samples`: the first `maxSamples`, default 10000; at most 100000 are kept for the statistics). `frames: 0` only starts measuring: `ep.measureEnd()` stops it and returns the result. |

| `ep.profile({frames, ranges, bySymbol, maxSymbolSize, top, perFrame})` | Runs `frames` frames (default 50) and returns where the cycles went, most first: `[{name, segment, start, end, cycles, perFrame, percent, waitCycles, instructions}]`. Each instruction's cycles are exact (from its start to the next instruction's start; an interrupt's acceptance counts to the interrupted instruction); `waitCycles`: the wait states among them. Grouped by `ranges` (`[{name, start, end}]`, addresses or symbols; the rest is `(other)`), else by symbol (the default when symbols are loaded: an address belongs to the symbol before it, at most `maxSymbolSize` bytes away, default 4096), else by 256-byte blocks named `segment:address` (`F9:6000-60FF`). `frames: 0` only starts it: `ep.profileEnd(opts)` returns it. |
| `ep.waitCycles()` | The wait states among `ep.cycles()` since power on |

The cycle counts include the wait states: TVC video memory (the CPU waits for the video
chip's memory slot when it accesses pages FCh–FFh; I/O has no wait), Enterprise video
memory and the wait states set in port BFh.

Frames: `runFrames` runs 20 ms of emulated time per frame (TVC: 62 500 cycles at
3.125 MHz; Enterprise: 80 000 at 4 MHz). That is not the video frame: the TVC's CRTC as
set by its ROM makes 314 lines of 200 cycles (64 µs) = 62 800 cycles, about 49.76 Hz
(`ep.beam().frameLines` / `frameCycles` show it; a reading can be a few cycles off, as
it is taken at an instruction boundary). The Enterprise's NICK frame is 312 lines of
about 256 cycles (≈ 79 940). So the video frame drifts against `runFrames`' 20 ms by
about 300 cycles per frame on the TVC; to act at a given point of the picture, use
`ep.beam()` or a raster breakpoint rather than counting `runFrames`.

## State

| Function | Description |
| --- | --- |
| `ep.snapshot()` | The whole machine state (with the TVC256k++ / 2dfx cards): `{machine, slots, fx, time, bytes, card, timing, timingVars}` (`timing`: the cycle counter and the beam; `timingVars`: the emulator's time left over from the last frame) |
| `ep.restore(state)` | Restores a `snapshot()` (switching machine and cards if needed). Releases all keys and pending presses. The same `runFrames` calls with the same keys after the same snapshot give the same memory, registers and cycle count. |

## Recipes

Measure a routine exactly, repeatably (TVC, machine code POKEd at 6000h):

```js
await ep.machine('tvc64-12');
ep.manual(true);
// 6000 LD HL,7000 / LD B,0 / XOR A / 6006 LD (HL),A / INC L / DJNZ 6006 / 600A JP 6000
[0x21,0,0x70, 6,0, 0xAF, 0x77, 0x2C, 0x10,0xFC, 0xC3,0,0x60].forEach((v, i) => ep.poke(0x6000 + i, v));
ep.loadSym('START: EQU 0x00006000\nLOOP: EQU 0x00006006\nDONE: EQU 0x0000600A\n');
ep.pause(); ep.runFrames(1);                 // stops at the next instruction
ep.setReg('PC', ep.sym('START')); ep.cont();
ep.measure({ start: 'START', stop: 'DONE', frames: 5, excludeIrq: true });
// → { count: 45, avg: 6160, min: 6160, max: 6160, … }  (10 + 7 + 4 + 255 × 24 + 19)
ep.measure({ start: 'LOOP', frames: 1 }).min;   // 24: one iteration
```

Repeatable input (a game, a test):

```js
const s = ep.snapshot();
const run = () => {
  ep.restore(s);
  ep.runFrames(100, { perFrame: (i) => (i < 20 ? ['Joy1Right'] : i < 25 ? { joy1: ['up', 'fire'] } : []) });
  return [ep.cycles(), ep.read(0, 65536)];
};
// run() gives the same cycles and memory every time
```

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
  while paused or stopped in the debugger; in manual mode they run it themselves).
- Local paths (`ep.load('/home/me/game.cas')`, `ep.loadSym('C:\\src\\game.sym')`) work only
  through the MCP server (`mcp/server.js`, its tools and its `eval_js`); elsewhere the page
  cannot read local files and says so in the error. Pass the contents instead:
  `ep.load([{name, bytes}])`, `ep.loadSym(text)`.
- After a debugger stop inside a frame, the rest of that frame's time runs first when the
  machine continues.
- Typing goes through the emulated keyboard; the page types faster than real time.
- Esc leaves the browser's full screen; the page's own shortcuts (F9–F12, Alt+…) are
  listed in the help (Súgó / Help menu).
- The page's language: `localStorage['ep128web.lang']` = `hu`, `en`, `de` or `uk`.
