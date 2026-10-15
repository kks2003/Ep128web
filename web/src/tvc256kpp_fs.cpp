// File system side of the TVC256k++ card emulation. See tvc256kpp_fs.hpp.
// SPDX-License-Identifier: GPL-2.0-or-later

#include "tvc256kpp_fs.hpp"
#include "card/card_shim.h"
#include "card/tvc-lfs.h"
#include <vector>
#include <cstring>
#include <strings.h>
#include <string>
#include <cctype>

extern "C" {
uint8_t TVC_ROM[0x2000];
// fast RAM + PSRAM windows; the extra space keeps the firmware routines'
// unchecked addressing (e.g. base registers + offsets) inside the array
uint8_t TVC_RAM[TVC_RAM_SIZE + 0x20000];
uint8_t *psram_array = 0;
uint32_t psram_size_mb = 8;

// PSRAM drive state used by the card's built-in functions (tvc-routines.c)
bool psram_drive_initialized = false;
uint32_t free_psram_start = 0;
// only referenced by copy_dir_to_psram() after USB checks that always fail
lfs_t lfs_psram;
// open file / directory handles of tvc-lfs.c
extern bool lfs_file_in_use[4];
extern bool lfs_dir_in_use[4];

bool ends_with_cas(char *fileName)
{
  if (!fileName)
    return false;
  size_t n = std::strlen(fileName);
  return (n >= 4 && strcasecmp(fileName + n - 4, ".cas") == 0);
}
}

namespace {

const uint32_t kBlockSize = 4096;

struct Drive {
  lfs_t lfs;
  lfs_config cfg;
  bool ok;
  char wd[256];
  Drive() : ok(false) { std::memset(&lfs, 0, sizeof(lfs)); std::memset(&cfg, 0, sizeof(cfg)); wd[0] = '/'; wd[1] = 0; }
};

Drive flashDrive, psramDrive;
uint32_t statOpens = 0, statReadBytes = 0;
std::vector<uint8_t> flashImage;
uint8_t flashReadBuf[256], flashProgBuf[256], flashLookahead[16];
uint8_t psramReadBuf[256], psramProgBuf[256], psramLookahead[16];

int flashRead(const lfs_config *c, lfs_block_t block, lfs_off_t off, void *buf, lfs_size_t size)
{
  if (block >= c->block_count || off >= c->block_size)
    return LFS_ERR_INVAL;
  size_t pos = size_t(block) * c->block_size + off;
  if (pos + size > flashImage.size())
    return LFS_ERR_INVAL;
  std::memcpy(buf, &flashImage[pos], size);
  return 0;
}
int flashProg(const lfs_config *, lfs_block_t, lfs_off_t, const void *, lfs_size_t) { return LFS_ERR_IO; }
int flashErase(const lfs_config *, lfs_block_t) { return LFS_ERR_IO; }
int noSync(const lfs_config *) { return 0; }

int psramRead(const lfs_config *c, lfs_block_t block, lfs_off_t off, void *buf, lfs_size_t size)
{
  if (block >= c->block_count || off >= c->block_size)
    return LFS_ERR_INVAL;
  std::memcpy(buf, psram_array + size_t(block) * c->block_size + off, size);
  return 0;
}
int psramProg(const lfs_config *c, lfs_block_t block, lfs_off_t off, const void *buf, lfs_size_t size)
{
  if (block >= c->block_count || off >= c->block_size)
    return LFS_ERR_INVAL;
  std::memcpy(psram_array + size_t(block) * c->block_size + off, buf, size);
  return 0;
}
int psramErase(const lfs_config *c, lfs_block_t block)
{
  std::memset(psram_array + size_t(block) * c->block_size, 0xFF, c->block_size);
  return 0;
}

void setupConfig(lfs_config &cfg, bool flash, uint32_t blocks)
{
  std::memset(&cfg, 0, sizeof(cfg));
  cfg.read = flash ? flashRead : psramRead;
  cfg.prog = flash ? flashProg : psramProg;
  cfg.erase = flash ? flashErase : psramErase;
  cfg.sync = noSync;
  cfg.read_buffer = flash ? flashReadBuf : psramReadBuf;
  cfg.prog_buffer = flash ? flashProgBuf : psramProgBuf;
  cfg.lookahead_buffer = flash ? flashLookahead : psramLookahead;
  cfg.read_size = 256;
  cfg.prog_size = 256;
  cfg.block_size = kBlockSize;
  cfg.block_count = blocks;
  cfg.cache_size = 256;
  cfg.lookahead_size = 16;
  cfg.block_cycles = 500;
}

}   // namespace

