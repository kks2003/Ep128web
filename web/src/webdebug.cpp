// Ep128web: debugger support, see webdebug.hpp

#include "webdebug.hpp"
#include "vm.hpp"

#include <cstring>
#include <vector>
#include <algorithm>

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
  // watchpoints that stop the machine (the ep128emu breakpoints also report
  // the accesses of the I/O log)
  static uint8_t  memR[8192], memW[8192], ioR[32], ioW[32];
  // execution history, profiler, I/O log
  static const int  histSize = 16384;
  static uint16_t hist[histSize];
  static uint32_t histPos = 0, histCount = 0;
  static bool     histOn = false;
  static std::vector< uint32_t >  prof;
  static bool     profOn = false;
  static const int  ioLogSize = 4096;
  static IOLogEntry ioLog[ioLogSize];
  static uint32_t ioLogPos = 0, ioLogCount = 0;
  static bool     ioLogOn = false;

  static inline bool bit(const uint8_t *m, uint16_t a)
  {
    return bool(m[a >> 3] & (1 << (a & 7)));
  }

  static void updateActive()
  {
    active = (reason != RUNNING || bpCount > 0 || pending != RUNNING ||
              skipOnce || stepInto || tempBreak >= 0 || histOn || profOn);
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

  // the instruction at 'pc' runs
  static inline bool run(uint16_t pc)
  {
    if (histOn) {
      hist[histPos] = pc;
      histPos = (histPos + 1) & (histSize - 1);
      if (histCount < uint32_t(histSize))
        histCount++;
    }
    if (profOn)
      prof[pc]++;
    return false;
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
      return run(pc);
    }
    if (stepInto || int32_t(pc) == tempBreak)
      return stopAt(pc, STEP, 0, 0);
    if (bit(bpBits, pc))
      return stopAt(pc, BREAKPOINT, 0, 0);
    return run(pc);
  }

  void breakPointCallback(void *userData, int type, uint16_t addr,
                          uint8_t value)
  {
    int     why = RUNNING;
    switch (type) {
    case 1: if (bit(memR, addr)) why = MEM_READ; break;
    case 2: if (bit(memW, addr)) why = MEM_WRITE; break;
    case 5:
    case 6:
      if (ioLogOn) {
        IOLogEntry& e = ioLog[ioLogPos];
        e.pc = (userData ? reinterpret_cast< Ep128Emu::VirtualMachine * >(
                               userData)->getProgramCounter() : 0);
        e.port = addr;
        e.value = value;
        e.isWrite = uint8_t(type == 6);
        ioLogPos = (ioLogPos + 1) & (ioLogSize - 1);
        if (ioLogCount < uint32_t(ioLogSize))
          ioLogCount++;
      }
      if (bit(type == 5 ? ioR : ioW, addr & 0xFF))
        why = (type == 5 ? IO_READ : IO_WRITE);
      break;
    default: return;                    // execution is checked here
    }
    if (why == RUNNING)
      return;
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

  void setWatchPoint(bool isIO, uint16_t addr, bool r, bool w)
  {
    if (isIO)
      addr = addr & 0xFF;
    uint8_t m = uint8_t(1 << (addr & 7));
    if (r)
      (isIO ? ioR : memR)[addr >> 3] |= m;
    if (w)
      (isIO ? ioW : memW)[addr >> 3] |= m;
  }

  void clearWatchPoints()
  {
    std::memset(memR, 0, sizeof(memR));
    std::memset(memW, 0, sizeof(memW));
    std::memset(ioR, 0, sizeof(ioR));
    std::memset(ioW, 0, sizeof(ioW));
  }

  void enableHistory(bool on)
  {
    histOn = on;
    updateActive();
  }

  bool historyEnabled()
  {
    return histOn;
  }

  int getHistory(uint16_t *buf, int n)
  {
    if (n > int(histCount))
      n = int(histCount);
    for (int i = 0; i < n; i++)
      buf[i] = hist[(histPos - uint32_t(n) + uint32_t(i)) & (histSize - 1)];
    return n;
  }

  void enableProfiler(bool on)
  {
    if (on && prof.size() != 65536)
      prof.assign(65536, 0U);
    profOn = on;
    updateActive();
  }

  bool profilerEnabled()
  {
    return profOn;
  }

  void clearProfiler()
  {
    if (prof.size() == 65536)
      std::fill(prof.begin(), prof.end(), 0U);
  }

  const uint32_t *profilerCounts()
  {
    if (prof.size() != 65536)
      prof.assign(65536, 0U);
    return &(prof[0]);
  }

  void enableIOLog(bool on)
  {
    ioLogOn = on;
  }

  bool ioLogEnabled()
  {
    return ioLogOn;
  }

  void clearIOLog()
  {
    ioLogPos = 0;
    ioLogCount = 0;
  }

  int getIOLog(IOLogEntry *buf, int n)
  {
    if (n > int(ioLogCount))
      n = int(ioLogCount);
    for (int i = 0; i < n; i++)
      buf[i] = ioLog[(ioLogPos - uint32_t(n) + uint32_t(i)) & (ioLogSize - 1)];
    return n;
  }

}
