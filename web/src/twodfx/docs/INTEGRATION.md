# ep128emu integration contract

**For Zoltán Balogh and Károly Kiss equally.** Integrate the same portable C99 library into Enterprise and/or TVC VM code; no 2dfx internals need to be reimplemented. Maintain existing TVC256+++ pathways independently.

## Compile and link

All required production files live in `src/`. Add these C99 translation units to your VM build:

```text
src/core/twodfx_emu.c
src/core/twodfx_raster.c
src/core/twodfx_3d.c
src/core/twodfx_firmware_page.c
src/assets/logo_2dfx_asset.c
```

Search paths: `src/include`, `src/core`, `src/assets` (the implementation uses relative includes under `src/eggs` and `src/assets/eggs`). Link the C math library where required. Alternatively use the root CMake project and link `twodfx_emu`; as a subproject it does not build tests by default.

Use `src/include/twodfx_emu.h` directly from C or the C++11 header-only `src/adapter/ep128emu_twodfx_adapter.hpp`. This adapter deliberately has **no ep128emu header dependencies** and no separate compilation unit.

## VM events and connections

| Event / wire | Function / integration rule |
|---|---|
| Create peripheral | `twodfx_emu_create(TWODFX_EMU_ENTERPRISE)` or `TWODFX_EMU_TVC`; `destroy` on teardown |
| Physical peripheral power cycle | `twodfx_emu_power_cycle()`; distinguish from a guest Z80 soft reset |
| Z80 OUT `F8h` | `twodfx_emu_write_f8()`; preserve byte order |
| Z80 OUT `F9h` | `twodfx_emu_write_f9()`; preserve byte order |
| Z80 IN `F8h` | `twodfx_emu_read_f8()` (active-low status) |
| Z80 IN `F9h` | Not a 2dfx data-return port; retain correct bus/default behavior |
| Every physical video VSYNC | `twodfx_emu_vsync()` **50 times per second**, including in logical 25-fps mode |
| Every video scanline | `twodfx_emu_hsync(device, raw_scanline)` with physical raw index, not viewport-local Y |
| IRQ level | `twodfx_emu_irq_asserted()`; combine logically with other VM interrupt sources, never erase unrelated IRQs |
| Overlay | `twodfx_emu_overlay_raw_line()` for raw scanout coords (or `twodfx_emu_overlay_line()` for framebuffer-local); returns 4-bit colour indices and coverage masks |
| Save/load VM state | `twodfx_emu_snapshot_size/save_snapshot/load_snapshot`, as a distinct version-13 device chunk; recompute combined IRQ after restore |

### Video and coordinates

Colours are **indices** 0–15 and coverage is 0/1, not RGB pixels. The host must integrate indices/coverage into its **NICK (Enterprise)** or **TVC** palette and scanout path, observing `OFF`, `NORMAL` (transparent key) and `FORCED` (overlay covers even transparent-colour indices). Composition precedes final RGB/display conversion.

`overlay_line` uses device framebuffer-local origin; Enterprise local (0,0) = raw (88,16), TVC local (0,0) = raw (0,41). The raw-line helper clips as needed. Consult API macros for the implementation's stored bitmap sizes. The host is responsible for accurately mapping the visible region and preserving other expansion overlays.

Rendering is **enabled on creation/reset by default**. `twodfx_emu_set_render_enabled()` is a diagnostic switch only, not an activation step for a real VM.

### VM integration hints

In the provided ep128emu TVC VM source, the existing 2dfx F8/F9 dispatch and `combineLine2dfx` live in the **TVC 2dfx path** alongside older SpriteExt logic; route only the 2dfx selection to this module. Do **not** replace the TVC256+++ implementation. Enterprise requires its own F8/F9 routing, NICK line compositing, profile and IRQ participation. Keep the video line's ep128emu-native format conversions inside the VM-specific bridge.

The integrator decides lifetime and host reset semantics. A guest soft reset is not necessarily a physical 2dfx power cycle. Do not unconditionally reset device state on CPU soft reset.

### State and status

Use `docs/SNAPSHOT_FORMAT.md` for the canonical snapshot v13 contract. A previous v12 state is **not loadable**; report an incompatible state rather than silently losing 2dfx data. The protocol header offers state inspection for diagnostics; do not bypass the normal F8/F9 bus to implement guest writes.

**No device-specific CPU cycle clock, PIO/DMA, dual-core scheduling, private firmware resources or wall-clock render-overrun simulation is required or allowed.** IRQ, scene and collision behavior is frame logical; do not synthesize hardware performance counters.

## Example lifecycle (C++)

```cpp
#include "ep128emu_twodfx_adapter.hpp"
Ep128emuTwoDfxAdapter fx(TWODFX_EMU_ENTERPRISE);
// VM OUT F8/F9 -> fx.writePort(port, byte)
// VM IN F8     -> fx.readPort(port)
// each VSYNC   -> fx.videoVSync()
// every HSYNC  -> fx.videoHSync(rawScanline)
// IRQ OR       -> hostIRQ || fx.wantsInterrupt()
// scanout      -> fx.readOverlayRawLine(rawX, rawY, indices, mask, width)
// state chunk  -> fx.saveSnapshot(), fx.loadSnapshot()
```

There is no tested patch against either developer's current ep128emu branch in this package; each VM owns these integration hooks. The entire device implementation resides in `src/`.
