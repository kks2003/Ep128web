# Build, regression and trace replay

The source module is intentionally self-contained. The tests exercise both Enterprise and TVC profiles, but **are not physical board golden-image certification or live ep128emu integration**.

```sh
cmake -S . -B build-gcc -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_FLAGS='-Wall -Wextra -Wpedantic -Werror'
cmake --build build-gcc --parallel
ctest --test-dir build-gcc --output-on-failure
```

For Clang, set `-DCMAKE_C_COMPILER=clang -DCMAKE_CXX_COMPILER=clang++` and build to a separate directory. For ASan/UBSan, use Clang `-fsanitize=address,undefined -fno-omit-frame-pointer` consistently at compile/link time and run the relevant tests. The long multi-phase animation regressions can take substantially longer under sanitizers; an interrupted run should **not** be reported as passing.

CTest covers command parser/status, ZIP/ZX1/resource conversion, 2D primitives, SPB/sprites/collisions, raster IRQ, 3D mesh/camera, built-in logo and SHOW_FW, all 23 egg IDs in both supported profiles as applicable, snapshot CRC/invariants, 400-frame tunnel mode cycling, standalone C++ adapter, and text traces. Some tests deliberately expect trace rejection (`WILL_FAIL`).

The trace interpreter lives in `tools/trace_runner.c`; reusable text fixtures live in `tests/fixtures/`. Add physical-device comparison traces there after capture. The module **does not** include hardware-specific timing code. Device snapshots are described exclusively in `docs/SNAPSHOT_FORMAT.md`.

To verify production source is independent of the harness, compile the five C99 sources named in `docs/INTEGRATION.md` without enabling `TWODFX_BUILD_TESTS`. All production-required content must remain under `src/`.
