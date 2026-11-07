// Ep128web: debugger support for the single threaded web build
//
// The desktop ep128emu stops the emulation thread inside the breakpoint
// callback while its debugger window is in use. In the browser everything
// runs on one thread, so the VMs (patches/zzzzz-webdebug.patch) ask
// checkBreak() before each Z80 instruction while 'active' is set; when it
// returns true, the VM's run() returns at that instruction boundary, keeping
// the remaining time, and continues from there when it is run again.
//
// Execution breakpoints and stepping are handled here (CPU addresses);
// memory and I/O watchpoints use ep128emu's own breakpoints, whose callback
// requests a stop at the next instruction boundary (after the instruction
// that made the access).

#ifndef EP128WEB_WEBDEBUG_HPP
#define EP128WEB_WEBDEBUG_HPP

#include <stdint.h>
#include <stddef.h>
#include <vector>

namespace WebDebug {

  enum StopReason {
    RUNNING = 0,
    BREAKPOINT = 1,             // execution breakpoint
    STEP = 2,                   // step, step over, run to cursor finished
    PAUSED = 3,                 // stopped by the user
    MEM_READ = 4,               // watchpoints
    MEM_WRITE = 5,
    IO_READ = 6,
    IO_WRITE = 7,
    RASTER = 8                  // raster breakpoint (video line)
  };

  // something to check at instruction boundaries
  extern bool active;
  // Enterprise: run() returned inside a NICK slot, continue there
  extern bool resumeInner;

  // called before each instruction while 'active' is set; true: stop
  bool checkBreak(uint16_t pc);
  // ep128emu breakpoint callback (memory and I/O watchpoints)
  void breakPointCallback(void *userData, int type, uint16_t addr,
                          uint8_t value);

  int stopReason();
  uint16_t stopPC();
  uint16_t stopAddr();          // watchpoint: address accessed
  uint8_t stopValue();          // watchpoint: value read or written
  // continue running; 'stepInto': stop before the next instruction;
  // 'tempBreak' >= 0: stop at that address (step over, run to cursor)
  void resume(bool stepInto, int32_t tempBreak);
  // stop at the next instruction boundary
  void pause();
  // forget the stop and the pending state (new machine, reset, snapshot)
  void clearStop();

  void setBreakPoint(uint16_t addr, bool enabled);
  // execution breakpoints on an address range (CPU addresses), and on
  // segment:offset addresses (the segment paged in at the PC)
  void setBreakPointRange(uint16_t first, uint16_t last);
  void setSegmentBreakPoint(uint8_t segment, uint16_t first, uint16_t last);
  void clearBreakPoints();

  // watchpoints that stop the machine (memory: CPU address, I/O: port)
  void setWatchPoint(bool isIO, uint16_t addr, bool r, bool w);
  void clearWatchPoints();

  // execution history: the PC of the last instructions run
  void enableHistory(bool on);
  bool historyEnabled();
  // the last 'n' PCs (oldest first) into 'buf'; returns their number
  int getHistory(uint16_t *buf, int n);

  // profiler: instructions run at each address
  void enableProfiler(bool on);
  bool profilerEnabled();
  void clearProfiler();
  const uint32_t *profilerCounts();     // 65536 counters

  // CPU cycles (T-states with the wait states), counted by the VMs
  // (patches/zzzzz-webdebug.patch): the TVC adds its half cycles; the
  // Enterprise adds the cycles given to the CPU (2^-32 units), of which
  // *epCycleRemaining are not used yet
  extern uint64_t halfCycles;
  extern int64_t  epCycleUnits;
  extern int64_t  *epCycleRemaining;
  uint64_t getCycles();
  // the wait states among them (video memory, Enterprise port BFh): added
  // by the VMs, TVC: half cycles, Enterprise: 2^-32 cycles
  extern int64_t  waitRaw;
  double getWaitCycles();

