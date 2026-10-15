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
#include <cstdio>

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
// the PSRAM drive's littlefs (also used by copy_dir_to_psram())
lfs_t lfs_psram;
// open file / directory handles of tvc-lfs.c
extern bool lfs_file_in_use[4];
extern bool lfs_dir_in_use[4];

// USB pendrive and DSK drive (tvc-fatfs.c, diskio-emu.c)
extern uint8_t dsk_file_type;
extern uint8_t registerInitializedUSBDevices;
extern uint8_t *card_usb_image;
extern uint32_t card_usb_sectors;
extern bool availableFileHandles[4];
extern bool availableDirHandles[4];
extern uint8_t activeDrive;
}
extern "C" {
#include "card/tvc-fatfs-pendrive.h"
#include "card/tvc-fatfs-dskdrive.h"
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
FATFS usbFatFs;                         // the pendrive's volume ("0:")
std::vector<uint8_t> usbSectors;        // the pendrive's sectors
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
  if (lfs_format(&lfs_psram, &psramDrive.cfg) < 0)
    return false;
  psramDrive.ok = (lfs_mount(&lfs_psram, &psramDrive.cfg) >= 0);
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
    lfs_unmount(&lfs_psram);
  psramDrive.ok = false;
  psram_drive_initialized = false;
  free_psram_start = 0;
  std::strcpy(psramDrive.wd, "/");
  TVC_ROM[0x1824] = 0;
}

