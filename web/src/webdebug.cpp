// Ep128web: debugger support, see webdebug.hpp

#include "webdebug.hpp"
#include "vm.hpp"
#include "z80.hpp"

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
  // cycles, video lines, raster breakpoint
  uint64_t halfCycles = 0;
  int64_t  epCycleUnits = 0;
  int64_t  *epCycleRemaining = 0;
  static int      vLine = 0;
  static uint32_t vFrame = 0;
  static int      rasterLine = -1;
  static uint64_t lineStartCycle = 0, frameStartCycle = 0, lastFrameCycles = 0;
  static int      lastFrameLines = 0;
  // interrupts: accepted, not seen by run() yet; the handlers running
  // (stack pointer after the return address was pushed, start cycle)
  static bool     irqPending = false;
  static uint64_t irqPendingCycle = 0;
  struct IrqEntry { uint16_t sp; uint64_t cycle; };
  static IrqEntry irqStack[64];
  static int      irqDepth = 0;
  // measuring
  static bool     measOn = false, measExclIrq = false;
  static int      measStartPC = -1, measStartSeg = -1, measStopPC = -1, measStopSeg = -1;
  static int      measDepth = 0, measIrqLevel = 0;
  static uint64_t measStartCycle = 0, measIrq = 0;
  static int      measCount = 0;
  static std::vector< double >  measSamples;
  // trace
  static const int  traceSize = 65536;
  static std::vector< uint16_t >  trace;
  static std::vector< double >    traceExt;       // segment, cycle
  static uint32_t tracePos = 0, traceCount = 0;
  static bool     traceOn = false;
  static int      traceLo = 0, traceHi = 0xFFFF;
  // script breakpoints
  bool (*scriptCallback)(int type, uint16_t addr, uint8_t value) = 0;
  static Ep128Emu::VirtualMachine *vmp = 0;
  static uint8_t  scrExec[8192], scrIoR[32], scrIoW[32];
  static int      scrExecCount = 0;
  // execution breakpoints at segment:offset addresses: a 16 kB bit map for
  // each segment that has one
  static std::vector< uint8_t >   segExec[256];
  static int      segExecCount = 0;

  static inline bool bit(const uint8_t *m, uint16_t a)
  {
    return bool(m[a >> 3] & (1 << (a & 7)));
  }

  // the segment in the page of 'pc' has an execution breakpoint there
  static bool segExecHit(uint16_t pc)
  {
    if (!vmp)
      return false;
    const std::vector< uint8_t >& m = segExec[vmp->getMemoryPage(pc >> 14)];
    return !m.empty() && bit(&m[0], pc & 0x3FFF);
  }

  static void updateActive()
  {
    active = (reason != RUNNING || bpCount > 0 || scrExecCount > 0 || segExecCount > 0 || pending != RUNNING ||
              skipOnce || stepInto || tempBreak >= 0 || histOn || profOn || traceOn || measOn);
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

  static uint8_t opcode(uint16_t pc)
  {
    return (vmp ? vmp->readMemory(pc, true) : 0);
  }

  static inline uint16_t curSP()
  {
    return uint16_t(static_cast< const Ep128Emu::VirtualMachine * >(vmp)->getZ80Registers().SP.W);
  }

  static inline bool segAt(uint16_t pc, int seg)
  {
    return (seg < 0 || (vmp && int(vmp->getMemoryPage(pc >> 14)) == seg));
  }

  static void measureStep(uint16_t pc)
  {
    uint64_t  now = getCycles();
    if (measExclIrq && vmp) {
      uint16_t  sp = curSP();
      // handlers that returned (the stack pointer is above the return
      // address pushed by the interrupt)
      while (irqDepth > 0 && sp > irqStack[irqDepth - 1].sp) {
        irqDepth--;
        if (measDepth > 0 && irqDepth == measIrqLevel)
          measIrq += now - irqStack[irqDepth].cycle;
      }
      if (irqPending) {
        irqPending = false;
        if (irqDepth < 64) {
          irqStack[irqDepth].sp = sp;
          irqStack[irqDepth].cycle = irqPendingCycle;
          irqDepth++;
        }
      }
    }
    irqPending = false;
    if (int(pc) == measStopPC && measDepth > 0 && segAt(pc, measStopSeg)) {
      if (measStartPC == measStopPC || --measDepth == 0) {
        measDepth = 0;
        if (measSamples.size() < size_t(measureMaxSamples) * 2U) {
          measSamples.push_back(double(measStartCycle));
          measSamples.push_back(double(now - measStartCycle - measIrq));
        }
        measCount++;
        if (measStartPC == measStopPC)
          goto start;               // this hit starts the next one
      }
      return;
    }
    if (int(pc) != measStartPC || !segAt(pc, measStartSeg))
      return;
  start:
    if (measDepth++ == 0) {
      measStartCycle = now;
      measIrq = 0;
      measIrqLevel = irqDepth;
    }
  }

  // the instruction at 'pc' runs
  static inline bool run(uint16_t pc)
  {
    if (measOn)
      measureStep(pc);
    if (histOn) {
      hist[histPos] = pc;
      histPos = (histPos + 1) & (histSize - 1);
      if (histCount < uint32_t(histSize))
        histCount++;
    }
    if (profOn)
      prof[pc]++;
    if (traceOn && vmp && int(pc) >= traceLo && int(pc) <= traceHi) {
      traceExt[size_t(tracePos) * 2U] = double(vmp->getMemoryPage(pc >> 14));
      traceExt[size_t(tracePos) * 2U + 1U] = double(getCycles());
      const Ep128::Z80_REGISTERS& r =
          static_cast< const Ep128Emu::VirtualMachine * >(vmp)->getZ80Registers();
      uint16_t  *e = &(trace[size_t(tracePos) * 8U]);
      e[0] = pc;
      e[1] = uint16_t(r.AF.W);
      e[2] = uint16_t(r.BC.W);
      e[3] = uint16_t(r.DE.W);
      e[4] = uint16_t(r.HL.W);
      e[5] = uint16_t(r.IX.W);
      e[6] = uint16_t(r.IY.W);
      e[7] = uint16_t(r.SP.W);
      tracePos = (tracePos + 1) & (traceSize - 1);
      if (traceCount < uint32_t(traceSize))
        traceCount++;
    }
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
    if (stepInto || int32_t(pc) == tempBreak) {
      // a script returning false keeps stepping (as in ep128emu)
      if (scriptCallback && !scriptCallback(3, pc, opcode(pc))) {
        stepInto = true;
        tempBreak = -1;
        return run(pc);
      }
      return stopAt(pc, STEP, 0, 0);
    }
    if (bit(bpBits, pc) || (scrExecCount && bit(scrExec, pc)) || (segExecCount && segExecHit(pc))) {
      if (scriptCallback && !scriptCallback(0, pc, opcode(pc)))
        return run(pc);
      return stopAt(pc, BREAKPOINT, 0, 0);
    }
    return run(pc);
  }

  void breakPointCallback(void *userData, int type, uint16_t addr,
                          uint8_t value)
  {
    // the breakpoint list of the machine has the watchpoints of the
    // debugger and of the script, and every port while the I/O log is on
    int     why = RUNNING;
    switch (type) {
    case 0: why = BREAKPOINT; break;    // script, segment:offset address
    case 1: why = MEM_READ; break;
    case 2: why = MEM_WRITE; break;
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
      if (bit(type == 5 ? ioR : ioW, addr & 0xFF) ||
          bit(type == 5 ? scrIoR : scrIoW, addr & 0xFF))
        why = (type == 5 ? IO_READ : IO_WRITE);
      break;
    default: return;                    // execution is checked here
    }
    if (why == RUNNING)
      return;
    if (reason != RUNNING || pending != RUNNING)
      return;
    if (scriptCallback && !scriptCallback(type, addr, value))
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

  void setBreakPointRange(uint16_t first, uint16_t last)
  {
    for (uint32_t a = first; a <= last; a++)
      setBreakPoint(uint16_t(a), true);
  }

  void setSegmentBreakPoint(uint8_t segment, uint16_t first, uint16_t last)
  {
    std::vector< uint8_t >& m = segExec[segment];
    if (m.empty())
      m.assign(2048, 0);
    for (uint32_t a = first & 0x3FFF; a <= uint32_t(last & 0x3FFF); a++) {
      uint8_t b = uint8_t(1 << (a & 7));
      if (!(m[a >> 3] & b)) {
        m[a >> 3] |= b;
        segExecCount++;
      }
    }
    updateActive();
  }

  void clearBreakPoints()
  {
    std::memset(bpBits, 0, sizeof(bpBits));
    bpCount = 0;
    for (int i = 0; i < 256; i++)
      std::vector< uint8_t >().swap(segExec[i]);
    segExecCount = 0;
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

  uint64_t getCycles()
  {
    if (epCycleRemaining)
      return uint64_t((epCycleUnits - *epCycleRemaining) >> 32);
    return halfCycles >> 1;
  }

  void videoLine()
  {
    vLine++;
    lineStartCycle = getCycles();
    if (vLine == rasterLine && reason == RUNNING && pending == RUNNING) {
      pending = RASTER;
      pendingAddr = uint16_t(vLine);
      pendingValue = 0;
      updateActive();
    }
  }

  void videoFrame()
  {
    uint64_t  now = getCycles();
    lastFrameLines = vLine;
    lastFrameCycles = now - frameStartCycle;
    frameStartCycle = now;
    lineStartCycle = now;
    vLine = 0;
    vFrame++;
    if (rasterLine == 0 && reason == RUNNING && pending == RUNNING) {
      pending = RASTER;
      pendingAddr = 0;
      pendingValue = 0;
      updateActive();
    }
  }

  int videoLineNumber()
  {
    return vLine;
  }

  uint32_t videoFrameNumber()
  {
    return vFrame;
  }

  void setRasterBreak(int n)
  {
    rasterLine = n;
  }

  void getBeam(double *out)
  {
    out[0] = double(vLine);
    out[1] = double(getCycles() - lineStartCycle);
    out[2] = double(lastFrameLines);
    out[3] = double(lastFrameCycles);
  }

  void getTiming(double *out)
  {
    uint64_t  now = getCycles();
    out[0] = double(now);
    out[1] = double(vLine);
    out[2] = double(vFrame);
    out[3] = double(now - lineStartCycle);
    out[4] = double(now - frameStartCycle);
    out[5] = double(lastFrameLines);
    out[6] = double(lastFrameCycles);
    out[7] = double(epCycleRemaining ? 0 : int(halfCycles & 1U));
  }

  static void   *tVar[2] = { 0, 0 };
  static size_t tVarSize[2] = { 0, 0 };

  void setTimingVars(void *p1, size_t n1, void *p2, size_t n2)
  {
    tVar[0] = p1;
    tVarSize[0] = n1;
    tVar[1] = p2;
    tVarSize[1] = n2;
  }

  void clearTimingVars(void *p1)
  {
    if (tVar[0] == p1) {
      tVar[0] = tVar[1] = 0;
      tVarSize[0] = tVarSize[1] = 0;
    }
  }

  int readTimingVars(uint8_t *out)
  {
    int     n = 0;
    for (int i = 0; i < 2; i++) {
      if (tVar[i] && n + int(tVarSize[i]) <= 16) {
        std::memcpy(out + n, tVar[i], tVarSize[i]);
        n += int(tVarSize[i]);
      }
    }
    return n;
  }

  void writeTimingVars(const uint8_t *in, int n)
  {
    int     k = 0;
    for (int i = 0; i < 2; i++) {
      if (tVar[i] && k + int(tVarSize[i]) <= n) {
        std::memcpy(tVar[i], in + k, tVarSize[i]);
        k += int(tVarSize[i]);
      }
    }
  }

  void setTiming(const double *in)
  {
    uint64_t  now = uint64_t(in[0]);
    if (epCycleRemaining)
      epCycleUnits = int64_t(now << 32) + *epCycleRemaining;
    else
      halfCycles = (now << 1) | uint64_t(int(in[7]) & 1);
    vLine = int(in[1]);
    vFrame = uint32_t(in[2]);
    lineStartCycle = now - uint64_t(in[3]);
    frameStartCycle = now - uint64_t(in[4]);
    lastFrameLines = int(in[5]);
    lastFrameCycles = uint64_t(in[6]);
  }

  void irqEnter()
  {
    if (measOn) {
      irqPending = true;
      irqPendingCycle = getCycles();
    }
  }

  void measureStart(int start, int startSeg, int stop, int stopSeg, bool excludeIrq)
  {
    measStartPC = start;
    measStartSeg = startSeg;
    measStopPC = stop;
    measStopSeg = stopSeg;
    measExclIrq = excludeIrq;
    measDepth = 0;
    measIrq = 0;
    measCount = 0;
    measSamples.clear();
    irqPending = false;
    irqDepth = 0;
    measOn = true;
    updateActive();
  }

  void measureStop()
  {
    measOn = false;
    measDepth = 0;
    updateActive();
  }

  int measureCount()
  {
    return measCount;
  }

  int measureKept()
  {
    return int(measSamples.size() / 2U);
  }

  const double *measureSamples()
  {
    if (measSamples.empty())
      measSamples.reserve(2);
    return measSamples.data();
  }

  void enableTrace(bool on)
  {
    if (on && trace.size() != size_t(traceSize) * 8U) {
      trace.assign(size_t(traceSize) * 8U, 0);
      traceExt.assign(size_t(traceSize) * 2U, 0.0);
    }
    if (on && !traceOn) {
      tracePos = 0;
      traceCount = 0;
    }
    traceOn = on;
    updateActive();
  }

  int getTrace(uint16_t *buf, int n)
  {
    if (n > int(traceCount))
      n = int(traceCount);
    for (int i = 0; i < n; i++) {
      const uint16_t  *e =
          &(trace[size_t((tracePos - uint32_t(n) + uint32_t(i)) & (traceSize - 1)) * 8U]);
      for (int j = 0; j < 8; j++)
        buf[i * 8 + j] = e[j];
    }
    return n;
  }

  int getTraceExt(double *buf, int n)
  {
    if (n > int(traceCount))
      n = int(traceCount);
    for (int i = 0; i < n; i++) {
      size_t  k = size_t((tracePos - uint32_t(n) + uint32_t(i)) & (traceSize - 1)) * 2U;
      buf[i * 2] = traceExt[k];
      buf[i * 2 + 1] = traceExt[k + 1];
    }
    return n;
  }

  void setTraceRange(int lo, int hi)
  {
    if (lo > hi) {
      lo = 0;
      hi = 0xFFFF;
    }
    traceLo = lo;
    traceHi = hi;
  }

  void setVM(void *vm)
  {
    vmp = reinterpret_cast< Ep128Emu::VirtualMachine * >(vm);
  }

  void scriptSetExec(uint16_t addr, bool enabled)
  {
    uint8_t m = uint8_t(1 << (addr & 7));
    bool    was = bool(scrExec[addr >> 3] & m);
    if (enabled == was)
      return;
    if (enabled)
      scrExec[addr >> 3] |= m;
    else
      scrExec[addr >> 3] &= uint8_t(~m);
    scrExecCount += (enabled ? 1 : -1);
    updateActive();
  }

  void scriptSetIO(uint8_t port, bool r, bool w)
  {
    uint8_t m = uint8_t(1 << (port & 7));
    scrIoR[port >> 3] = uint8_t(r ? (scrIoR[port >> 3] | m) : (scrIoR[port >> 3] & ~m));
    scrIoW[port >> 3] = uint8_t(w ? (scrIoW[port >> 3] | m) : (scrIoW[port >> 3] & ~m));
  }

  void scriptClearBreakPoints()
  {
    std::memset(scrExec, 0, sizeof(scrExec));
    std::memset(scrIoR, 0, sizeof(scrIoR));
    std::memset(scrIoW, 0, sizeof(scrIoW));
    scrExecCount = 0;
    updateActive();
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
