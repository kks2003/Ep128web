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

/* FatFS: only the USB pendrive uses it, which is not emulated (no USB
 * devices are reported, so copy_dir_to_psram() stops before using these) */
#define AM_DIR 0x10
typedef struct { int dummy; } DIR;
typedef struct { int dummy; } FIL;
typedef struct { uint32_t fsize; uint8_t fattrib; char fname[256]; } FILINFO;
static inline FRESULT f_opendir(DIR *d, const char *p) { (void) d; (void) p; return FR_NOT_READY; }
static inline FRESULT f_readdir(DIR *d, FILINFO *f) { (void) d; (void) f; return FR_NOT_READY; }
static inline FRESULT f_closedir(DIR *d) { (void) d; return FR_OK; }
static inline FRESULT f_open(FIL *f, const char *p, uint8_t m) { (void) f; (void) p; (void) m; return FR_NOT_READY; }
static inline FRESULT f_read(FIL *f, void *b, unsigned int n, unsigned int *r) { (void) f; (void) b; (void) n; *r = 0; return FR_NOT_READY; }
static inline FRESULT f_close(FIL *f) { (void) f; return FR_OK; }

/* drives: the PSRAM and flash drives run the card's littlefs code
 * (tvc256kpp_fs.cpp), the USB pendrive and DSK drive report "not ready" */
#define CARD_DRIVE_OPS(X) \
  X(file_open) X(file_close) X(file_read) X(file_write) X(dir_open) \
  X(dir_close) X(dir_read) X(file_write_source) X(file_read_dest) \
  X(file_seek) X(getcwd) X(chdir) X(mkdir) X(delete) X(rename) X(getstat) \
  X(sync) X(mount_dsk) X(unmount_dsk)
#define CARD_LFS_DECL(op) uint8_t tvc_lfs_psram_##op(void); uint8_t tvc_lfs_flash_##op(void);
CARD_DRIVE_OPS(CARD_LFS_DECL)
#undef CARD_LFS_DECL
#define CARD_FATFS_OPS(X) \
  X(open_file) X(close_file) X(read_file) X(write_file) X(open_dir) \
  X(close_dir) X(read_dir) X(write_file_source) X(read_file_dest) \
  X(file_seek) X(getcwd) X(chdir) X(mkdir) X(delete) X(rename) X(getstat) \
  X(sync) X(mount_dsk) X(unmount_dsk)
#define CARD_FATFS_STUB(op) \
  static inline FRESULT tvc_fatfs_pendrive_##op(void) { return FR_NOT_READY; } \
  static inline FRESULT tvc_fatfs_dskdrive_##op(void) { return FR_NOT_READY; }
CARD_FATFS_OPS(CARD_FATFS_STUB)
#undef CARD_FATFS_STUB

extern lfs_t lfs_psram;
extern bool psram_drive_initialized;
extern uint32_t free_psram_start;
int psram_drive_init(uint32_t num_of_blocks);
void str_tolower(char *str);

#ifdef __cplusplus
}
#endif

#endif
