// TVC256k++ IO card emulation, step 1. See tvc256kpp.hpp.
// SPDX-License-Identifier: GPL-2.0-or-later

#include "tvc256kpp.hpp"
#include "card/card_shim.h"
#include "card/tvc-card.h"
#include <cstring>

namespace {
  enum {
    REG_MEMORY_P2 = 0xB0,
    REG_MEMORY_P3 = 0xB1,
    REG_MEMORY_MAP_8M_P2_LOW = 0xB2,
    REG_MEMORY_MAP_8M_P2_HIGH = 0xB3,
    REG_MEMORY_MAP_8M_P3_LOW = 0xB4,
    REG_MEMORY_MAP_8M_P3_HIGH = 0xB5,
    REG_MEMORY_PSRAM_SIZE_IN_MB = 0xB6,
    REG_MEMORY_ROM_PAGE = 0xB7,
    REG_FW_VERSION_MAJOR = 0xC3,
    REG_FW_VERSION_MINOR = 0xC4,
    REG_DRIVE_SELECT = 0xC5,
    REG_DRIVE_PSRAM_VALID = 0xC8,
    REG_DRIVE_FLASH_VALID = 0xC9,
    REG_DRIVE_DSK_VALID = 0xCA,
    REG_USB_INIT = 0xD0,
    REG_USB_MOUSE_DW = 0xD4,
    REG_USB_MOUSE_SPEED = 0xD5,
    REG_USB_MSC_CMD = 0xD6,
    REG_VSID_BASE = 0xE0
  };
  const uint16_t kRamOffset = 0x1800;    // start of IO RAM in the 8 kB area
  const uint16_t kDriveSelectOffset = 0x1810;   // $D810, mirrors REG_DRIVE_SELECT

  // registers handled by the firmware code in card/tvc-io-regs.c: sprites,
  // screen, built-in functions
  inline bool isFirmwareRegister(uint8_t r)
  {
    return (r < 0xB0 || r == 0xC0 || r == 0xC1 || r == 0xC2 || r == 0xC6
            || r == 0xC7);
  }

  // overlay pixel (bit 4: transparent, bits 3..0: I R G B) to TVC colour
  inline uint8_t overlayColor(uint8_t c)
  {
    return uint8_t(((c & 1) ? 0x01 : 0) | ((c & 2) ? 0x10 : 0)
                   | ((c & 4) ? 0x04 : 0) | ((c & 8) ? 0x40 : 0));
  }
}

const uint8_t *TVC256kpp::currentOverlay_ = (const uint8_t *) 0;

namespace {
  // USB mouse (firmware: tvc-usb.c process_mouse_report()); the browser's
  // mouse acts as the card's USB mouse once it sends a report
  struct {
    bool connected;
    int32_t sumX, sumY;
    bool restartX, restartY;   // the TVC read the value: start a new sum
    int8_t dx, dy;
    uint8_t buttons;
    uint8_t speed;             // kept in the card's flash: survives power-off
  } mouse = { false, 0, 0, false, false, 0, 0, 0, 0x10 };

  int8_t mouseValue(int32_t sum)
  {
    double speed = double(mouse.speed >> 5) + double(mouse.speed & 0x1F) / 32.0;
    double v = double(sum) * speed;
    long m = long(v < 0 ? v - 0.5 : v + 0.5);
    if (m > 255) m = 255;
    else if (m < -254) m = -254;
    return int8_t(uint8_t(m & 0xFF));
  }
}

bool TVC256kpp::setUsbPendrive(uint32_t sizeMB)
{
  if (!sizeMB) {
    TVC256kppFS::usbDetach();
    return true;
  }
  return TVC256kppFS::usbAttach(sizeMB);
}

void TVC256kpp::mouseInput(int dx, int dy, int buttons)
{
  mouse.connected = true;
  mouse.buttons = uint8_t(buttons & 7);      // left 1, middle 2, right 4
  if (mouse.restartX) { mouse.sumX = 0; mouse.restartX = false; }
  if (mouse.restartY) { mouse.sumY = 0; mouse.restartY = false; }
  mouse.sumX += dx;
  mouse.sumY += dy;
  mouse.dx = mouseValue(mouse.sumX);
  mouse.dy = mouseValue(mouse.sumY);
}

