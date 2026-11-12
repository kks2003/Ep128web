// TVC-NanoSD IO card (dikdom/TVC-NanoSD): a microSD card handler for the
// Videoton TVC's expansion slots. Its ROM (tvc_nanosd_rom.cpp) runs as is;
// the card's Arduino Nano, which talks to the TVC through one I/O port of
// the slot and reads / writes the SD card, is replaced by this code: it
// follows the Nano firmware (TVC_NanoCartSD.ino v0.32, BSD-3-Clause) command
// by command. The SD card is a FAT image in memory (FatFS volume "2:"); like
// the Nano's SD library, the TVC sees the 8.3 names.
//
// SPDX-License-Identifier: GPL-2.0-or-later

#ifndef TVC_NANOSD_HPP_INCLUDED
#define TVC_NANOSD_HPP_INCLUDED

#include <cstdint>
#include <cstddef>
#include <string>
#include <vector>

namespace TVCNanoSD {

  // the card's ROM at $C000-$DFFF of its slot (addr: 0..$3FFF in the page)
  uint8_t romRead(uint16_t addr);
  // the TVC's IN / OUT on a port of the card's slot; ioPeek(): IN without
  // side effects (debugger)
  uint8_t ioRead();
  uint8_t ioPeek();
  void ioWrite(uint8_t value);
  // power on (the Nano starts: setup()); the TVC's reset does not reset it
  void powerOn();

  // the two settings the Nano keeps in its EEPROM (0: menu at boot, 1:
  // sort order of the menu's file list); the page stores them
  uint8_t getParam(int n);
  void setParam(int n, uint8_t value);

  // SD card: an empty, freshly formatted FAT card of sizeMB megabytes is
  // inserted, or the card is removed (the Nano notices both, as its card
  // detect switch)
  bool sdInsert(uint32_t sizeMB);
  void sdRemove();
  bool sdPresent();
  // file manager of the web page (paths relative to the card's root)
  std::string sdList(const char *path);         // JSON array, or "null"
  bool sdGetFile(const char *path, std::vector<uint8_t> &data);
  bool sdPutFile(const char *path, const uint8_t *data, size_t size);
  bool sdMkdirs(const char *path);
  bool sdDelete(const char *path);              // files and whole directories
  bool sdSpace(uint32_t &totalKB, uint32_t &freeKB);
  uint32_t sdWrites();                          // sector writes so far
  // the Nano's current directory (e.g. to start a program from it)
  bool setCurrentDir(const char *path);

}

#endif
