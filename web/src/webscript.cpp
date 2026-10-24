// Ep128web: the Lua debugger scripts of ep128emu, see webscript.hpp

#include "webscript.hpp"
#include "webdebug.hpp"

void (*WebLuaScript::breakPointsChanged)() = 0;

static WebLuaScript *currentScript = 0;

// WebDebug calls this at the breakpoints while a callback is defined
static bool scriptBreakPoint(int type, uint16_t addr, uint8_t value)
{
  if (!currentScript)
    return true;
  bool    r = currentScript->runBreakPointCallback(type, addr, value);
  if (currentScript && !currentScript->hasCallback())
    WebDebug::scriptCallback = 0;       // an error stopped the script
  return r;
}

WebLuaScript::WebLuaScript(Ep128Emu::VirtualMachine& vm_)
  : Ep128Emu::LuaScript(vm_)
{
  currentScript = this;
}

WebLuaScript::~WebLuaScript()
{
  WebDebug::scriptCallback = 0;
  WebDebug::scriptClearBreakPoints();
  if (currentScript == this)
    currentScript = 0;
  closeScript();
}

void WebLuaScript::run(const char *code)
{
  WebDebug::scriptCallback = 0;
  loadScript(code);
  if (hasCallback())
    WebDebug::scriptCallback = &scriptBreakPoint;
}

void WebLuaScript::stop()
{
  closeScript();
  WebDebug::scriptCallback = 0;
}

std::string WebLuaScript::takeOutput()
{
  std::string s;
  s.swap(output);
  return s;
}

void WebLuaScript::addBreakPoints(Ep128Emu::BreakPointList& bpl) const
{
  for (size_t i = 0; i < bps.size(); i++) {
    const Ep128Emu::BreakPoint& bp = bps[i];
    if (bp.isIO())
      bpl.addIOBreakPoint(bp.addr(), bp.isRead(), bp.isWrite(), bp.priority());
    else if (bp.haveSegment())
      bpl.addMemoryBreakPoint(bp.segment(), bp.addr(), bp.isRead(),
                              bp.isWrite(), bp.isExecute(), bp.isIgnore(),
                              bp.priority());
    else if (bp.isRead() || bp.isWrite())
      bpl.addMemoryBreakPoint(bp.addr(), bp.isRead(), bp.isWrite(), false,
                              bp.isIgnore(), bp.priority());
  }
}

void WebLuaScript::errorCallback(const char *msg)
{
  output += "Hiba: ";
  output += (msg ? msg : "?");
  output += '\n';
}

void WebLuaScript::messageCallback(const char *msg)
{
  output += (msg ? msg : "");
  output += '\n';
}

void WebLuaScript::scriptSetBreakPoint(const Ep128Emu::BreakPoint& bp,
                                       bool isEnabled)
{
  // replaces an earlier breakpoint at the same address
  for (size_t i = 0; i < bps.size(); ) {
    if (bps[i].isIO() == bp.isIO() && bps[i].haveSegment() == bp.haveSegment() &&
        bps[i].segment() == bp.segment() && bps[i].addr() == bp.addr())
      bps.erase(bps.begin() + i);
    else
      i++;
  }
  if (isEnabled)
    bps.push_back(bp);
  if (bp.isIO()) {
    WebDebug::scriptSetIO(uint8_t(bp.addr()), isEnabled && bp.isRead(),
                          isEnabled && bp.isWrite());
  }
  else if (!bp.haveSegment()) {
    // execution: checked before the instruction, like the debugger does
    WebDebug::scriptSetExec(bp.addr(), isEnabled && bp.isExecute());
  }
  if (breakPointsChanged)
    breakPointsChanged();
}

void WebLuaScript::scriptClearBreakPoints()
{
  bps.clear();
  WebDebug::scriptClearBreakPoints();
  if (breakPointsChanged)
    breakPointsChanged();
}
