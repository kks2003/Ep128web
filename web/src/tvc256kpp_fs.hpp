// File system side of the TVC256k++ card emulation: the flash drive (a
// read-only littlefs image) and the PSRAM drive (littlefs in the card's PSRAM),
// driven through the card's REG_USB_MSC_CMD protocol. The protocol handling
// (tvc-lfs.c) is the card firmware's own code, vendored in web/src/card.
//
// The USB and DSK drives are not emulated yet (the commands report "not ready").
//
// SPDX-License-Identifier: GPL-2.0-or-later

#ifndef TVC256KPP_FS_HPP_INCLUDED
#define TVC256KPP_FS_HPP_INCLUDED

#include <cstdint>
#include <cstddef>

namespace TVC256kppFS {
  // the card's 256 kB fast RAM (shared with the vendored firmware code)
  uint8_t *fastRam();
  // PSRAM buffer used by the PSRAM drive and the card (sizeMB megabytes)
  void attachPsram(uint8_t *psram, uint32_t sizeMB);

  // Flash drive: copies a 15 MB littlefs image (flash-root-*.bin) and mounts it
  bool loadFlashImage(const uint8_t *data, size_t size);
  bool flashValid();

  // PSRAM drive: (re)formats the first numBlocks x 4 kB blocks of the PSRAM
  bool formatPsramDrive(uint32_t numBlocks);
  void resetPsramDrive();             // power-on state: no PSRAM drive
  // the card (re)boots: no PSRAM drive, no open files or directories, the
  // flash drive's current directory is the root again
  void powerOn();
  // writes a file to the root of the PSRAM drive (name is lowercased like
  // the card does), formatting a 4 MB drive first if there is none
  bool putPsramFile(const char *name, const uint8_t *data, size_t size);

  // USB pendrive (FatFS, "0:"): plugs in an empty, freshly formatted FAT
  // pendrive of sizeMB megabytes, or unplugs it; putUsbFile() copies a file
  // to its root directory
  bool usbAttach(uint32_t sizeMB);
  void usbDetach();
  bool usbPresent();
  bool putUsbFile(const char *name, const uint8_t *data, size_t size);
  // the pendrive's sectors (e.g. to save them), nullptr if none
  const uint8_t *usbImage(size_t &size);

  // Executes one REG_USB_MSC_CMD command. ioRam is the 2 kB RAM at the end of
  // the IO ROM area ($D800-$DFFF): parameters at +$100, results at +$200.
  // Returns the value of the command register afterwards: 0 or error + $80.
  uint8_t mscCommand(uint8_t cmd, uint8_t *ioRam);

  // counters for tests: 0 = successful file opens, 1 = bytes read from files
  uint32_t stat(int which);
}

#endif
