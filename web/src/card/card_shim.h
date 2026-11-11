// Minimal replacement for the FatFS / Pico SDK declarations that the vendored
// firmware file tvc-lfs.c needs. Part of Ep128web, GPL-2.0-or-later.
#ifndef CARD_SHIM_H
#define CARD_SHIM_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <string.h>
#include <ctype.h>
#include "littlefs/lfs.h"

#ifdef __cplusplus
extern "C" {
#endif

/* FatFS (the card firmware's version and configuration) */
#include "fatfs/ff.h"

/* Ep128web: the firmware version the card emulates (FW_VERSION_MINOR: 24 or
 * 25, chosen on the page; defined in tvc256kpp.cpp). The code is FW 0.25's,
 * with FW 0.24's behaviour where the two differ (if (!CARD_FW25) ...). */
extern int card_fw_minor;
#define CARD_FW25 (card_fw_minor >= 25)

#ifndef MIN
#define MIN(a, b) (((a) < (b)) ? (a) : (b))
#endif
#ifndef MAX
#define MAX(a, b) (((a) > (b)) ? (a) : (b))
#endif

/* Pico SDK / GCC-on-ARM spellings used by the firmware sources */
typedef unsigned int uint;
#ifndef __unused
#define __unused __attribute__((unused))
#endif
#ifndef __aligned
#define __aligned(n) __attribute__((aligned(n)))
#endif
#define asm(x) ((void) 0)

/* The card's 8 kB IO ROM area ($C000-$DFFF; the last 2 kB is RAM that
 * carries the file operation parameters at 0x1900 / 0x1a00) and fast RAM:
 * 256 kB, followed by the two 16 kB PSRAM windows (pages 16 and 17), as in
 * the firmware. */
#define TVC_RAM_SIZE 0x48000
extern uint8_t TVC_ROM[0x2000];
extern uint8_t TVC_RAM[];
extern uint8_t *psram_array;
extern uint32_t psram_size_mb;
/* as psram.c: the size in bytes */
static inline uint32_t psram_size(void) { return psram_size_mb << 20; }

#ifdef __cplusplus
}
#endif

#endif
