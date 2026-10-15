/* Declarations that the vendored tvc-routines.c needs instead of the Pico SDK,
 * FatFS, USB and drive headers. Part of Ep128web, GPL-2.0-or-later. */
#ifndef CARD_ROUTINES_SHIM_H
#define CARD_ROUTINES_SHIM_H

#include "card_shim.h"
#include "tvc-card.h"
#include <math.h>
#ifndef M_TWOPI
#define M_TWOPI (M_PI * 2.0)
#endif

#ifdef __cplusplus
extern "C" {
#endif

/* MSC commands (TVC-IO-main-sys.h) */
typedef enum {
  MSC_FOPENFILE = 0x01, MSC_FCLOSEFILE, MSC_FREAD, MSC_FWRITE, MSC_FOPENDIR,
  MSC_FCLOSEDIR, MSC_FREADDIR, MSC_FWRITE_SRC, MSC_FREAD_DEST, MSC_FSEEK,
  MSC_FGETCWD, MSC_FCHDIR, MSC_FMKDIR, MSC_FDELETE, MSC_FRENAME, MSC_FSTAT,
  MSC_FSYNC, MSC_MOUNT_DSK, MSC_UMOUNT_DSK, MSC_CHDRIVE
} msc_command_t;

/* drives: the PSRAM and flash drives run the card's littlefs code
 * (tvc256kpp_fs.cpp) */
#define CARD_DRIVE_OPS(X) \
  X(file_open) X(file_close) X(file_read) X(file_write) X(dir_open) \
  X(dir_close) X(dir_read) X(file_write_source) X(file_read_dest) \
  X(file_seek) X(getcwd) X(chdir) X(mkdir) X(delete) X(rename) X(getstat) \
  X(sync) X(mount_dsk) X(unmount_dsk)
#define CARD_LFS_DECL(op) uint8_t tvc_lfs_psram_##op(void); uint8_t tvc_lfs_flash_##op(void);
CARD_DRIVE_OPS(CARD_LFS_DECL)
#undef CARD_LFS_DECL
/* USB pendrive and DSK drive: the firmware's FatFS code (tvc-fatfs.c) */
#include "tvc-fatfs-pendrive.h"
#include "tvc-fatfs-dskdrive.h"

extern lfs_t lfs_psram;
extern bool psram_drive_initialized;
extern uint32_t free_psram_start;
int psram_drive_init(uint32_t num_of_blocks);
void str_tolower(char *str);

#ifdef __cplusplus
}
#endif

#endif
