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

CFLAGS="-O3 -fexceptions -DHAVE_STDINT_H -DZ80_ENABLE_CMOS -DCPC_LSB_FIRST=1 -DENABLE_SDEXT -Iweb/stubs -Iweb/src -Iweb/src/twodfx/include -I$E/src -I$E/z80 -I$E"
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
  web/src/card/tvc-graphics.c
  web/src/card/tvc-routines.c
  web/src/card/tvc-io-regs.c
  web/src/card/tvc-card-data.c
  web/src/card/zx7Compress.c
  web/src/card/tvc-sid.c
  web/src/card/tvc-sound-emu.c
  web/src/card/tvc-fatfs.c
  web/src/card/tvc-fatfs-pendrive.c
  web/src/card/tvc-fatfs-dskdrive.c
  web/src/card/diskio-emu.c
  web/src/card/fatfs/ff.c
  web/src/card/fatfs/ffunicode.c
  web/src/card/littlefs/lfs.c
  web/src/card/littlefs/lfs_util.c
  web/src/twodfx/core/twodfx_emu.c
  web/src/twodfx/core/twodfx_raster.c
  web/src/twodfx/core/twodfx_3d.c
  web/src/twodfx/assets/logo_2dfx_asset.c
  web/src/twodfx/firmware_eggs/firmware_page.c
  $(ls web/src/twodfx/firmware_eggs/egg_*.c)
  web/src/twodfx_bridge.cpp
  web/src/soundio_web.cpp
  web/src/sndfile_wav.cpp
  web/src/main.cpp
"

# an object is rebuilt when its source or one of the headers it includes
# (listed by the compiler in $obj.d) is newer
needs_build() {
  [ -f "$obj" ] && [ -f "$obj.d" ] && [ ! "$src" -nt "$obj" ] || return 0
  for dep in $(sed -e 's/\\$//' -e 's/^[^:]*://' "$obj.d"); do
    [ "$dep" -nt "$obj" ] && return 0
  done
  return 1
}

OBJS=""
for src in $SOURCES; do
  obj="$OBJDIR/$(echo "$src" | tr '/' '_' | sed -E 's/\.(cpp|c)$/.o/')"
  OBJS="$OBJS $obj"
  if needs_build; then
    echo "CXX $src"
    case "$src" in
      web/src/card/*.c|web/src/card/*/*.c) emcc -O3 -w -DHAVE_STDINT_H -DLFS_NO_ASSERT -Iweb/src -MMD -MF "$obj.d" -c "$src" -o "$obj" ;;  # vendored C code
      web/src/twodfx/*/*.c) emcc -O3 -std=c99 -w -Iweb/src/twodfx/include -Iweb/src/twodfx/core -Iweb/src/twodfx/assets -Iweb/src/twodfx/firmware_eggs -Iweb/src/twodfx/firmware_eggs/portable -MMD -MF "$obj.d" -c "$src" -o "$obj" ;;  # 2dfx module (MIT)
      *) em++ $CFLAGS -MMD -MF "$obj.d" -c "$src" -o "$obj" ;;
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
# build id in the page header (time of the build, commit), also used to make
# browsers load the new scripts and .wasm after an update
BUILD_TIME=$(TZ=Europe/Budapest date '+%Y.%m.%d %H:%M')
BUILD_SHA=$(echo "${BUILD_COMMIT:-$(git rev-parse HEAD 2>/dev/null || echo dev)}" | cut -c1-7)
BUILD_V=$(TZ=UTC date '+%Y%m%d%H%M')-$BUILD_SHA
sed -i -e "s|__BUILD__|$BUILD_TIME · $BUILD_SHA|" -e "s|__BUILD_V__|$BUILD_V|g" dist/index.html
echo "$BUILD_TIME · $BUILD_SHA" > dist/build.txt
mkdir -p dist/catalog
cp web/catalog/* dist/catalog/ 2>/dev/null || true
cp "$E/roms/epfileio.rom" "$E/roms/tvcfileio.rom" dist/
echo "Done: dist/"
