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

# Apply local patches if any
if [ -d patches ]; then
  for p in patches/*.patch; do
    if [ -f "$p" ]; then
      if git -C "$E" apply --check "../$p" >/dev/null 2>&1; then
        echo "Applying patch: $p"
        git -C "$E" apply "../$p"
      fi
    fi
  done
fi

OBJDIR=build/obj
mkdir -p "$OBJDIR" dist

CFLAGS="-O3 -fexceptions -DHAVE_STDINT_H -DZ80_ENABLE_CMOS -DCPC_LSB_FIRST=1 -DENABLE_SDEXT -Iweb/stubs -Iweb/src -I$E/src -I$E/z80 -I$E"
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
  $E/src/tvc64vm.cpp
  $E/src/tvcmem.cpp
  $E/src/tvcvideo.cpp
  $E/src/tvc_snap.cpp
  $E/src/crtc6845.cpp
  $E/src/sdext.cpp
  $E/z80/z80.cpp
  $E/z80/z80funcs2.cpp
  web/src/emu76489.c
  web/src/opl3.c
  web/src/tvc_soundcards.cpp
  web/src/tvc256kpp.cpp
  web/src/tvc256kpp_rom.cpp
  web/src/tvc256kpp_fs.cpp
  web/src/card/tvc-lfs.c
  web/src/card/littlefs/lfs.c
  web/src/card/littlefs/lfs_util.c
  web/src/soundio_web.cpp
  web/src/sndfile_wav.cpp
  web/src/main.cpp
"

OBJS=""
for src in $SOURCES; do
  obj="$OBJDIR/$(echo "$src" | tr '/' '_' | sed -E 's/\.(cpp|c)$/.o/')"
  OBJS="$OBJS $obj"
  if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
    echo "CXX $src"
    case "$src" in
      web/src/card/*.c|web/src/card/*/*.c) emcc -O3 -w -DHAVE_STDINT_H -Iweb/src -c "$src" -o "$obj" ;;  # vendored C code
      *) em++ $CFLAGS -c "$src" -o "$obj" ;;
    esac
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
mkdir -p dist/catalog
cp web/catalog/* dist/catalog/ 2>/dev/null || true
cp "$E/roms/epfileio.rom" "$E/roms/tvcfileio.rom" dist/
echo "Done: dist/"
