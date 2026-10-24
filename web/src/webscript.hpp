// Ep128web: the Lua debugger scripts of ep128emu (ep128emu/src/script.cpp)
//
// The script API is that of the desktop emulator (see its README):
// breakPointCallback(type, addr, value), setBreakPoint(), readMemory(),
// getPC(), mprint() and so on. The breakpoints of a script are kept here
// and added to those of the web debugger (main.cpp); execution breakpoints
// at CPU addresses stop before the instruction, like the debugger's own.

#ifndef EP128WEB_WEBSCRIPT_HPP
#define EP128WEB_WEBSCRIPT_HPP

#include "ep128emu.hpp"
#include "vm.hpp"
#include "script.hpp"

#include <string>
#include <vector>

class WebLuaScript : public Ep128Emu::LuaScript {
 public:
  WebLuaScript(Ep128Emu::VirtualMachine& vm_);
  virtual ~WebLuaScript();
  // runs a script (its breakpoint callback stays active)
  void run(const char *code);
  // disables the breakpoint callback
  void stop();
  bool hasCallback() const
  {
    return haveBreakPointCallback;
  }
  // the text printed (mprint, errors) since the last call
  std::string takeOutput();
  // memory and I/O breakpoints for the breakpoint list of the machine
  void addBreakPoints(Ep128Emu::BreakPointList& bpl) const;
  // called when the breakpoints of the script change
  static void (*breakPointsChanged)();
  virtual void errorCallback(const char *msg);
  virtual void messageCallback(const char *msg);
  virtual void scriptSetBreakPoint(const Ep128Emu::BreakPoint& bp,
                                   bool isEnabled);
  virtual void scriptClearBreakPoints();
 private:
  std::string output;
  std::vector< Ep128Emu::BreakPoint >  bps;
};

#endif
