# Vendored code of the TVC256k++ card

Copied from https://github.com/dikdom/tvc256kplusplus (`sources/firmware/TVC-IO`),
so that the card's file operations behave exactly like the real firmware:

- `tvc-lfs.c`, `tvc-lfs.h` – the card's littlefs file/directory operations on the
  parameter area of the IO RAM (MIT license, Vass Sándor).
  Changes: includes replaced by `card_shim.h`; file/dir handles are table indexes
  instead of raw pointers (works on 64 bit hosts too); the DSK drive functions are
  stubs (they need FatFS, not emulated yet).
- `littlefs/` – the littlefs library (BSD-3-Clause, see `littlefs/LICENSE.md`).
- `card_shim.h` – minimal FatFS result codes and the globals the code expects
  (written for Ep128web).

The glue to the emulated card is `../tvc256kpp_fs.cpp`.
