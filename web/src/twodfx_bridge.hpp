// Ep128web: connects the portable 2dfx module (web/src/twodfx, MIT) to the
// Enterprise and TVC virtual machines of ep128emu.
//
// The card is on the F8h/F9h I/O ports of both machines. The VMs call
// vsync() at the start of VSYNC and line() after each rendered scanline;
// line() also prepares the 2dfx overlay of that scanline, which the web
// display composes over the machine's pixels (currentOverlay()).

#ifndef EP128WEB_TWODFX_BRIDGE_HPP
#define EP128WEB_TWODFX_BRIDGE_HPP

#include <stdint.h>

namespace TwoDfx {

  // machine: 0 = Enterprise, 1 = TVC; the card is created (powered on) or
  // removed; a new machine type gets a new card
  void configure(bool enabled, int machine);
  bool isEnabled();
  // physical power cycle (cold reset of the machine)
  void powerCycle();
  // Z80 OUT F8h / F9h
  void writePort(uint8_t port, uint8_t value);
  // Z80 IN F8h (status, active low)
  uint8_t readStatus();
  void vsync();
  // after rendering a scanline: 'palette' converts the 2dfx colour indices
  // 0..15 to the machine's colour bytes; 'rawX0' is the raw 2dfx X
  // coordinate of the first pixel of the 768 pixel wide display line;
  // the card can only replace the pixels of the display area of the line
  // (from 'activeStart' to 'activeEnd', in display pixels), never the
  // border, like on the real machines (NICK / CRTC display enable)
  void line(const uint8_t *palette, int rawX0, int activeStart, int activeEnd);
  // the raster interrupt request
  bool irqActive();
  // 768 colour bytes and coverage flags (1 = 2dfx pixel) of the scanline
  // just rendered, or 0 if the 2dfx draws nothing on it
  const uint8_t *currentOverlay();
  const uint8_t *currentCoverage();
  void clearOverlay();

}

#endif