const size_t TVC256kpp::kFastRamSize;
const size_t TVC256kpp::kPsramSize;
const size_t TVC256kpp::kPageSize;
const size_t TVC256kpp::kRomPageSize;
const size_t TVC256kpp::kIoAreaSize;
const uint8_t TVC256kpp::kFwMajor;
const uint8_t TVC256kpp::kFwMinor;

TVC256kpp *TVC256kpp::current = (TVC256kpp *) 0;

TVC256kpp::TVC256kpp()
  : enabled_(false), slot_(1), border_(0), romPage_(0),
    ioRam_(&TVC_ROM[kRamOffset]), pagingCb_(0), pagingCbData_(0)
{
  current = this;
  std::memset(TVC256kppFS::fastRam(), 0, TVC_RAM_SIZE);
  psram_.assign(kPsramSize, 0);
  // the PSRAM windows follow the fast RAM, as pages 16 and 17
  buf_[0] = TVC256kppFS::fastRam() + kFastRamSize;
  buf_[1] = buf_[0] + kPageSize;
  rom_.assign(2 * kRomPageSize, 0xFF);
  loadROM(tvc256kpp_rom_data, tvc256kpp_rom_size);
  TVC256kppFS::attachPsram(&psram_[0], uint32_t(kPsramSize >> 20));
  setDefaults();
}

TVC256kpp::~TVC256kpp()
{
  if (current == this)
    current = (TVC256kpp *) 0;
  TVC256kppFS::resetPsramDrive();
  TVC256kppFS::attachPsram((uint8_t *) 0, 0);
}

void TVC256kpp::setSlot(int slot)
{
  if (slot < 0) slot = 0;
  if (slot > 3) slot = 3;
  slot_ = slot;
}

void TVC256kpp::setEnabled(bool e)
{
  if (e == enabled_)
    return;
  enabled_ = e;
  notifyPaging();
}

bool TVC256kpp::loadROM(const uint8_t *data, size_t size)
{
  if (!data || size != 2 * kRomPageSize)
    return false;
  rom_.assign(data, data + size);
  return true;
}

void TVC256kpp::setDefaults()
{
  std::memset(regs_, 0, sizeof(regs_));
  sel_[0] = sel_[1] = 0;
  inc_[0] = inc_[1] = 1;
  romPage_ = 0;
  pageSel_[0] = 4;                                   // U2: fast page 4
  pageSel_[1] = 5;                                   // U3: fast page 5
  psramHi_[0] = psramHi_[1] = 0;
  psramCached_[0] = psramCached_[1] = -1;
  updateParamPages();
  std::memset(ioRam_, 0, 0x800);
  TVC256kppFS::powerOn();                 // no PSRAM drive, root directory
  card_power_on();                        // graphics, functions
  card_sid_power_on();
  card_int_active = false;
  currentOverlay_ = (const uint8_t *) 0;
}

void TVC256kpp::reset(bool cold)
{
  // Warm reset: the card keeps paging and memory contents, only the video
  // state is reinitialised (firmware: reset_handler()). Cold reset: full
  // re-init.
  // (The firmware reboots the card on two resets within a second; on the
  // web page the cold reset button stands for that.)
  if (cold) {
    flushPsramBuffers();
    setDefaults();
    notifyPaging();
  }
  else {
    card_reset();
  }
}

// ---------------------------------------------------------------------------
// memory paging

uint8_t *TVC256kpp::getPage(int i)
{
  if (!enabled_ || i < 0 || i > 1)
    return (uint8_t *) 0;
  uint8_t s = pageSel_[i];
  if (s == 0xFF)
    return (uint8_t *) 0;
  if (s < 16)
    return TVC256kppFS::fastRam() + size_t(s) * kPageSize;
  if (s == 0x10 || s == 0x11)
    return buf_[s & 1];
  return (uint8_t *) 0;
}

void TVC256kpp::selectFast(int i, uint8_t v)
{
  pageSel_[i] = (v == 0xFF ? uint8_t(0xFF) : uint8_t(v & 0x0F));
  updateParamPages();
  notifyPaging();
}

void TVC256kpp::updateParamPages()
{
  // the built-in functions find their parameters in the page mapped to U2
  // or U3: 0..15 fast RAM, 16/17 PSRAM window, 255 none
  currentP2 = pageSel_[0];
  currentP3 = pageSel_[1];
}

