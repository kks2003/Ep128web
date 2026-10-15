// File system side of the TVC256k++ card emulation. See tvc256kpp_fs.hpp.
// SPDX-License-Identifier: GPL-2.0-or-later

#include "tvc256kpp_fs.hpp"
#include "card/card_shim.h"
#include "card/tvc-lfs.h"
#include <vector>
#include <cstring>
#include <strings.h>

extern "C" {
uint8_t TVC_ROM[0x2000];
uint8_t TVC_RAM[0x40000];
uint8_t *psram_array = 0;
uint32_t psram_size_mb = 8;

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
  return psramDrive.ok;
}

void resetPsramDrive()
{
  if (psramDrive.ok)
    lfs_unmount(&psramDrive.lfs);
  psramDrive.ok = false;
  std::strcpy(psramDrive.wd, "/");
  TVC_ROM[0x1824] = 0;
}

uint8_t mscCommand(uint8_t cmd, uint8_t *ioRam)
{
  std::memcpy(&TVC_ROM[0x1800], ioRam, 0x800);
  const uint8_t drive = TVC_ROM[0x1810];
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
  std::memcpy(ioRam, &TVC_ROM[0x1800], 0x800);
  return (fres == FR_OK) ? 0 : uint8_t(fres | 0x80);
}

uint32_t stat(int which)
{
  return which == 0 ? statOpens : (which == 1 ? statReadBytes : 0);
}

}   // namespace TVC256kppFS