void powerOn()
{
  // the firmware reboots: the .dsk image is not mounted any more, FatFS
  // forgets the open files, the pendrive is mounted again
  dsk_file_type = 0;
  for (int i = 0; i < 4; i++) {
    availableFileHandles[i] = true;
    availableDirHandles[i] = true;
  }
  f_unmount("1:");
  if (card_usb_image) {
    f_mount(&usbFatFs, "0:", 1);
    f_chdrive("0:");
  }
  activeDrive = 0;
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

bool usbAttach(uint32_t sizeMB)
{
  usbDetach();
  if (sizeMB < 1 || sizeMB > 512)
    return false;
  usbSectors.assign(size_t(sizeMB) << 20, 0);
  card_usb_image = &usbSectors[0];
  card_usb_sectors = uint32_t(usbSectors.size() / 512);
  static uint8_t work[4096];
  MKFS_PARM opt = { FM_FAT | FM_SFD, 0, 0, 0, 0 };
  if (f_mkfs("0:", &opt, work, sizeof(work)) != FR_OK
      || f_mount(&usbFatFs, "0:", 1) != FR_OK) {
    usbDetach();
    return false;
  }
  f_chdrive("0:");
  registerInitializedUSBDevices |= 0x02;    // tvc-usb.c tuh_msc_mount_cb()
  return true;
}

void usbDetach()
{
  if (card_usb_image)
    f_mount(0, "0:", 0);
  card_usb_image = 0;
  card_usb_sectors = 0;
  usbSectors.clear();
  registerInitializedUSBDevices &= uint8_t(~0x02);
}

bool usbPresent() { return card_usb_image != 0; }

const uint8_t *usbImage(size_t &size)
{
  size = usbSectors.size();
  return card_usb_image;
}

static std::string usbPath(const char *path)
{
  std::string p = path ? path : "";
  while (!p.empty() && p[0] == '/')
    p.erase(0, 1);
  return "0:/" + p;
}

bool usbMkdirs(const char *path)
{
  if (!card_usb_image)
    return false;
  std::string p = usbPath(path);
  // create every directory of the path (existing ones are fine)
  for (size_t i = 3; i <= p.size(); i++) {
    if (i == p.size() || p[i] == '/') {
      std::string d = p.substr(0, i);
      if (d.size() > 3) {
        FRESULT r = f_mkdir(d.c_str());
        if (r != FR_OK && r != FR_EXIST)
          return false;
      }
    }
  }
  return true;
}

bool putUsbFile(const char *name, const uint8_t *data, size_t size)
{
  if (!card_usb_image)
    return false;
  std::string path = usbPath(name);
  size_t slash = path.rfind('/');
  if (slash > 3 && !usbMkdirs(path.substr(3, slash - 3).c_str()))
    return false;
  FIL f;
  if (f_open(&f, path.c_str(), FA_WRITE | FA_CREATE_ALWAYS) != FR_OK)
    return false;
  UINT n = 0;
  bool ok = (f_write(&f, data, UINT(size), &n) == FR_OK && n == size);
  ok = (f_close(&f) == FR_OK) && ok;
  return ok;
}

// JSON list of a pendrive directory: [{"n":name,"s":size,"d":0/1},...]
std::string usbList(const char *path)
{
  std::string out = "[";
  DIR dir;
  if (!card_usb_image || f_opendir(&dir, usbPath(path).c_str()) != FR_OK)
    return "null";
  FILINFO fi;
  bool first = true;
  while (f_readdir(&dir, &fi) == FR_OK && fi.fname[0]) {
    std::string n;
    for (const char *c = fi.fname; *c; c++) {
      unsigned char ch = (unsigned char) *c;
      if (ch == '"' || ch == '\\') { n += '\\'; n += char(ch); }
      else if (ch < 0x20 || ch >= 0x80) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", ch); n += b; }
      else n += char(ch);
    }
    char rest[64];
    std::snprintf(rest, sizeof rest, "\",\"s\":%lu,\"d\":%d}",
                  (unsigned long) fi.fsize, (fi.fattrib & AM_DIR) ? 1 : 0);
    out += (first ? "{\"n\":\"" : ",{\"n\":\"") + n + rest;
    first = false;
  }
  f_closedir(&dir);
  return out + "]";
}

bool usbGetFile(const char *path, std::vector<uint8_t> &data)
{
  FIL f;
  if (!card_usb_image || f_open(&f, usbPath(path).c_str(), FA_READ) != FR_OK)
    return false;
  data.resize(size_t(f_size(&f)));
  UINT n = 0;
  bool ok = data.empty() || (f_read(&f, &data[0], UINT(data.size()), &n) == FR_OK && n == data.size());
  f_close(&f);
  return ok;
}

static bool usbDeleteTree(const std::string &p)
{
  FILINFO fi;
  if (f_stat(p.c_str(), &fi) != FR_OK)
    return false;
  if (fi.fattrib & AM_DIR) {
    std::vector<std::string> names;
    DIR dir;
    if (f_opendir(&dir, p.c_str()) == FR_OK) {
      while (f_readdir(&dir, &fi) == FR_OK && fi.fname[0])
        names.push_back(fi.fname);
      f_closedir(&dir);
    }
    for (size_t i = 0; i < names.size(); i++)
      if (!usbDeleteTree(p + "/" + names[i]))
        return false;
  }
  return f_unlink(p.c_str()) == FR_OK;
}

bool usbDelete(const char *path)
{
  if (!card_usb_image)
    return false;
  std::string p = usbPath(path);
  if (p.size() <= 3)
    return false;
  return usbDeleteTree(p);
}

bool usbSpace(uint32_t &totalKB, uint32_t &freeKB)
{
  DWORD nclst = 0;
  FATFS *fs = 0;
  if (!card_usb_image || f_getfree("0:", &nclst, &fs) != FR_OK)
    return false;
  totalKB = uint32_t((uint64_t(fs->n_fatent - 2) * fs->csize * 512) >> 10);
  freeKB = uint32_t((uint64_t(nclst) * fs->csize * 512) >> 10);
  return true;
}

bool putPsramFile(const char *name, const uint8_t *data, size_t size)
{
  if (!psramDrive.ok && !formatPsramDrive(1024))
    return false;
  std::string path = "/";
  for (const char *p = name; *p; p++)
    path += char(std::tolower((unsigned char) *p));
  lfs_file_t f;
  if (lfs_file_open(&lfs_psram, &f, path.c_str(),
                    LFS_O_WRONLY | LFS_O_CREAT | LFS_O_TRUNC) < 0)
    return false;
  bool ok = (lfs_file_write(&lfs_psram, &f, data, lfs_size_t(size)) == lfs_ssize_t(size));
  ok = (lfs_file_close(&lfs_psram, &f) >= 0) && ok;
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
    lfs_unmount(&lfs_psram);
    psramDrive.ok = false;
    std::strcpy(psramDrive.wd, "/");
  }
  if (cmd == 0x13) {
    // MSC_UMOUNT_DSK: by the type of the mounted image, not the active drive
    switch (dsk_file_type) {
    case 1: return tvc_fatfs_pendrive_unmount_dsk();
    case 2: return psramDrive.ok ? tvc_lfs_unmount_dsk() : uint8_t(FR_NOT_READY);
    case 3: return flashDrive.ok ? tvc_lfs_unmount_dsk() : uint8_t(FR_NOT_READY);
    default: return FR_INVALID_OBJECT;
    }
  }
  if (drive == 0 || drive == 3) {
    // the firmware's FatFS code: USB pendrive (0), mounted .dsk image (3)
    const bool usb = (drive == 0);
    switch (cmd) {
    case 0x01: return usb ? tvc_fatfs_pendrive_open_file() : tvc_fatfs_dskdrive_open_file();
    case 0x02: return usb ? tvc_fatfs_pendrive_close_file() : tvc_fatfs_dskdrive_close_file();
    case 0x03: return usb ? tvc_fatfs_pendrive_read_file() : tvc_fatfs_dskdrive_read_file();
    case 0x04: return usb ? tvc_fatfs_pendrive_write_file() : tvc_fatfs_dskdrive_write_file();
    case 0x05: return usb ? tvc_fatfs_pendrive_open_dir() : tvc_fatfs_dskdrive_open_dir();
    case 0x06: return usb ? tvc_fatfs_pendrive_close_dir() : tvc_fatfs_dskdrive_close_dir();
    case 0x07: return usb ? tvc_fatfs_pendrive_read_dir() : tvc_fatfs_dskdrive_read_dir();
    case 0x08: return usb ? tvc_fatfs_pendrive_write_file_source() : tvc_fatfs_dskdrive_write_file_source();
    case 0x09: return usb ? tvc_fatfs_pendrive_read_file_dest() : tvc_fatfs_dskdrive_read_file_dest();
    case 0x0A: return usb ? tvc_fatfs_pendrive_file_seek() : tvc_fatfs_dskdrive_file_seek();
    case 0x0B: return usb ? tvc_fatfs_pendrive_getcwd() : tvc_fatfs_dskdrive_getcwd();
    case 0x0C: return usb ? tvc_fatfs_pendrive_chdir() : tvc_fatfs_dskdrive_chdir();
    case 0x0D: return usb ? tvc_fatfs_pendrive_mkdir() : tvc_fatfs_dskdrive_mkdir();
    case 0x0E: return usb ? tvc_fatfs_pendrive_delete() : tvc_fatfs_dskdrive_delete();
    case 0x0F: return usb ? tvc_fatfs_pendrive_rename() : tvc_fatfs_dskdrive_rename();
    case 0x10: return usb ? tvc_fatfs_pendrive_getstat() : tvc_fatfs_dskdrive_getstat();
    case 0x11: return usb ? tvc_fatfs_pendrive_sync() : tvc_fatfs_dskdrive_sync();
    case 0x12: return usb ? tvc_fatfs_pendrive_mount_dsk() : uint8_t(0x80);
    default: return 0xFF;
    }
  }
  Drive *d = (drive == 1 ? &psramDrive : (drive == 2 ? &flashDrive : (Drive *) 0));
  const bool isFlash = (d == &flashDrive);
  uint8_t fres = 0xFF;
  if (!d || !d->ok) {
    // an unformatted PSRAM drive and an unmounted flash drive
    fres = FR_NOT_READY;
  }
  else {
    lfs_t *l = (d == &psramDrive ? &lfs_psram : &d->lfs);
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