void TVC256kpp::writebackBuffer(int i)
{
  if (psramCached_[i] >= 0) {
    std::memcpy(&psram_[size_t(psramCached_[i]) * kPageSize],
                buf_[i], kPageSize);
  }
}

void TVC256kpp::flushPsramBuffers()
{
  writebackBuffer(0);
  writebackBuffer(1);
}

void TVC256kpp::reloadPsramBuffers()
{
  for (int i = 0; i < 2; i++) {
    if (psramCached_[i] >= 0)
      std::memcpy(buf_[i], &psram_[size_t(psramCached_[i]) * kPageSize], kPageSize);
  }
}

bool TVC256kpp::formatPsramDrive(uint32_t numBlocks)
{
  flushPsramBuffers();
  bool ok = TVC256kppFS::formatPsramDrive(numBlocks);
  reloadPsramBuffers();
  ioRam_[0x24] = ok ? 1 : 0;              // REG_DRIVE_PSRAM_VALID
  return ok;
}

void TVC256kpp::mapPsram(int i)
{
  int page = int(regs_[REG_MEMORY_MAP_8M_P2_LOW + 2 * i])
             | (int(psramHi_[i] & 1) << 8);
  if (psramCached_[i] != page) {
    // the previously cached page goes back to the PSRAM first
    writebackBuffer(i);
    // never keep one PSRAM page in two buffers
    if (psramCached_[i ^ 1] == page)
      writebackBuffer(i ^ 1);
    std::memcpy(buf_[i], &psram_[size_t(page) * kPageSize], kPageSize);
    psramCached_[i] = page;
  }
  pageSel_[i] = uint8_t(0x10 + i);
  updateParamPages();
  notifyPaging();
}

// ---------------------------------------------------------------------------
// register file

// the debugger's view of a register: the value a read returns, except for
// the registers whose read has side effects (mouse movement, firmware and
// vSID registers), which show the stored value
uint8_t TVC256kpp::debugRegister(int r_)
{
  uint8_t r = uint8_t(r_);
  if (r == 0xD2 || r == 0xD3 || isFirmwareRegister(r) || r >= REG_VSID_BASE)
    return regs_[r];
  return regRead(r);
}

uint8_t TVC256kpp::regRead(uint8_t r)
{
  if (isFirmwareRegister(r))
    return card_reg_read(r);
  if (r >= REG_VSID_BASE)
    return card_sid_read(uint8_t(r - REG_VSID_BASE));
  switch (r) {
  case REG_MEMORY_P2:
    return pageSel_[0];
  case REG_MEMORY_P3:
    return pageSel_[1];
  case REG_MEMORY_PSRAM_SIZE_IN_MB:
    return uint8_t(kPsramSize >> 20);
  case REG_MEMORY_ROM_PAGE:
    return romPage_;
  case REG_FW_VERSION_MAJOR:
    return kFwMajor;
  case REG_FW_VERSION_MINOR:
    return kFwMinor;
  case REG_DRIVE_SELECT:                   // firmware: TVC_ROM[0x1810]
    return ioRam_[kDriveSelectOffset - kRamOffset];
  case REG_DRIVE_PSRAM_VALID:
    return ioRam_[0x24];
  case REG_DRIVE_FLASH_VALID:
    return TVC256kppFS::flashValid() ? 1 : 0;
  case REG_DRIVE_DSK_VALID:
    return ioRam_[0x25];
  default:
    break;
  }
  switch (r) {
  case REG_USB_INIT:                       // bit 0: mouse, bit 1: mass storage
    return uint8_t((mouse.connected ? 0x01 : 0x00)
                   | (TVC256kppFS::usbPresent() ? 0x02 : 0x00));
  case 0xD1:
    return mouse.buttons;
  case 0xD2:                               // DX, DY: cleared by the read
    {
      uint8_t v = uint8_t(mouse.dx);
      mouse.dx = 0;
      mouse.restartX = true;
      return v;
    }
  case 0xD3:
    {
      uint8_t v = uint8_t(mouse.dy);
      mouse.dy = 0;
      mouse.restartY = true;
      return v;
    }
  case REG_USB_MOUSE_DW:
    return 0;
  case REG_USB_MOUSE_SPEED:
    return mouse.speed;
  default:
    break;
  }
  return regs_[r];
}

