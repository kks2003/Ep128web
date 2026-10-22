// Ep128web: 2dfx card bridge, see twodfx_bridge.hpp

#include "twodfx_bridge.hpp"

extern "C" {
#include "twodfx_emu.h"
}

#include <cstring>

namespace TwoDfx {

  static twodfx_emu *dev = (twodfx_emu *) 0;
  static int        devMachine = -1;
  static unsigned   rawLine = 0U;
  static uint8_t    ovIndex[768];
  static uint8_t    ovColour[768];
  static uint8_t    ovCoverage[768];
  static bool       ovValid = false;

  void configure(bool enabled, int machine)
  {
    if (dev && (!enabled || machine != devMachine)) {
      twodfx_emu_destroy(dev);
      dev = (twodfx_emu *) 0;
      devMachine = -1;
    }
    if (enabled && !dev) {
      dev = twodfx_emu_create(machine == 1 ? TWODFX_EMU_TVC
                                           : TWODFX_EMU_ENTERPRISE);
      if (dev)
        devMachine = machine;
    }
    ovValid = false;
  }

  bool isEnabled()
  {
    return (dev != (twodfx_emu *) 0);
  }

  void powerCycle()
  {
    if (dev)
      twodfx_emu_power_cycle(dev);
    ovValid = false;
  }

  void writePort(uint8_t port, uint8_t value)
  {
    if (!dev)
      return;
    if (port == 0xF8)
      twodfx_emu_write_f8(dev, value);
    else if (port == 0xF9)
      twodfx_emu_write_f9(dev, value);
  }

  uint8_t readStatus()
  {
    return (dev ? twodfx_emu_read_f8(dev) : uint8_t(0xFF));
  }

  void vsync()
  {
    if (!dev)
      return;
    twodfx_emu_vsync(dev);
    rawLine = 0U;
  }

  void line(const uint8_t *palette, int rawX0)
  {
    ovValid = false;
    if (!dev)
      return;
    twodfx_emu_hsync(dev, uint16_t(rawLine));
    size_t  shift = 0;
    if (rawX0 < 0) {
      // the display starts left of raw X 0: those pixels are not covered
      shift = size_t(-rawX0);
      std::memset(ovCoverage, 0, shift);
      rawX0 = 0;
    }
    size_t  n = twodfx_emu_overlay_raw_line(dev, unsigned(rawX0), rawLine,
                                            ovIndex + shift, ovCoverage + shift,
                                            768 - shift);
    rawLine++;
    if (!n)
      return;
    for (int x = 0; x < 768; x++)
      ovColour[x] = palette[ovIndex[x] & 15];
    ovValid = true;
  }

  bool irqActive()
  {
    return (dev && twodfx_emu_irq_asserted(dev));
  }

  const uint8_t *currentOverlay()
  {
    return (ovValid ? ovColour : (const uint8_t *) 0);
  }

  const uint8_t *currentCoverage()
  {
    return (ovValid ? ovCoverage : (const uint8_t *) 0);
  }

  void clearOverlay()
  {
    ovValid = false;
  }

}