namespace TVC256kppFS {

uint8_t *fastRam() { return TVC_RAM; }

void attachPsram(uint8_t *psram, uint32_t sizeMB)
{
  psram_array = psram;
  psram_size_mb = sizeMB;
}

bool loadFlashImage(const uint8_t *data, size_t size)
{
  if (flashDrive.ok) {
    lfs_unmount(&flashDrive.lfs);
    flashDrive.ok = false;
  }
  if (!data || size < 16 * kBlockSize || (size % kBlockSize) != 0)
    return false;
  flashImage.assign(data, data + size);
  setupConfig(flashDrive.cfg, true, uint32_t(size / kBlockSize));
  flashDrive.ok = (lfs_mount(&flashDrive.lfs, &flashDrive.cfg) >= 0);
  std::strcpy(flashDrive.wd, "/");
  return flashDrive.ok;
}

bool flashValid() { return flashDrive.ok; }

bool formatPsramDrive(uint32_t numBlocks)
{
  resetPsramDrive();
  if (!psram_array || numBlocks < 2 || size_t(numBlocks) * kBlockSize > size_t(psram_size_mb) * 1024 * 1024)
    return false;
  std::memset(psram_array, 0xFF, size_t(numBlocks) * kBlockSize);
  setupConfig(psramDrive.cfg, false, numBlocks);
  if (lfs_format(&psramDrive.lfs, &psramDrive.cfg) < 0)
    return false;
  psramDrive.ok = (lfs_mount(&psramDrive.lfs, &psramDrive.cfg) >= 0);
  std::strcpy(psramDrive.wd, "/");
  TVC_ROM[0x1824] = psramDrive.ok ? 1 : 0;
  psram_drive_initialized = psramDrive.ok;
  if (psramDrive.ok) {
    // tvc-lfs-psram.c: first byte of the PSRAM after the drive
    free_psram_start = (size_t(numBlocks) * kBlockSize < size_t(psram_size_mb) * 1024 * 1024
                        ? numBlocks * kBlockSize : 0x00FFFFFFU);
  }
  return psramDrive.ok;
}

void resetPsramDrive()
{
  if (psramDrive.ok)
    lfs_unmount(&psramDrive.lfs);
  psramDrive.ok = false;
  psram_drive_initialized = false;
  free_psram_start = 0;
  std::strcpy(psramDrive.wd, "/");
  TVC_ROM[0x1824] = 0;
}

void powerOn()
{
  resetPsramDrive();
  for (int i = 0; i < 4; i++) {
    lfs_file_in_use[i] = false;
    lfs_dir_in_use[i] = false;
  }
  if (flashDrive.ok) {
    // remounting forgets the files the TVC left open
    lfs_unmount(&flashDrive.lfs);
    flashDrive.ok = (lfs_mount(&flashDrive.lfs, &flashDrive.cfg) >= 0);
  }
  std::strcpy(flashDrive.wd, "/");
}

bool putPsramFile(const char *name, const uint8_t *data, size_t size)
{
  if (!psramDrive.ok && !formatPsramDrive(1024))
    return false;
  std::string path = "/";
  for (const char *p = name; *p; p++)
    path += char(std::tolower((unsigned char) *p));
  lfs_file_t f;
  if (lfs_file_open(&psramDrive.lfs, &f, path.c_str(),
                    LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC) < 0)
    return false;
  bool ok = (lfs_file_write(&psramDrive.lfs, &f, data, lfs_size_t(size)) == lfs_ssize_t(size));
  ok = (lfs_file_close(&psramDrive.lfs, &f) >= 0) && ok;
  return ok;
}

}   // namespace TVC256kppFS