  // cycle profiler: the cycles (and the wait states among them) of every
  // instruction run, by segment, page and offset; the cycles from one
  // instruction to the next belong to the first (an interrupt's acceptance
  // to the interrupted instruction)
  void cycleProfileStart();
  void cycleProfileStop();
  // the addresses run: 5 doubles each (segment, CPU address, instructions,
  // cycles, wait cycles); returns their number
  int cycleProfileGet(std::vector< double >& out);
  // video lines: called by the VMs for each line and at the vertical sync
  void videoLine();
  void videoFrame();
  // the current line counted from the vertical sync, frames so far
  int videoLineNumber();
  uint32_t videoFrameNumber();
  // raster breakpoint: stop at the start of video line 'n' (-1: none)
  void setRasterBreak(int n);
  // the beam: [0] video line, [1] cycles since the start of the line,
  // [2] lines and [3] cycles of the last whole frame
  void getBeam(double *out);
  // the cycle and video counters (7 doubles), to save and restore them with
  // a snapshot: cycles, line, frame, cycles since the line and the frame
  // started, lines and cycles of the last frame
  void getTiming(double *out);
  void setTiming(const double *in);
  // the VM's time left over from the last run (not in its snapshots): two
  // variables, registered by the VM (patches/zzzzz-webdebug.patch); read /
  // written as bytes (at most 16) for ep.snapshot() / ep.restore()
  void setTimingVars(void *p1, size_t n1, void *p2, size_t n2);
  void clearTimingVars(void *p1);
  int readTimingVars(uint8_t *out);
  void writeTimingVars(const uint8_t *in, int n);

  // the VMs call this when the Z80 accepts a maskable interrupt (before the
  // interrupt cycles: the cycle count is that of its start)
  void irqEnter();

  // measuring: the cycles from the instruction at 'start' to the one at
  // 'stop' (CPU addresses; segment >= 0: only with that segment paged in
  // there). Nested starts count as the outermost pair; start == stop
  // measures from one hit to the next. excludeIrq: the time of the
  // interrupts (from their acceptance to the return of the handler) taken
  // while measuring is not counted.
  void measureStart(int start, int startSeg, int stop, int stopSeg, bool excludeIrq);
  void measureStop();
  // the number of samples (all of them; at most measureMaxSamples are kept)
  // and the kept samples: start cycle, cycles (two doubles each)
  const int measureMaxSamples = 100000;
  int measureCount();
  int measureKept();
  const double *measureSamples();

  // trace: the registers before each instruction (PC AF BC DE HL IX IY SP,
  // 8 words per entry), the last 'n' (oldest first) into 'buf'
  void enableTrace(bool on);
  int getTrace(uint16_t *buf, int n);
  // the segment at the PC and the cycle count of the same entries (two
  // doubles each)
  int getTraceExt(double *buf, int n);
  // record only the instructions at lo..hi (CPU addresses; lo > hi: all)
  void setTraceRange(int lo, int hi);

  // debugger scripts (the Lua scripts of ep128emu, web/src/webscript.cpp)
  // the breakpoint callback of the running script (type: 0 execution,
  // 1 / 2 memory read / write, 3 step, 5 / 6 I/O read / write); false: no stop
  extern bool (*scriptCallback)(int type, uint16_t addr, uint8_t value);
  // the machine, for reading the opcode passed to the callback
  void setVM(void *vm);
  // execution breakpoints (CPU address) and I/O watchpoints of the script
  void scriptSetExec(uint16_t addr, bool enabled);
  void scriptSetIO(uint8_t port, bool r, bool w);
  void scriptClearBreakPoints();

  // I/O log: every IN / OUT with the PC (all ports are watched for it)
  struct IOLogEntry {
    uint16_t  pc;
    uint16_t  port;
    uint8_t   value;
    uint8_t   isWrite;
  };
  void enableIOLog(bool on);
  bool ioLogEnabled();
  void clearIOLog();
  int getIOLog(IOLogEntry *buf, int n);

}

#endif
