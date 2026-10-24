// Ep128web: debugger support, see webdebug.hpp

#include "webdebug.hpp"

#include <cstring>

namespace WebDebug {

  bool active = false;
  bool resumeInner = false;

  static uint8_t  bpBits[8192];         // execution breakpoints, 1 bit/address
  static int      bpCount = 0;
  static int      reason = RUNNING;
  static uint16_t reasonPC = 0;
  static uint16_t reasonAddr = 0;
  static uint8_t  reasonValue = 0;
  static int      pending = RUNNING;    // stop requested at the next boundary
  static uint16_t pendingAddr = 0;
  static uint8_t  pendingValue = 0;
  static bool     skipOnce = false;     // the instruction stopped at runs
  static bool     stepInto = false;
  static int32_t  tempBreak = -1;

  static void updateActive()
  {
    active = (reason != RUNNING || bpCount > 0 || pending != RUNNING ||
              skipOnce || stepInto ||
              tempBreak >= 0);
  }

  static bool stopAt(uint16_t pc, int why, uint16_t addr, uint8_t value)
  {
    reason = why;
    reasonPC = pc;
    reasonAddr = addr;
    reasonValue = value;
    pending = RUNNING;
    stepInto = false;
    tempBreak = -1;
    updateActive();
    return true;
  }

  bool checkBreak(uint16_t pc)
  {
    if (reason != RUNNING)
      return true;                      // stays stopped
    if (pending != RUNNING)
      return stopAt(pc, pending, pendingAddr, pendingValue);
    if (skipOnce) {
      skipOnce = false;
      updateActive();
      return false;
    }
    if (stepInto || int32_t(pc) == tempBreak)
      return stopAt(pc, STEP, 0, 0);
    if (bpBits[pc >> 3] & (1 << (pc & 7)))
      return stopAt(pc, BREAKPOINT, 0, 0);
    return false;
  }

  void breakPointCallback(void *userData, int type, uint16_t addr,
                          uint8_t value)
  {
    (void) userData;
    int     why = RUNNING;
    switch (type) {
    case 1: why = MEM_READ; break;
    case 2: why = MEM_WRITE; break;
    case 5: why = IO_READ; break;
    case 6: why = IO_WRITE; break;
    default: return;                    // execution is checked here
    }
    if (reason != RUNNING || pending != RUNNING)
      return;
    pending = why;
    pendingAddr = addr;
    pendingValue = value;
    updateActive();
  }

  int stopReason()
  {
    return reason;
  }

  uint16_t stopPC()
  {
    return reasonPC;
  }

  uint16_t stopAddr()
  {
    return reasonAddr;
  }

  uint8_t stopValue()
  {
    return reasonValue;
  }

  void resume(bool stepInto_, int32_t tempBreak_)
  {
    // the instruction at the stop address is executed without a check
    skipOnce = (reason != RUNNING);
    reason = RUNNING;
    pending = RUNNING;
    stepInto = stepInto_;
    tempBreak = tempBreak_;
    updateActive();
  }

  void pause()
  {
    if (reason == RUNNING) {
      pending = PAUSED;
      pendingAddr = 0;
      pendingValue = 0;
      updateActive();
    }
  }

  void clearStop()
  {
    reason = RUNNING;
    pending = RUNNING;
    skipOnce = false;
    stepInto = false;
    tempBreak = -1;
    resumeInner = false;
    updateActive();
  }

  void setBreakPoint(uint16_t addr, bool enabled)
  {
    uint8_t m = uint8_t(1 << (addr & 7));
    bool    was = bool(bpBits[addr >> 3] & m);
    if (enabled == was)
      return;
    if (enabled)
      bpBits[addr >> 3] |= m;
    else
      bpBits[addr >> 3] &= uint8_t(~m);
    bpCount += (enabled ? 1 : -1);
    updateActive();
  }

  void clearBreakPoints()
  {
    std::memset(bpBits, 0, sizeof(bpBits));
    bpCount = 0;
    updateActive();
  }

}
