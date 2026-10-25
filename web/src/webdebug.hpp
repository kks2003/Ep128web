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
  // video lines: called by the VMs for each line and at the vertical sync
  void videoLine();
  void videoFrame();
  // the current line counted from the vertical sync, frames so far
  int videoLineNumber();
  uint32_t videoFrameNumber();
  // raster breakpoint: stop at the start of video line 'n' (-1: none)
  void setRasterBreak(int n);

  // trace: the registers before each instruction (PC AF BC DE HL IX IY SP,
  // 8 words per entry), the last 'n' (oldest first) into 'buf'
  void enableTrace(bool on);
  int getTrace(uint16_t *buf, int n);

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
