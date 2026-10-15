// TVC256k++ IO card emulation (step 1: ports, register file, memory paging,
// IO ROM). Hardware by Vass Sandor, https://github.com/dikdom/tvc256kplusplus
// Behaviour implemented from the card's user guide (2026.10.11) and firmware.
//
// SPDX-License-Identifier: GPL-2.0-or-later

#ifndef TVC256KPP_HPP_INCLUDED
#define TVC256KPP_HPP_INCLUDED

#include <cstdint>
#include <cstddef>
#include <vector>
#include "tvc256kpp_fs.hpp"

extern const uint8_t tvc256kpp_rom_data[];
extern const size_t  tvc256kpp_rom_size;

class TVC256kpp {
 public:
  static const size_t kFastRamSize = 0x40000;      // 256 kB, 16 pages
  static const size_t kPsramSize   = 0x800000;     // 8 MB, 512 pages
  static const size_t kPageSize    = 0x4000;       // 16 kB
  static const size_t kRomPageSize = 0x1800;       // 6 kB per ROM page
  static const size_t kIoAreaSize  = 0x2000;       // $C000-$DFFF in IOMEM
  static const uint8_t kFwMajor    = 0;
  static const uint8_t kFwMinor    = 24;

  TVC256kpp();
  ~TVC256kpp();

  // slot: 0..3 (jobbrol balra), selected by port $03 bits 6-7.
  // Slot 0 is the VT-DOS slot in ep128emu, so 1..3 are usable.
  void setSlot(int slot);
  int  getSlot() const { return slot_; }
  void setEnabled(bool e);
  bool isEnabled() const { return enabled_; }
  bool loadROM(const uint8_t *data, size_t size);   // 12288 bytes
  void reset(bool cold);

  // I/O ports (port number already masked with 0x7F). Return true if the
  // access was handled by the card.
  bool handleRead(uint16_t port, uint8_t &val);
  bool handleWrite(uint16_t port, uint8_t val);

  // IOMEM ($C000-$DFFF) accesses. slotPaging = paging & 0xC000.
  bool handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val);
  bool handleSlotROMWrite(uint16_t addr, uint16_t slotPaging, uint8_t val);

  // Card RAM visible in the TVC's U2 (i = 0) / U3 (i = 1) area, or nullptr
  // if the TVC's own RAM is visible there.
  uint8_t *getPage(int i);

  // called whenever the mapping returned by getPage() may have changed
  void setPagingCallback(void (*f)(void *), void *userData) {
    pagingCb_ = f; pagingCbData_ = userData;
  }

  // direct access for the emulator side (file operations, state saving)
  uint8_t *fastRam() { return TVC256kppFS::fastRam(); }
  uint8_t *psram()   { flushPsramBuffers(); return &psram_[0]; }
  uint8_t  borderColor() const { return border_; }

  // Video overlay. videoVSync() at the start of each frame, then
  // videoLine() for each line, with the position of the paper area in the
  // 768 pixel wide line (or -1 if the line has no paper). Afterwards
  // currentOverlay() returns the overlay of that line (768 bytes, $FF where
  // the TVC's own picture is visible, TVC colour otherwise) or nullptr.
  void videoVSync();
  void videoLine(int paperStart);
  static const uint8_t *currentOverlay() { return currentOverlay_; }
  static void clearOverlay() { currentOverlay_ = (const uint8_t *) 0; }
  // the card's /INT output (sprite collision interrupt)
  bool irqActive() const;

  // Flash drive image (flash-root-*.bin, 15 MB littlefs). Shared by all
  // card instances; returns false if it is not a valid littlefs image.
  static bool loadFlashImage(const uint8_t *data, size_t size)
  { return TVC256kppFS::loadFlashImage(data, size); }
  // PSRAM drive: formats the first numBlocks (4 kB each) of the PSRAM
  bool formatPsramDrive(uint32_t numBlocks);
  static uint32_t fsStat(int which) { return TVC256kppFS::stat(which); }
  uint8_t  baseRegister(int set) const { return sel_[set & 1]; }

 private:
  bool    enabled_;
  int     slot_;
  uint8_t border_;
  uint8_t regs_[256];
  uint8_t sel_[2];                 // selected register, two port sets
  uint8_t inc_[2];                 // register increment, two port sets
  uint8_t romPage_;
  uint8_t pageSel_[2];             // 0..15 fast page, 0x10/0x11 PSRAM, 0xFF off
  uint8_t psramHi_[2];
  int     psramCached_[2];         // PSRAM page held in the buffer, or -1
  uint8_t *ioRam_;                 // 2 kB RAM at the end of the IO ROM area
  std::vector<uint8_t> rom_;       // 2 x 6 kB
  std::vector<uint8_t> psram_;
  uint8_t *buf_[2];                // internal pages 16 / 17 (PSRAM windows)
  uint8_t overlay_[768];
  static const uint8_t *currentOverlay_;
  void (*pagingCb_)(void *);
  void *pagingCbData_;

  int  baseSlotPort() const { return 0x10 + 0x10 * slot_; }
  uint8_t regRead(uint8_t r);
  void regWrite(uint8_t r, uint8_t v);
  void selectFast(int i, uint8_t v);
  void mapPsram(int i);
  void writebackBuffer(int i);
  void flushPsramBuffers();
  void notifyPaging() { if (pagingCb_) pagingCb_(pagingCbData_); }
  void updateParamPages();
  void setDefaults();
  void reloadPsramBuffers();
};

#endif
