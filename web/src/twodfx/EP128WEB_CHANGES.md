# Ep128web changes to the 2dfx 1.1.4 module

The module is the upstream 1.1.4 source tree with the `src/` level removed
(`src/core` → `core`, …); CMakeLists.txt and tests/ are not included.
One local change, in `core/twodfx_emu.c` (so SOURCE_MANIFEST.sha256 no
longer matches that file):

- `twodfx_emu_snapshot_size()` and `twodfx_emu_load_snapshot()` kept a whole
  `twodfx_emu` (~9 MB) on the stack. WebAssembly's stack is 64 KB, so this
  overflowed it and corrupted memory (the browser tab crashed when a quick
  save was loaded). Both now use the heap; the size is computed once.