namespace {

// Runs one drive command on the parameters in TVC_ROM ($D900 / $DA00).
// drive: 0 = USB, 1 = PSRAM, 2 = flash, 3 = DSK
uint8_t driveCommand(uint8_t drive, uint8_t cmd)
{
  if (psramDrive.ok && !psram_drive_initialized) {
    // delete_psram_drive() (built-in function 36) dropped the drive
    lfs_unmount(&psramDrive.lfs);
    psramDrive.ok = false;
    std::strcpy(psramDrive.wd, "/");
  }
  Drive *d = (drive == 1 ? &psramDrive : (drive == 2 ? &flashDrive : (Drive *) 0));
  const bool isFlash = (d == &flashDrive);
  uint8_t fres = 0xFF;
  if (!d || !d->ok) {
    // USB and DSK drives are not emulated; an unformatted PSRAM drive and an
    // unmounted flash drive report the same
    fres = FR_NOT_READY;
  }
  else {
    lfs_t *l = &d->lfs;
    switch (cmd) {
    case 0x01: fres = tvc_lfs_file_open(l, true, d->wd); break;           // MSC_FOPENFILE
    case 0x02: fres = tvc_lfs_file_close(l); break;                       // MSC_FCLOSEFILE
    case 0x03: fres = tvc_lfs_file_read(l); break;                        // MSC_FREAD
    case 0x04: fres = isFlash ? uint8_t(FR_WRITE_PROTECTED) : tvc_lfs_file_write(l); break;
    case 0x05: fres = tvc_lfs_dir_open(l, d->wd); break;                  // MSC_FOPENDIR
    case 0x06: fres = tvc_lfs_dir_close(l); break;
    case 0x07: fres = tvc_lfs_dir_read(l); break;
    case 0x08: fres = isFlash ? uint8_t(LFS_ERR_READONLY_FS) : tvc_lfs_file_write_source(l); break;
    case 0x09: fres = tvc_lfs_file_read_dest(l); break;
    case 0x0A: fres = tvc_lfs_file_seek(l); break;
    case 0x0B: fres = tvc_lfs_getcwd(d->wd); break;
    case 0x0C: fres = tvc_lfs_chdir(l, d->wd); break;
    case 0x0D: fres = isFlash ? uint8_t(LFS_ERR_READONLY_FS) : tvc_lfs_mkdir(l, d->wd); break;
    case 0x0E: fres = isFlash ? uint8_t(LFS_ERR_READONLY_FS) : tvc_lfs_delete(l, d->wd); break;
    case 0x0F: fres = uint8_t(LFS_ERR_READONLY_FS); break;                // rename: not implemented
    case 0x10: fres = tvc_lfs_getstat(l, d->wd); break;
    case 0x11: fres = isFlash ? uint8_t(0) : tvc_lfs_sync(l); break;
    case 0x12: fres = tvc_lfs_mount_dsk(l, isFlash ? 3 : 2); break;
    case 0x13: fres = tvc_lfs_unmount_dsk(); break;
    default: break;
    }
  }
  if (fres == FR_OK && d) {
    if (cmd == 0x01) statOpens++;
    if (cmd == 0x03) statReadBytes += uint32_t(TVC_ROM[0x1a00]) | (uint32_t(TVC_ROM[0x1a01]) << 8);
    if (cmd == 0x09) statReadBytes += uint32_t(TVC_ROM[0x1a04]) | (uint32_t(TVC_ROM[0x1a05]) << 8) | (uint32_t(TVC_ROM[0x1a06]) << 16);
  }
  return fres;
}

}   // namespace

// the drive functions that the card's built-in functions call
#define CARD_LFS_DEF(op, cmd) \
  extern "C" uint8_t tvc_lfs_psram_##op(void) { return driveCommand(1, cmd); } \
  extern "C" uint8_t tvc_lfs_flash_##op(void) { return driveCommand(2, cmd); }
CARD_LFS_DEF(file_open, 0x01)
CARD_LFS_DEF(file_close, 0x02)
CARD_LFS_DEF(file_read, 0x03)
CARD_LFS_DEF(file_write, 0x04)
CARD_LFS_DEF(dir_open, 0x05)
CARD_LFS_DEF(dir_close, 0x06)
CARD_LFS_DEF(dir_read, 0x07)
CARD_LFS_DEF(file_write_source, 0x08)
CARD_LFS_DEF(file_read_dest, 0x09)
CARD_LFS_DEF(file_seek, 0x0A)
CARD_LFS_DEF(getcwd, 0x0B)
CARD_LFS_DEF(chdir, 0x0C)
CARD_LFS_DEF(mkdir, 0x0D)
CARD_LFS_DEF(delete, 0x0E)
CARD_LFS_DEF(rename, 0x0F)
CARD_LFS_DEF(getstat, 0x10)
CARD_LFS_DEF(sync, 0x11)
CARD_LFS_DEF(mount_dsk, 0x12)
CARD_LFS_DEF(unmount_dsk, 0x13)
#undef CARD_LFS_DEF

extern "C" int psram_drive_init(uint32_t num_of_blocks)
{
  return TVC256kppFS::formatPsramDrive(num_of_blocks) ? 0 : -1;
}

namespace TVC256kppFS {

uint8_t mscCommand(uint8_t cmd, uint8_t *ioRam)
{
  if (ioRam != &TVC_ROM[0x1800])
    std::memcpy(&TVC_ROM[0x1800], ioRam, 0x800);
  uint8_t fres = driveCommand(TVC_ROM[0x1810], cmd);
  if (ioRam != &TVC_ROM[0x1800])
    std::memcpy(ioRam, &TVC_ROM[0x1800], 0x800);
  return (fres == FR_OK) ? 0 : uint8_t(fres | 0x80);
}

uint32_t stat(int which)
{
  return which == 0 ? statOpens : (which == 1 ? statReadBytes : 0);
}

}   // namespace TVC256kppFS