void TVC256kpp::regWrite(uint8_t r, uint8_t v)
{
  if (isFirmwareRegister(r)) {
    card_reg_write(r, v);
    return;
  }
  if (r >= REG_VSID_BASE) {
    card_sid_write(uint8_t(r - REG_VSID_BASE), v);
    return;
  }
  switch (r) {
  case REG_MEMORY_P2:
    selectFast(0, v);
    return;
  case REG_MEMORY_P3:
    selectFast(1, v);
    return;
  case REG_MEMORY_MAP_8M_P2_LOW:
    regs_[r] = v;
    mapPsram(0);
    return;
  case REG_MEMORY_MAP_8M_P3_LOW:
    regs_[r] = v;
    mapPsram(1);
    return;
  case REG_MEMORY_MAP_8M_P2_HIGH:
    psramHi_[0] = v & 1;
    regs_[r] = psramHi_[0];
    return;
  case REG_MEMORY_MAP_8M_P3_HIGH:
    psramHi_[1] = v & 1;
    regs_[r] = psramHi_[1];
    return;
  case REG_MEMORY_ROM_PAGE:
    if (v <= 1)
      romPage_ = v;                        // values above 1 are ignored
    return;
  case REG_DRIVE_SELECT:
    ioRam_[kDriveSelectOffset - kRamOffset] = (v > 3 ? 3 : v);
    return;
  // read-only registers
  case REG_MEMORY_PSRAM_SIZE_IN_MB:
  case REG_FW_VERSION_MAJOR:
  case REG_FW_VERSION_MINOR:
  case REG_USB_INIT:
  case 0xD1: case 0xD2: case 0xD3: case REG_USB_MOUSE_DW:
    return;
  case REG_USB_MOUSE_SPEED:
    mouse.speed = v & 0x7F;
    return;
  case REG_USB_MSC_CMD:
    // file commands run to completion at once; the register then reads 0 or
    // the error code + $80 (the Z80 side polls it)
    flushPsramBuffers();
    regs_[r] = TVC256kppFS::mscCommand(v, ioRam_);
    reloadPsramBuffers();
    return;
  case REG_DRIVE_PSRAM_VALID:
  case REG_DRIVE_FLASH_VALID:
  case REG_DRIVE_DSK_VALID:
    return;
  default:
    break;
  }
  regs_[r] = v;
}

// ---------------------------------------------------------------------------
// I/O ports

bool TVC256kpp::handleRead(uint16_t port, uint8_t &val)
{
  if (!enabled_)
    return false;
  int d = int(port) - baseSlotPort();
  if (d < 0 || d > 6 || d == 3)
    return false;
  int set = (d >= 4 ? 1 : 0);
  switch (d & 3) {
  case 0:
    val = sel_[set];
    break;
  case 1:
    val = regRead(sel_[set]);
    sel_[set] = uint8_t(sel_[set] + inc_[set]);
    break;
  default:
    val = inc_[set];
    break;
  }
  return true;
}

bool TVC256kpp::handleWrite(uint16_t port, uint8_t value)
{
  if (!enabled_)
    return false;
  if (port == 0x00) {                      // the card watches the border colour
    border_ = value;
    card_border_write(value);
    return false;                          // the TVC still handles it
  }
  int d = int(port) - baseSlotPort();
  if (d < 0 || d > 6 || d == 3)
    return false;
  int set = (d >= 4 ? 1 : 0);
  switch (d & 3) {
  case 0:
    sel_[set] = value;
    break;
  case 1:
    regWrite(sel_[set], value);
    sel_[set] = uint8_t(sel_[set] + inc_[set]);
    break;
  default:
    inc_[set] = value;
    break;
  }
  return true;
}

// ---------------------------------------------------------------------------
// IO ROM area

bool TVC256kpp::handleSlotROMRead(uint16_t addr, uint16_t slotPaging,
                                  uint8_t &val)
{
  if (!enabled_ || (slotPaging >> 14) != slot_)
    return false;
  uint16_t offs = addr & (kIoAreaSize - 1);
  if (offs < kRomPageSize) {
    val = rom_[size_t(romPage_) * kRomPageSize + offs];
  }
  else {
    val = ioRam_[offs - kRamOffset];
  }
  return true;
}

