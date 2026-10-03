#!/bin/sh
# Builds the WebAssembly version of ep128emu into ./dist
# Requires the Emscripten SDK (emcc) in PATH, e.g.:
#   source /path/to/emsdk/emsdk_env.sh && ./build.sh
set -e
cd "$(dirname "$0")"

if [ ! -f ep128emu/src/ep128vm.cpp ]; then
  git submodule update --init
fi

E=ep128emu
OBJDIR=build/obj
mkdir -p "$OBJDIR" dist

CFLAGS="-O3 -fexceptions -DHAVE_STDINT_H -DZ80_ENABLE_CMOS -DCPC_LSB_FIRST=1 -Iweb/stubs -I$E/src -I$E/z80 -I$E"
CFLAGS="$CFLAGS -Wno-deprecated-declarations -Wno-unused-parameter"

SOURCES="
  $E/src/bplist.cpp
  $E/src/compress.cpp
  $E/src/comprlib.cpp
  $E/src/debuglib.cpp
  $E/src/decompm2.cpp
  $E/src/display.cpp
  $E/src/fileio.cpp
  $E/src/snd_conv.cpp
  $E/src/system.cpp
  $E/src/tape.cpp
  $E/src/videorec.cpp
  $E/src/vm.cpp
  $E/src/wd177x.cpp
  $E/src/ep_fdd.cpp
  $E/src/dave.cpp
  $E/src/ep128vm.cpp
  $E/src/ioports.cpp
  $E/src/memory.cpp
  $E/src/nick.cpp
  $E/src/epmemcfg.cpp
  $E/src/ide.cpp
  $E/src/snapshot.cpp
  $E/z80/z80.cpp
  $E/z80/z80funcs2.cpp
  web/src/soundio_web.cpp
  web/src/sndfile_wav.cpp
  web/src/main.cpp
"

OBJS=""
for src in $SOURCES; do
  obj="$OBJDIR/$(echo "$src" | tr '/' '_' | sed 's/\.cpp$/.o/')"
  OBJS="$OBJS $obj"
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    echo "CXX $src"
    em++ $CFLAGS -c "$src" -o "$obj"
  fi
done

echo "LINK dist/ep128emu.js"
em++ -O3 $OBJS -o dist/ep128emu.js \
  -sMODULARIZE=1 -sEXPORT_NAME=createEp128Module \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB \
  -sDISABLE_EXCEPTION_CATCHING=0 \
  -sEXPORTED_RUNTIME_METHODS=FS,ccall,cwrap,UTF8ToString,HEAPU8,HEAPU32,HEAPF32 \
  -sENVIRONMENT=web,node -sINVOKE_RUN=1 -sEXIT_RUNTIME=0 \
  -lidbfs.js

cp web/shell/* dist/
cp "$E/roms/epfileio.rom" dist/epfileio.rom
echo "Done: dist/"
