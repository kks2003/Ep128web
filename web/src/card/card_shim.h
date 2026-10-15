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

/* FatFS result codes (ff.h), as used by the card firmware */
typedef enum {
  FR_OK = 0, FR_DISK_ERR, FR_INT_ERR, FR_NOT_READY, FR_NO_FILE, FR_NO_PATH,
  FR_INVALID_NAME, FR_DENIED, FR_EXIST, FR_INVALID_OBJECT, FR_WRITE_PROTECTED,
  FR_INVALID_DRIVE, FR_NOT_ENABLED, FR_NO_FILESYSTEM, FR_MKFS_ABORTED,
  FR_TIMEOUT, FR_LOCKED, FR_NOT_ENOUGH_CORE, FR_TOO_MANY_OPEN_FILES,
  FR_INVALID_PARAMETER
} FRESULT;

/* FatFS open mode flags (ff.h) */
#define FA_READ          0x01
#define FA_WRITE         0x02
#define FA_OPEN_EXISTING 0x00
#define FA_CREATE_NEW    0x04
#define FA_CREATE_ALWAYS 0x08
#define FA_OPEN_ALWAYS   0x10
#define FA_OPEN_APPEND   0x30
#ifndef MIN
#define MIN(a, b) (((a) < (b)) ? (a) : (b))
#endif

/* The card's 8 kB IO ROM area ($C000-$DFFF; the last 2 kB is RAM that
 * carries the file operation parameters at 0x1900 / 0x1a00) and fast RAM. */
extern uint8_t TVC_ROM[0x2000];
extern uint8_t TVC_RAM[0x40000];
extern uint8_t *psram_array;
extern uint32_t psram_size_mb;
static inline uint32_t psram_size(void) { return psram_size_mb; }

#ifdef __cplusplus
}
#endif

#endif