bool TVC256kpp::handleSlotROMWrite(uint16_t addr, uint16_t slotPaging,
                                   uint8_t val)
{
  if (!enabled_ || (slotPaging >> 14) != slot_)
    return false;
  uint16_t offs = addr & (kIoAreaSize - 1);
  if (offs >= kRamOffset) {
    ioRam_[offs - kRamOffset] = val;
  }
  return true;                             // writes to the ROM area are ignored
}

// ---------------------------------------------------------------------------
// video overlay

void TVC256kpp::videoVSync()
{
  if (enabled_)
    card_gfx_vsync();
}

void TVC256kpp::videoLine(int paperStart)
{
  currentOverlay_ = (const uint8_t *) 0;
  if (!enabled_ || paperStart < 0)
    return;
  const uint8_t *p = card_gfx_line();
  if (!p)
    return;
  // one overlay pixel (6.25 MHz) is two pixels of the 768 pixel wide line
  bool visible = false;
  std::memset(overlay_, 0xFF, sizeof(overlay_));
  for (int i = 0; i < 256; i++) {
    int x = paperStart + i * 2;
    if (x + 1 >= int(sizeof(overlay_)))
      break;
    if (!(p[i] & 0x10)) {
      overlay_[x] = overlay_[x + 1] = overlayColor(p[i]);
      visible = true;
    }
  }
  if (visible)
    currentOverlay_ = overlay_;
}

bool TVC256kpp::irqActive() const
{
  return enabled_ && card_int_active;
}

bool TVC256kpp::putPsramFile(const char *name, const uint8_t *data, size_t size)
{
  if (!TVC256kppFS::putPsramFile(name, data, size))
    return false;
  TVC_ROM[kDriveSelectOffset] = 1;         // the PSRAM drive is the current one
  return true;
}

void TVC256kpp::selectDrive(int drive)
{
  TVC_ROM[kDriveSelectOffset] = uint8_t(drive & 3);
}

bool TVC256kpp::putUsbFile(const char *name, const uint8_t *data, size_t size)
{
  if (!TVC256kppFS::putUsbFile(name, data, size))
    return false;
  TVC_ROM[kDriveSelectOffset] = 0;         // the pendrive is the current drive
  return true;
}

// ---------------------------------------------------------------------------
// vSID sound

void TVC256kpp::renderAudio(int32_t &outLeft, int32_t &outRight)
{
  if (!enabled_)
    return;
  // SID clocks (336 MHz / 341) per TVC audio sample (1562500 / 4 Hz), 16.16
  const uint32_t step = uint32_t((336000000.0 / 341.0) / 390625.0 * 65536.0 + 0.5);
  // the card's PWM output (0..65535): as a signal around the middle level;
  // its DC part (e.g. the volume register, used for samples) is removed by
  // the audio converter's DC blocking filter, as the card's output is AC
  // coupled
  int32_t x = int32_t(card_sid_clock(step)) - 32768;
  outLeft += x;
  outRight += x;
}

// ---------------------------------------------------------------------------
// state saving (quick saves)

// the firmware's global variables, listed by build.sh from the card objects
// (build/obj/cardstate_regions.c)
extern "C" {
  struct card_state_region { void *p; unsigned n; };
  extern const struct card_state_region card_state_regions[];
  extern const unsigned card_state_region_count;
}

namespace {

  const uint32_t kCardStateMagic = 0x32354B43U;      // "CK52"

  void put32(std::vector<uint8_t>& out, uint32_t v)
  {
    for (int i = 0; i < 4; i++)
      out.push_back(uint8_t(v >> (i * 8)));
  }

  void putBytes(std::vector<uint8_t>& out, const void *p, size_t n)
  {
    const uint8_t *b = (const uint8_t *) p;
    out.insert(out.end(), b, b + n);
  }

  struct Reader {
    const uint8_t *p;
    size_t  n;
    bool    bad;
    Reader(const uint8_t *p_, size_t n_) : p(p_), n(n_), bad(false) { }
    uint32_t get32()
    {
      if (n < 4) { bad = true; return 0U; }
      uint32_t v = uint32_t(p[0]) | (uint32_t(p[1]) << 8) | (uint32_t(p[2]) << 16) | (uint32_t(p[3]) << 24);
      p += 4; n -= 4;
      return v;
    }
    const uint8_t *bytes(size_t k)
    {
      if (n < k) { bad = true; return (const uint8_t *) 0; }
      const uint8_t *r = p;
      p += k; n -= k;
      return r;
    }
  };

}       // namespace

