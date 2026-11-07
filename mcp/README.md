# ep128web-mcp – MCP server for the Ep128web emulator

An [MCP](https://modelcontextprotocol.io) server that lets AI agents (Claude Desktop,
Claude Code and other MCP clients) run and debug the Enterprise 128/64 and Videoton TVC
emulator: start a machine, load programs, type, read the screen as text, take
screenshots, run a fixed number of frames, read and write memory, disassemble, set
breakpoints and watchpoints, step, run ep128emu monitor commands and save / restore the
machine state.

It opens the [Ep128web](https://kks2003.github.io/Ep128web/) page in a browser in the
background (Playwright, Chromium) and drives its automation API (`window.ep`, see
[../docs/AUTOMATION.md](../docs/AUTOMATION.md)).

## Install

Needs Node.js 18 or newer.

```sh
git clone https://github.com/kks2003/Ep128web.git
cd Ep128web/mcp
npm install
npx playwright install chromium
```

The emulator needs the machines' ROMs: download **ep128emu_roms-2.0.11.bin**
([enterpriseforever.com](https://enterpriseforever.com/letoltesek-downloads/egyeb-misc/msg61025/)
or [ep128.hu](http://ep128.hu/Emu/ep128emu_roms-2.0.11.bin)) and give its path in
`EP128WEB_ROMS`. It is loaded once into the server's browser profile.

## Add it to an MCP client

**Claude Code:**

```sh
claude mcp add ep128web -e EP128WEB_ROMS=/path/to/ep128emu_roms-2.0.11.bin -- node /path/to/Ep128web/mcp/server.js
```

**Claude Desktop** (`claude_desktop_config.json`; Windows paths with `\\`):

```json
{
  "mcpServers": {
    "ep128web": {
      "command": "node",
      "args": ["/path/to/Ep128web/mcp/server.js"],
      "env": { "EP128WEB_ROMS": "/path/to/ep128emu_roms-2.0.11.bin" }
    }
  }
}
```

Other clients: run `node server.js` as a stdio MCP server.

## Settings (environment variables)

| Variable | Default | |
| --- | --- | --- |
| `EP128WEB_ROMS` | – | Path of `ep128emu_roms-2.0.11.bin`, loaded if the profile has no ROMs yet |
| `EP128WEB_URL` | `https://kks2003.github.io/Ep128web/` | The emulator page (e.g. a local build or a PR preview) |
| `EP128WEB_HEADLESS` | `1` | `0` shows the browser window, to watch the agent work |
| `EP128WEB_PROFILE` | `~/.ep128web-mcp` | Browser profile: keeps the ROMs, disks and settings between runs |
| `EP128WEB_CHROMIUM` | Playwright's Chromium | Path of another Chromium / Chrome executable |
| `EP128WEB_MANUAL` | `1` | Manual mode: the machine runs only while a tool runs it, so results are repeatable; set again after every page load (`emulator_start` with `reload`) and checked before every call (`manual_mode` changes it). `0`: it runs in real time between the calls |

## Tools

| Tool | |
| --- | --- |
| `emulator_start` | Opens the page and waits for the BASIC prompt; optional `machine` |
| `list_machines`, `set_machine` | Machines; switch with a cold start (TVC `slots`, 2dfx `fx`) |
| `load_file` | A local path or URL: programs start by themselves, tapes, disks, snapshots, ROMs |
| `type_text`, `press_key` | Typing (`\n` = Enter) and holding a key; returns the screen text |
| `key_down`, `key_up` | Hold / release keys and joystick directions (`Joy1Fire`…) across calls |
| `screen_text`, `wait_text`, `screenshot` | The screen as text (and whether BASIC waits), waiting for text, PNG |
| `run_frames` | n frames of 20 ms at once (repeatable timing), optionally with `keys` held |
| `manual_mode` | Manual mode on / off |
| `state` | Machine, running / stopped, time, CPU cycles, beam position, registers, I/O registers (CRTC, paging…), held keys, stop reason |
| `measure` | Exact Z80 cycles between two addresses or symbols (min / avg / max, samples), optionally without the interrupts |
| `load_sym` | Assembler symbols (sjasmplus `--sym`…) from a file or text; names work as addresses everywhere |
| `trace` | Instruction trace (registers, segment, cycle) on / off / dump |
| `read_memory`, `write_memory`, `disassemble` | Memory (CPU, physical, video memory whatever the paging, 2dfx, TVC256k++) and Z80 disassembly |
| `profile` | Where the cycles go: per symbol, 256-byte block or range, with the wait states |
| `pixels` | The picture's pixels: palette index and colour |
| `breakpoint`, `debug_control` | Breakpoints / watchpoints; pause, continue, step, step over, run to |
| `monitor` | ep128emu monitor commands (`?` lists them) |
| `snapshot` | Save / restore the whole state to a JSON file |
| `eval_js` | Any JavaScript with the page's `ep` object (`ep.load` / `ep.loadSym` take local paths here too) |

Example prompts:

- *"Start a TVC, type a BASIC program that prints the first ten squares, run it and check
  the output. Then set a breakpoint at the TVC's system call entry (0030h) and show the
  registers when it stops."*
- *"Load game.cas and game.sym, and measure how many cycles DRAW_SPRITE takes, without
  the interrupts. Then make it faster and measure again."*

## Test

```sh
EP128WEB_ROMS=/path/to/ep128emu_roms-2.0.11.bin npm test
```

`test.js` starts the server with the MCP SDK's client and calls every tool.
