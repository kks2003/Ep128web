# Portable 2dfx behavioural emulator

A single, self-contained C99 2dfx module for **Enterprise** and **TVC** emulation in ep128emu; the same package is intended for **Zoltán Balogh** and **Károly Kiss**.

**Original 2dfx creator:** Károly Vaczkó. **ep128emu creator:** István Varga.

The portable C99/C++ implementation and 2dfx-owned public content are offered under **MIT** (`LICENSE`). Certain authentic *Elite* and *Wriggler* showcase assets are included but **are not covered by MIT**: read `ASSET_LICENSES.md` before redistributing.

## Included

| Location | Contents |
|---|---|
| `src/` | Every code file and asset required to build the portable module, grouped under `core/`, `include/`, `assets/`, `eggs/`, `adapter/`. The 23 egg IDs have individual `.inc` runtime implementations. |
| `docs/INTEGRATION.md` | C and C++ APIs, Enterprise/TVC VM lifecycle, ports, video, IRQ and state hooks. |
| `docs/COMMAND_REFERENCE.md` | Public v1.1.0 command protocol reference. |
| `docs/SNAPSHOT_FORMAT.md` | Single canonical device snapshot **v13** description. |
| `docs/COMPATIBILITY.md` | Feature scope, deliberate exclusions and evidence/limitations. |
| `docs/TESTING.md` | Builds, test cases, trace runner and reproducibility. |
| `tests/`, `tools/` | Optional test programs and fixtures; never compiled into production VM. |
| `LICENSE`, `CREDITS.md`, `ASSET_LICENSES.md` | Terms, origins and credits. |

## Build

```sh
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --parallel
ctest --test-dir build --output-on-failure
```

To embed in a larger CMake project, use `add_subdirectory` and link `twodfx_emu`; test tools are disabled by default when embedded. Non-CMake builds require the **five production `.c` files** listed in `docs/INTEGRATION.md`, headers/assets reachable from `src/`, a C99 compiler and the C math library where applicable. The header-only C++ adapter requires C++11 and the public header.

## Core capability

F8h/F9h bus/session handling, 8 MiB resource RAM, RAW/NICK/TVC conversion and ZX1 uploads, descriptors, sprites and collision state, background/foreground 256-entry 2DPT, raster IRQ, 2D graphics/fonts/patterns, scene and camera frame latching, 10-bit public 3D mesh transforms, engine composition, logo, SHOW_FW and built-in egg command IDs C0–CF, D0–D5 and DF. Normal rendering is **enabled by default**. Device state uses validated, CRC-protected snapshot format **v13**.

A demo's runtime implementation **does not by itself establish pixel-perfect parity** with physical firmware v1.1.0. In particular the specialized D3/D4/D5 choreography and some 2D/egg edge effects remain approximations, as noted in `docs/COMPATIBILITY.md`.

## Host responsibility and scope

The module includes all 2dfx internals; ep128emu maintainers wire **port routing, 50 Hz VSYNC, per-scanline HSYNC, IRQ OR-ing, indexed video composition, VM lifecycle and versioned device-state chunks**. Keep TVC256+++ code independent. Actual integration and hardware-capture comparisons are the VM developers' responsibility.

The emulator intentionally **does not emulate RP2354B execution timing, render-overrun duration or MCU-specific fast paths**; the original hardware firmware is private and is not distributed in this package.

This is a complete **portable source-module handoff** rather than an already integrated ep128emu binary. Software tests validate the module; hardware-pixel identity and live VM integration must be assessed separately.