void TVC256kpp::saveState(std::vector<uint8_t>& out)
{
  flushPsramBuffers();
  put32(out, kCardStateMagic);
  put32(out, uint32_t(TVC256kppFS::fastRamSize()));
  put32(out, uint32_t(TVC256kppFS::ioAreaSize()));
  put32(out, uint32_t(psram_.size()));
  put32(out, card_state_region_count);
  for (unsigned i = 0; i < card_state_region_count; i++)
    put32(out, card_state_regions[i].n);
  out.push_back(border_);
  putBytes(out, regs_, sizeof(regs_));
  putBytes(out, sel_, 2);
  putBytes(out, inc_, 2);
  out.push_back(romPage_);
  putBytes(out, pageSel_, 2);
  putBytes(out, psramHi_, 2);
  put32(out, uint32_t(psramCached_[0]));
  put32(out, uint32_t(psramCached_[1]));
  put32(out, TVC256kppFS::psramDriveBlocks());
  putBytes(out, TVC256kppFS::fastRam(), TVC256kppFS::fastRamSize());
  putBytes(out, TVC256kppFS::ioArea(), TVC256kppFS::ioAreaSize());
  putBytes(out, &psram_[0], psram_.size());
  for (unsigned i = 0; i < card_state_region_count; i++)
    putBytes(out, card_state_regions[i].p, card_state_regions[i].n);
}

bool TVC256kpp::loadState(const uint8_t *p, size_t n)
{
  Reader r(p, n);
  // a state of another build (other sizes) is not loaded
  if (r.get32() != kCardStateMagic ||
      r.get32() != uint32_t(TVC256kppFS::fastRamSize()) ||
      r.get32() != uint32_t(TVC256kppFS::ioAreaSize()) ||
      r.get32() != uint32_t(psram_.size()) ||
      r.get32() != card_state_region_count || r.bad)
    return false;
  for (unsigned i = 0; i < card_state_region_count; i++) {
    if (r.get32() != card_state_regions[i].n)
      return false;
  }
  size_t need = 1 + sizeof(regs_) + 2 + 2 + 1 + 2 + 2 + 12
                + TVC256kppFS::fastRamSize() + TVC256kppFS::ioAreaSize() + psram_.size();
  for (unsigned i = 0; i < card_state_region_count; i++)
    need += card_state_regions[i].n;
  if (r.bad || r.n != need)
    return false;
  border_ = *r.bytes(1);
  std::memcpy(regs_, r.bytes(sizeof(regs_)), sizeof(regs_));
  std::memcpy(sel_, r.bytes(2), 2);
  std::memcpy(inc_, r.bytes(2), 2);
  romPage_ = *r.bytes(1);
  std::memcpy(pageSel_, r.bytes(2), 2);
  std::memcpy(psramHi_, r.bytes(2), 2);
  psramCached_[0] = int(int32_t(r.get32()));
  psramCached_[1] = int(int32_t(r.get32()));
  uint32_t driveBlocks = r.get32();
  // the PSRAM window buffers are in the fast RAM area, so they come back
  // together with psramCached_[]
  std::memcpy(TVC256kppFS::fastRam(), r.bytes(TVC256kppFS::fastRamSize()), TVC256kppFS::fastRamSize());
  std::memcpy(TVC256kppFS::ioArea(), r.bytes(TVC256kppFS::ioAreaSize()), TVC256kppFS::ioAreaSize());
  std::memcpy(&psram_[0], r.bytes(psram_.size()), psram_.size());
  for (unsigned i = 0; i < card_state_region_count; i++)
    std::memcpy(card_state_regions[i].p, r.bytes(card_state_regions[i].n), card_state_regions[i].n);
  // the PSRAM drive as it is in the loaded PSRAM
  uint8_t driveSel = TVC256kppFS::ioArea()[kDriveSelectOffset];
  TVC256kppFS::remountPsramDrive(driveBlocks);
  TVC256kppFS::ioArea()[kDriveSelectOffset] = driveSel;
  updateParamPages();
  currentOverlay_ = (const uint8_t *) 0;
  notifyPaging();
  return true;
}
