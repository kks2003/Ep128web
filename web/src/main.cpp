// ep128web -- WebAssembly front end for the ep128emu Enterprise 128 and
// Videoton TVC emulator
// https://github.com/istvan-v/ep128emu/
//
// The emulated machine (Z80, NICK, DAVE, WD177x, ...) is the unmodified
// ep128emu core; this file only replaces the FLTK / PortAudio front end with
// a small C API that is driven from JavaScript (web/shell/ep128.js).
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.

#include "ep128emu.hpp"
#include "display.hpp"
#include "soundio.hpp"
#include "fileio.hpp"
#include "vm.hpp"
#include "ep128vm.hpp"
#include "nick.hpp"
#include "tvc64vm.hpp"
#include "tvc_soundcards.hpp"
#include "tvc256kpp.hpp"
#include "tvc256kpp_fs.hpp"
#include "card/sprite.h"
#include "twodfx_bridge.hpp"
#include "webdebug.hpp"
#include "webscript.hpp"
#include "bplist.hpp"
#include "debuglib.hpp"
extern "C" {
#include "twodfx_emu.h"
}
#include "decompm2.hpp"

#include <emscripten/emscripten.h>
#include <cmath>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace {

  const int frameWidth = 768;
  const int frameHeight = 288;

  // --------------------------------------------------------------------------

  class WebDisplay : public Ep128Emu::VideoDisplay {
   private:
    DisplayParameters displayParameters;
    uint32_t  palette[256];
    std::vector< uint32_t > backBuffer;
    std::vector< uint32_t > frontBuffer;
    int       curLine;
    int       vsyncCnt;
    bool      vsyncState;
    bool      oddFrame;
    uint32_t  frameCount;
    unsigned char lineBuf[frameWidth + 16];
    // ----------------
    void updatePalette()
    {
      for (int i = 0; i < 256; i++) {
        float   r = float(i) / 255.0f;
        float   g = r;
        float   b = r;
        if (displayParameters.indexToRGBFunc)
          displayParameters.indexToRGBFunc(uint8_t(i), r, g, b);
        displayParameters.applyColorCorrection(r, g, b);
        int ri = int(r * 255.0f + 0.5f);
        int gi = int(g * 255.0f + 0.5f);
        int bi = int(b * 255.0f + 0.5f);
        ri = (ri < 0 ? 0 : (ri > 255 ? 255 : ri));
        gi = (gi < 0 ? 0 : (gi > 255 ? 255 : gi));
        bi = (bi < 0 ? 0 : (bi > 255 ? 255 : bi));
        // little endian RGBA, as expected by canvas ImageData
        palette[i] = 0xFF000000U | (uint32_t(bi) << 16) | (uint32_t(gi) << 8)
                     | uint32_t(ri);
      }
    }
    // Decodes the compressed line format documented in display.hpp
    // (adapted from FLTKDisplay_::decodeLine() in ep128emu's fldisp.cpp).
    void decodeLine(unsigned char *outBuf, const unsigned char *bufp)
    {
      unsigned char *endp = outBuf + frameWidth;
      do {
        unsigned char c0, c1, b;
        switch (bufp[0]) {
        case 0x00:
          std::memset(outBuf, 0, 16);
          bufp += 1;
          break;
        case 0x01:
          std::memset(outBuf, bufp[1], 16);
          bufp += 2;
          break;
        case 0x02:
          std::memset(outBuf, bufp[1], 8);
          std::memset(outBuf + 8, bufp[2], 8);
          bufp += 3;
          break;
        case 0x03:
          c0 = bufp[1];
          c1 = bufp[2];
          b = bufp[3];
          for (int i = 0; i < 8; i++)
            outBuf[i * 2] = outBuf[i * 2 + 1] = ((b << i) & 0x80) ? c1 : c0;
          bufp += 4;
          break;
        case 0x04:
          for (int i = 0; i < 4; i++)
            std::memset(outBuf + i * 4, bufp[i + 1], 4);
          bufp += 5;
          break;
        case 0x06:
          for (int j = 0; j < 2; j++) {
            c0 = bufp[j * 3 + 1];
            c1 = bufp[j * 3 + 2];
            b = bufp[j * 3 + 3];
            for (int i = 0; i < 8; i++)
              outBuf[j * 8 + i] = ((b << i) & 0x80) ? c1 : c0;
          }
          bufp += 7;
          break;
        case 0x08:
          for (int i = 0; i < 8; i++)
            outBuf[i * 2] = outBuf[i * 2 + 1] = bufp[i + 1];
          bufp += 9;
          break;
        default:                        // invalid flag byte
          std::memset(outBuf, 0, size_t(endp - outBuf));
          return;
        }
        outBuf += 16;
      } while (outBuf < endp);
    }
    void frameDone()
    {
      frontBuffer = backBuffer;
      frameCount++;
    }
   public:
    WebDisplay()
      : VideoDisplay(),
        backBuffer(size_t(frameWidth * frameHeight), 0xFF000000U),
        frontBuffer(size_t(frameWidth * frameHeight), 0xFF000000U),
        curLine(0),
        vsyncCnt(0),
        vsyncState(false),
        oddFrame(false),
        frameCount(0U)
    {
      updatePalette();
    }
    virtual ~WebDisplay()
    {
    }
    virtual void setDisplayParameters(const DisplayParameters& dp)
    {
      displayParameters = dp;
      updatePalette();
    }
    virtual const DisplayParameters& getDisplayParameters() const
    {
      return displayParameters;
    }
    // Line counting / vsync logic follows FLTKDisplay_::drawLine().
    virtual void drawLine(const uint8_t *buf, size_t nBytes)
    {
      (void) nBytes;
      // curLine counts interlaced lines (0 to 577); fold the two fields
      // into one progressive 768x288 image
      int   y = ((curLine + 1) >> 1) - 1;
      if (y >= 0 && y < frameHeight) {
        decodeLine(&(lineBuf[0]), buf);
        // TVC256k++ card: its overlay replaces the TVC's pixels
        const uint8_t *ov = TVC256kpp::currentOverlay();
        if (ov) {
          for (int x = 0; x < frameWidth && x < 768; x++) {
            if (ov[x] != 0xFF)
              lineBuf[x] = ov[x];
          }
        }
        // 2dfx card: its covered pixels replace the machine's pixels
        const uint8_t *fx = TwoDfx::currentOverlay();
        if (fx) {
          const uint8_t *cov = TwoDfx::currentCoverage();
          for (int x = 0; x < frameWidth && x < 768; x++) {
            if (cov[x])
              lineBuf[x] = fx[x];
          }
        }
        uint32_t  *p = &(backBuffer[size_t(y) * size_t(frameWidth)]);
        for (int x = 0; x < frameWidth; x++)
          p[x] = palette[lineBuf[x]];
      }
      if (vsyncCnt != 0) {
        curLine += 2;
        if (vsyncCnt >= (EP128EMU_VSYNC_MIN_LINES + 2 - EP128EMU_VSYNC_OFFSET) &&
            (vsyncState || vsyncCnt >= (EP128EMU_VSYNC_MAX_LINES
                                        + 2 - EP128EMU_VSYNC_OFFSET))) {
          vsyncCnt = 2 - EP128EMU_VSYNC_OFFSET;
        }
        vsyncCnt++;
      }
      else {
        curLine = (oddFrame ? -1 : 0);
        vsyncCnt++;
        oddFrame = false;
        frameDone();
      }
    }
    virtual void vsyncStateChange(bool newState, unsigned int currentSlot_)
    {
      vsyncState = newState;
      if (newState &&
          vsyncCnt >= (EP128EMU_VSYNC_MIN_LINES + 2 - EP128EMU_VSYNC_OFFSET)) {
        vsyncCnt = 2 - EP128EMU_VSYNC_OFFSET;
        oddFrame = (currentSlot_ >= 20U && currentSlot_ < 48U);
      }
    }
    inline const uint32_t *getFrameBuffer() const
    {
      return &(frontBuffer.front());
    }
    inline uint32_t getFrameCount() const
    {
      return frameCount;
    }
  };

  // --------------------------------------------------------------------------

  // Collects stereo float samples; JavaScript drains the buffer after each
  // call to ep_run() and forwards it to an AudioWorklet.
  class WebAudioOutput : public Ep128Emu::AudioOutput {
   private:
    std::vector< float >  buf;
    size_t  nFrames;
   public:
    WebAudioOutput()
      : AudioOutput(),
        buf(size_t(48000 * 2), 0.0f),
        nFrames(0)
    {
    }
    virtual ~WebAudioOutput()
    {
    }
    virtual void sendAudioData(const int16_t *inBuf, size_t nFrames_)
    {
      for (size_t i = 0; i < nFrames_; i++) {
        if (nFrames >= (buf.size() >> 1))
          return;               // JavaScript is not reading the buffer
        buf[nFrames * 2] = float(inBuf[i * 2]) * (1.0f / 32768.0f);
        buf[nFrames * 2 + 1] = float(inBuf[i * 2 + 1]) * (1.0f / 32768.0f);
        nFrames++;
      }
    }
    inline const float *getBuffer() const
    {
      return &(buf.front());
    }
    inline size_t getFrameCount() const
    {
      return nFrames;
    }
    inline void clear()
    {
      nFrames = 0;
    }
  };

  // --------------------------------------------------------------------------

  WebDisplay      *display = (WebDisplay *) 0;
  WebAudioOutput  *audioOutput = (WebAudioOutput *) 0;
  Ep128Emu::VirtualMachine  *vm = (Ep128Emu::VirtualMachine *) 0;
  int             machineType = -1;
  std::string     lastError;
  // TVC: card in each expansion slot (TVC64VM::SLOT_*), as in ep128emu by
  // default: VT-DOS in slot 0, FILE: in slot 1
  int             tvcSlotCards[4] = {
    TVC64::TVC64VM::SLOT_VTDOS, TVC64::TVC64VM::SLOT_FILEIO,
    TVC64::TVC64VM::SLOT_EMPTY, TVC64::TVC64VM::SLOT_EMPTY
  };
  uint8_t         tvcJoy3State = 0xFF;
  uint8_t         tvcJoy4State = 0xFF;

  int handleException()
  {
    try {
      throw;
    }
    catch (std::exception& e) {
      lastError = e.what();
    }
    catch (...) {
      lastError = "unknown error";
    }
    return -1;
  }

}       // namespace

// ----------------------------------------------------------------------------
// C API used by ep128.js; functions returning int return 0 on success and -1
// on error (the message can be queried with ep_last_error())

extern "C" {

// debugger: memory and I/O watchpoints, set on each new machine
static Ep128Emu::BreakPointList debugWatchPoints;

// the Lua script of the debugger (made for the current machine)
static WebLuaScript *luaScript = (WebLuaScript *) 0;

static void applyDebugWatchPoints()
{
  if (!vm)
    return;
  vm->clearBreakPoints();
  Ep128Emu::BreakPointList  bpl(debugWatchPoints);
  if (luaScript)
    luaScript->addBreakPoints(bpl);
  if (WebDebug::ioLogEnabled()) {
    // the I/O log sees the accesses through breakpoints on every port
    for (int i = 0; i < 256; i++)
      bpl.addIOBreakPoint(uint16_t(i), true, true, 0);
  }
  vm->setBreakPoints(bpl);
  vm->setBreakPointPriorityThreshold(0);
  vm->setBreakPointCallback(&WebDebug::breakPointCallback, (void *) vm);
}

// 2dfx card (Enterprise and TVC), on ports F8h, F9h
static bool twoDfxWanted = false;

EMSCRIPTEN_KEEPALIVE void ep_set_2dfx(int enabled)
{
  twoDfxWanted = (enabled != 0);
  TwoDfx::configure(twoDfxWanted, machineType);
}

EMSCRIPTEN_KEEPALIVE const char *ep_last_error()
{
  return lastError.c_str();
}

// machine type 0: Enterprise 128, 1: Videoton TVC
EMSCRIPTEN_KEEPALIVE int ep_set_machine_type(int type)
{
  try {
    if (type == machineType && vm)
      return 0;
    if (luaScript) {
      delete luaScript;                 // it belongs to the old machine
      luaScript = (WebLuaScript *) 0;
    }
    if (vm) {
      delete vm;
      vm = (Ep128Emu::VirtualMachine *) 0;
    }
    machineType = -1;
    if (type == 1) {
      // clock frequencies as set by ep128emu's EmulatorConfiguration for TVC
      TVC64::TVC64VM *tvc = new TVC64::TVC64VM(*display, *audioOutput);
      tvc->setCPUFrequency(3125000);
      tvc->setVideoFrequency(1562500);
      tvc->setSoundClockFrequency(390625);
      for (int i = 0; i < 4; i++)
        tvc->setSlotCard(i, tvcSlotCards[i]);
      tvc->setExtJoyState(0, tvcJoy3State);
      tvc->setExtJoyState(1, tvcJoy4State);
      vm = tvc;
    }
    else {
      vm = new Ep128::Ep128VM(*display, *audioOutput);
      vm->setCPUFrequency(4000000);
      vm->setVideoFrequency(889846);
      vm->setSoundClockFrequency(500000);
    }
    machineType = (type == 1 ? 1 : 0);
    WebDebug::setVM(vm);
    WebDebug::clearStop();              // a new machine runs
    applyDebugWatchPoints();
    TwoDfx::configure(twoDfxWanted, machineType);
    vm->setEnableMemoryTimingEmulation(true);
    vm->setAudioOutputHighQuality(true);
    vm->setEnableDisplay(true);
    vm->setEnableAudioOutput(true);
    vm->setWorkingDirectory("/files");
    vm->setEnableFileIO(true);
    vm->setDefaultTapeSampleRate(48000L);
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_init(int sampleRate)
{
  try {
    display = new WebDisplay();
    audioOutput = new WebAudioOutput();
    audioOutput->setParameters(0, float(sampleRate));
  }
  catch (...) {
    return handleException();
  }
  return ep_set_machine_type(0);
}

EMSCRIPTEN_KEEPALIVE void ep_set_sample_rate(int sampleRate)
{
  audioOutput->setParameters(0, float(sampleRate));
}

EMSCRIPTEN_KEEPALIVE int ep_reset_memory(int ramKB)
{
  try {
    vm->resetMemoryConfiguration(size_t(ramKB));
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_load_rom(int segment, const char *fileName,
                                     int offset)
{
  try {
    vm->loadROMSegment(uint8_t(segment), fileName, size_t(offset));
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_reset(int isColdReset)
{
  try {
    vm->reset(isColdReset != 0);
    WebDebug::clearStop();              // the machine starts again
    // the machine's RESET line is wired to the 2dfx microcontroller's reset
    // pin: a warm reset restarts the card just like switching it on
    TwoDfx::powerCycle();
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_run(int microseconds)
{
  try {
    if (WebDebug::stopReason() != WebDebug::RUNNING)
      return 0;                         // stopped in the debugger
    vm->run(size_t(microseconds));
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE void ep_set_key(int keyCode, int isPressed)
{
  vm->setKeyboardState(keyCode, isPressed != 0);
}

EMSCRIPTEN_KEEPALIVE void ep_set_mouse(int dX, int dY, int buttons, int wheel)
{
  if (machineType == 1) {
    // TVC: the TVC256k++ card's USB mouse (buttons: 1 left, 2 middle, 4 right)
    TVC256kpp::mouseInput(dX, dY, buttons);
    return;
  }
  vm->setMouseState(int8_t(dX), int8_t(dY), uint8_t(buttons), uint8_t(wheel));
}

EMSCRIPTEN_KEEPALIVE const uint32_t *ep_frame_buffer()
{
  return display->getFrameBuffer();
}

EMSCRIPTEN_KEEPALIVE uint32_t ep_frame_count()
{
  return display->getFrameCount();
}

EMSCRIPTEN_KEEPALIVE int ep_frame_width()
{
  return frameWidth;
}

EMSCRIPTEN_KEEPALIVE int ep_frame_height()
{
  return frameHeight;
}

EMSCRIPTEN_KEEPALIVE const float *ep_audio_buffer()
{
  return audioOutput->getBuffer();
}

EMSCRIPTEN_KEEPALIVE int ep_audio_frames()
{
  return int(audioOutput->getFrameCount());
}

EMSCRIPTEN_KEEPALIVE void ep_audio_clear()
{
  audioOutput->clear();
}

EMSCRIPTEN_KEEPALIVE void ep_set_volume(float volume)
{
  vm->setAudioOutputVolume(volume);
}

EMSCRIPTEN_KEEPALIVE void ep_set_cpu_frequency(int freq)
{
  vm->setCPUFrequency(size_t(freq));
}

EMSCRIPTEN_KEEPALIVE int ep_load_snapshot(const char *fileName)
{
  try {
    Ep128Emu::File  f(fileName);
    vm->registerChunkTypes(f);
    f.processAllChunks();
    WebDebug::clearStop();
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

namespace {

  // records which machine specific chunk types are present in a file
  class ChunkTypeProbe : public Ep128Emu::File::ChunkTypeHandler {
   private:
    Ep128Emu::File::ChunkType type;
    int&    result;
    int     machine;
   public:
    ChunkTypeProbe(Ep128Emu::File::ChunkType type_, int& result_, int machine_)
      : ChunkTypeHandler(), type(type_), result(result_), machine(machine_)
    {
    }
    virtual ~ChunkTypeProbe()
    {
    }
    virtual Ep128Emu::File::ChunkType getChunkType() const
    {
      return type;
    }
    virtual void processChunk(Ep128Emu::File::Buffer& buf)
    {
      (void) buf;
      result = machine;
    }
  };

}       // namespace

// Returns the machine type (0: Enterprise, 1: TVC) of an ep128emu snapshot
// or demo file, or -1 if it cannot be determined.
EMSCRIPTEN_KEEPALIVE int ep_file_machine_type(const char *fileName)
{
  try {
    int   result = -1;
    Ep128Emu::File  f(fileName);
    f.registerChunkType(new ChunkTypeProbe(
        Ep128Emu::File::EP128EMU_CHUNKTYPE_NICK_STATE, result, 0));
    f.registerChunkType(new ChunkTypeProbe(
        Ep128Emu::File::EP128EMU_CHUNKTYPE_DAVE_STATE, result, 0));
    f.registerChunkType(new ChunkTypeProbe(
        Ep128Emu::File::EP128EMU_CHUNKTYPE_TVCVM_STATE, result, 1));
    f.registerChunkType(new ChunkTypeProbe(
        Ep128Emu::File::EP128EMU_CHUNKTYPE_TVC_DEMO, result, 1));
    f.processAllChunks();
    return result;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_save_snapshot(const char *fileName)
{
  try {
    Ep128Emu::File  f;
    vm->saveState(f);
    f.writeFile(fileName);
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_set_disk(int n, const char *fileName)
{
  try {
    std::string imageFileName(fileName);
    if (machineType == 1 && !imageFileName.empty()) {
      try {
        vm->setDiskImageFile(n, imageFileName, -1, -1, -1);
      }
      catch (...) {
        std::FILE *f = std::fopen(imageFileName.c_str(), "rb");
        if (!f)
          throw;
        long fileSize = -1L;
        if (std::fseek(f, 0L, SEEK_END) >= 0)
          fileSize = std::ftell(f);
        std::fclose(f);
        if (fileSize == (40L * 2L * 9L * 512L))
          vm->setDiskImageFile(n, imageFileName, 40, 2, 9);
        else if (fileSize == (80L * 2L * 9L * 512L))
          vm->setDiskImageFile(n, imageFileName, 80, 2, 9);
        else
          vm->setDiskImageFile(n, imageFileName);
      }
    }
    else {
      vm->setDiskImageFile(n, imageFileName);
    }
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_set_tape(const char *fileName)
{
  try {
    vm->setTapeFileName(std::string(fileName));
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_tape_command(int cmd)
{
  try {
    switch (cmd) {
    case 0:
      vm->tapeStop();
      break;
    case 1:
      vm->tapePlay();
      break;
    case 2:
      vm->tapeSeek(0.0);
      break;
    case 3:
      vm->tapeRecord();
      break;
    }
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE double ep_tape_position()
{
  return vm->getTapePosition();
}

EMSCRIPTEN_KEEPALIVE double ep_tape_length()
{
  return vm->getTapeLength();
}

EMSCRIPTEN_KEEPALIVE int ep_pc()
{
  return vm->getProgramCounter();
}

EMSCRIPTEN_KEEPALIVE int ep_read_memory(int addr)
{
  return vm->readMemory(uint32_t(addr), true);
}

EMSCRIPTEN_KEEPALIVE void ep_write_memory(int addr, int value)
{
  if (!vm)
    return;
  vm->writeMemory(uint32_t(addr), uint8_t(value), true);
  if (machineType == 1 && (addr == 2821 || addr == 2829)) {
    vm->writeMemory((0xF8U << 14) | uint32_t(addr), uint8_t(value), false);
  }
}

EMSCRIPTEN_KEEPALIVE uint32_t ep_led_state()
{
  return vm->getFloppyDriveLEDState();
}

// Unpacks an ep128emu ROM package (ep128emu_roms-*.bin, compressed with
// epcompress) into 'outDir'. Returns the number of files, or -1 on error.
EMSCRIPTEN_KEEPALIVE int ep_unpack_rom_package(const char *pkgName,
                                               const char *outDir)
{
  try {
    std::vector< unsigned char >  inBuf;
    {
      std::FILE *f = std::fopen(pkgName, "rb");
      if (!f)
        throw Ep128Emu::Exception("cannot open ROM package");
      int   c;
      while ((c = std::fgetc(f)) != EOF)
        inBuf.push_back((unsigned char) c);
      std::fclose(f);
    }
    if (inBuf.size() < 4)
      throw Ep128Emu::Exception("invalid compressed ROM data size");
    std::vector< unsigned char >  buf;
    Ep128Emu::decompressData(buf, &(inBuf.front()), inBuf.size());
    if (buf.size() < 0x4000 || buf.size() > 0x00300000)
      throw Ep128Emu::Exception("invalid packed ROM data size");
    // same format as handled by unpackROMFiles() in installer/makecfg.cpp
    size_t  nFiles = (size_t(buf[0]) << 24) | (size_t(buf[1]) << 16)
                     | (size_t(buf[2]) << 8) | size_t(buf[3]);
    if (nFiles < 1 || nFiles > 128)
      throw Ep128Emu::Exception("invalid number of files in packed ROM data");
    size_t  offs = nFiles * 32 + 4;
    if (offs > buf.size())
      throw Ep128Emu::Exception("unexpected end of packed ROM data");
    for (size_t i = 0; i < nFiles; i++) {
      size_t  fileSize =
          (size_t(buf[i * 32 + 4]) << 24) | (size_t(buf[i * 32 + 5]) << 16)
          | (size_t(buf[i * 32 + 6]) << 8) | size_t(buf[i * 32 + 7]);
      if (fileSize < 8192 || fileSize > 65536 || (fileSize & 0x1FFF) != 0)
        throw Ep128Emu::Exception("invalid ROM file size");
      std::string fName(outDir);
      fName += '/';
      for (size_t j = 0; j < 28; j++) {
        unsigned char c = buf[i * 32 + 8 + j];
        if (c == 0x00) {
          if (j == 0)
            throw Ep128Emu::Exception("invalid ROM file name");
          break;
        }
        if (c >= 0x41 && c <= 0x5A)
          c = c | 0x20;
        if (!((c >= 0x30 && c <= 0x39) || (c >= 0x61 && c <= 0x7A) ||
              c == 0x2B || c == 0x2D || (c == 0x2E && j != 0))) {
          c = 0x5F;
        }
        fName += char(c);
      }
      if ((offs + fileSize) > buf.size())
        throw Ep128Emu::Exception("unexpected end of packed ROM data");
      std::FILE *f = std::fopen(fName.c_str(), "wb");
      if (!f)
        throw Ep128Emu::Exception("error writing ROM file");
      std::fwrite(&(buf[offs]), 1, fileSize, f);
      std::fclose(f);
      offs += fileSize;
    }
    return int(nFiles);
  }
  catch (...) {
    return handleException();
  }
}

// TVC: installs a card in an expansion slot (0..3). card: 0 empty,
// 1 VT-DOS, 2 FILE:, 3 GameCard, 4 Multichip Soundcard, 5 TVC256k++. A card
// type can only be in one slot (it is removed from the others). The TVC has
// to be reset (cold) afterwards so that its OS detects the cards.
EMSCRIPTEN_KEEPALIVE void ep_set_tvc_slot(int slot, int card)
{
  if (slot < 0 || slot > 3)
    return;
  if (card < TVC64::TVC64VM::SLOT_EMPTY || card > TVC64::TVC64VM::SLOT_CARD256)
    card = TVC64::TVC64VM::SLOT_EMPTY;
  if (card != TVC64::TVC64VM::SLOT_EMPTY) {
    for (int i = 0; i < 4; i++) {
      if (tvcSlotCards[i] == card)
        tvcSlotCards[i] = TVC64::TVC64VM::SLOT_EMPTY;
    }
  }
  tvcSlotCards[slot] = card;
  if (vm && machineType == 1) {
    TVC64::TVC64VM *tvc = static_cast<TVC64::TVC64VM *>(vm);
    for (int i = 0; i < 4; i++)
      tvc->setSlotCard(i, tvcSlotCards[i]);
  }
}

// Loads the flash drive image of the TVC256k++ card (flash-root-*.bin, a 15 MB
// littlefs image) from a file of the virtual file system. The image is shared
// by all card instances. Returns 0 on success, -1 on error.
EMSCRIPTEN_KEEPALIVE int ep_load_tvc_card_flash(const char *path)
{
  std::FILE *f = std::fopen(path, "rb");
  if (!f) {
    lastError = std::string("cannot open ") + path;
    return -1;
  }
  std::vector<unsigned char> buf;
  static unsigned char chunk[65536];   // not on the stack: 64 kB is the whole wasm stack
  size_t n;
  while ((n = std::fread(chunk, 1, sizeof(chunk), f)) > 0)
    buf.insert(buf.end(), chunk, chunk + n);
  std::fclose(f);
  if (!TVC256kpp::loadFlashImage(&buf[0], buf.size())) {
    lastError = "not a valid littlefs flash image";
    return -1;
  }
  return 0;
}

// Copies a file of the virtual file system to the TVC256k++ card's USB
// pendrive if one is plugged in, else to its PSRAM drive (formatted first if
// needed), and makes that the card's current drive.
// Returns 0 on success, -1 on error.
EMSCRIPTEN_KEEPALIVE int ep_tvc_card_put_file(const char *name, const char *path)
{
  std::FILE *f = std::fopen(path, "rb");
  if (!f) {
    lastError = std::string("cannot open ") + path;
    return -1;
  }
  std::vector<unsigned char> buf;
  static unsigned char chunk[65536];   // not on the stack: 64 kB is the whole wasm stack
  size_t n;
  while ((n = std::fread(chunk, 1, sizeof(chunk), f)) > 0)
    buf.insert(buf.end(), chunk, chunk + n);
  std::fclose(f);
  const uint8_t *data = buf.empty() ? (const uint8_t *) "" : &buf[0];
  if (TVC256kpp::usbPendrivePresent()) {
    // with a pendrive plugged in, the files go there (the boot selects it)
    if (!TVC256kpp::putUsbFile(name, data, buf.size())) {
      lastError = "the pendrive is full";
      return -1;
    }
    return 0;
  }
  if (!TVC256kpp::putPsramFile(name, data, buf.size())) {
    lastError = "the card's PSRAM drive is full";
    return -1;
  }
  return 0;
}

// Selects the TVC256k++ card's current drive (0 USB, 1 PSRAM, 2 flash, 3 DSK)
EMSCRIPTEN_KEEPALIVE void ep_tvc_card_select_drive(int drive)
{
  TVC256kpp::selectDrive(drive);
}

// Plugs an empty USB pendrive of sizeMB megabytes into the TVC256k++ card
// (formatted FAT), or unplugs it (0). Returns 0 on success.
EMSCRIPTEN_KEEPALIVE int ep_tvc_card_usb(int sizeMB)
{
  if (!TVC256kpp::setUsbPendrive(uint32_t(sizeMB < 0 ? 0 : sizeMB))) {
    lastError = "cannot create the pendrive";
    return -1;
  }
  return 0;
}

// TVC256k++ USB pendrive file manager (paths relative to the root, '/')
static bool readVfsFile(const char *path, std::vector<unsigned char> &buf)
{
  std::FILE *f = std::fopen(path, "rb");
  if (!f)
    return false;
  static unsigned char chunk[65536];   // not on the (64 kB) wasm stack
  size_t n;
  buf.clear();
  while ((n = std::fread(chunk, 1, sizeof(chunk), f)) > 0)
    buf.insert(buf.end(), chunk, chunk + n);
  std::fclose(f);
  return true;
}

EMSCRIPTEN_KEEPALIVE const char *ep_usb_list(const char *path)
{
  static std::string s;
  s = TVC256kppFS::usbList(path);
  return s.c_str();
}

EMSCRIPTEN_KEEPALIVE int ep_usb_put(const char *path, const char *src)
{
  std::vector<unsigned char> buf;
  if (!readVfsFile(src, buf)) {
    lastError = std::string("cannot open ") + src;
    return -1;
  }
  if (!TVC256kppFS::putUsbFile(path, buf.empty() ? (const uint8_t *) "" : &buf[0], buf.size())) {
    lastError = "the pendrive is full, or the name is not valid";
    return -1;
  }
  return 0;
}

EMSCRIPTEN_KEEPALIVE int ep_usb_get(const char *path, const char *dst)
{
  std::vector<uint8_t> data;
  if (!TVC256kppFS::usbGetFile(path, data)) {
    lastError = std::string("cannot read ") + path;
    return -1;
  }
  std::FILE *f = std::fopen(dst, "wb");
  if (!f)
    return -1;
  bool ok = data.empty() || std::fwrite(&data[0], 1, data.size(), f) == data.size();
  std::fclose(f);
  return ok ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE int ep_usb_mkdir(const char *path)
{
  return TVC256kppFS::usbMkdirs(path) ? 0 : -1;
}

// the pendrive's current directory, as the card's CD command sets it
EMSCRIPTEN_KEEPALIVE int ep_usb_chdir(const char *path)
{
  return TVC256kppFS::usbChdir(path) ? 0 : -1;
}

EMSCRIPTEN_KEEPALIVE int ep_usb_delete(const char *path)
{
  return TVC256kppFS::usbDelete(path) ? 0 : -1;
}

extern uint32_t card_usb_writes;        // card/diskio-emu.c

// the overlay graphics of the TVC256k++ card (card/tvc-graphics.c,
// card/tvc-io-regs.c)
extern sprite_t sprites[SPRITES_NUM];
extern volatile int8_t videoMode;
extern uint8_t registerSpriteBaseAddress, registerScreenBaseAddr;
extern uint8_t registerScreenColorBaseAddr, registerFontBaseAddr;
extern volatile uint8_t registerBitmapBaseAddr;

// the card's overlay: "mode spriteBase bitmapBase screenBase colorBase
// fontBase" (card RAM addresses), then a line per sprite: "x y enabled
// foreground colour phase fullColour"
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_card256_gfx()
{
  static std::string out;
  out.clear();
  if (machineType != 1 || !TVC256kpp::current)
    return out.c_str();
  char    tmp[96];
  std::snprintf(tmp, sizeof(tmp), "%d %u %u %u %u %u\n", int(videoMode),
                unsigned(registerSpriteBaseAddress & 0x07) * 0x4000U,
                unsigned(registerBitmapBaseAddr & 0x03) * 0x8000U,
                unsigned(registerScreenBaseAddr & 0x7F) * 0x0400U,
                unsigned(registerScreenColorBaseAddr & 0x7F) * 0x0400U,
                unsigned(registerFontBaseAddr & 0x3F) * 0x0800U);
  out += tmp;
  for (int i = 0; i < SPRITES_NUM; i++) {
    const sprite_t& sp = sprites[i];
    std::snprintf(tmp, sizeof(tmp), "%u %u %d %d %u %u %d\n",
                  unsigned(sp.x), unsigned(sp.y), int(sp.enabled),
                  int(sp.foreground), unsigned(sp.color), unsigned(sp.phase),
                  int(sp.fullColor));
    out += tmp;
  }
  return out.c_str();
}

// 0: size in kB, 1: free space in kB, 2: number of sector writes so far
EMSCRIPTEN_KEEPALIVE double ep_usb_info(int which)
{
  if (which == 2)
    return double(card_usb_writes);
  uint32_t total = 0, freeKB = 0;
  if (!TVC256kppFS::usbSpace(total, freeKB))
    return -1;
  return which == 0 ? double(total) : double(freeKB);
}

// Counters of the card's file system (0: files opened, 1: bytes read), for tests
EMSCRIPTEN_KEEPALIVE int ep_tvc_card_fs_stat(int which)
{
  return int(TVC256kpp::fsStat(which));
}

// Enables (in the given slot, 0..3) or removes the TVC256k++ card; kept for
// the native tests, the web page uses ep_set_tvc_slot().
EMSCRIPTEN_KEEPALIVE void ep_set_tvc_card256(int enabled, int slot)
{
  if (enabled) {
    ep_set_tvc_slot(slot, TVC64::TVC64VM::SLOT_CARD256);
  }
  else {
    for (int i = 0; i < 4; i++) {
      if (tvcSlotCards[i] == TVC64::TVC64VM::SLOT_CARD256)
        ep_set_tvc_slot(i, TVC64::TVC64VM::SLOT_EMPTY);
    }
  }
}

EMSCRIPTEN_KEEPALIVE void ep_set_tvc_ext_joy(int joyIndex, int state)
{
  if (joyIndex == 0) tvcJoy3State = (uint8_t)state;
  else if (joyIndex == 1) tvcJoy4State = (uint8_t)state;
  if (vm && machineType == 1) {
    TVC64::TVC64VM *tvc = static_cast<TVC64::TVC64VM *>(vm);
    tvc->setExtJoyState(joyIndex, (uint8_t)state);
  }
}

// ----------------------------------------------------------------------------
// Debugger (see webdebug.hpp)

// 0: running, else the reason of the stop (WebDebug::StopReason)
EMSCRIPTEN_KEEPALIVE int ep_dbg_state()
{
  return WebDebug::stopReason();
}

// "reason pc addr value" of the stop
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_info()
{
  static char buf[64];
  std::snprintf(buf, sizeof(buf), "%d %d %d %d",
                WebDebug::stopReason(), int(WebDebug::stopPC()),
                int(WebDebug::stopAddr()), int(WebDebug::stopValue()));
  return buf;
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_pause()
{
  WebDebug::pause();
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_continue()
{
  WebDebug::resume(false, -1);
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_step()
{
  WebDebug::resume(true, -1);
}

// runs until 'addr' (run to cursor, step over)
EMSCRIPTEN_KEEPALIVE void ep_dbg_run_to(int addr)
{
  WebDebug::resume(false, int32_t(addr & 0xFFFF));
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_set_bp(int addr, int enabled)
{
  WebDebug::setBreakPoint(uint16_t(addr & 0xFFFF), enabled != 0);
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_clear_bps()
{
  WebDebug::clearBreakPoints();
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_watch_clear()
{
  debugWatchPoints = Ep128Emu::BreakPointList();
  WebDebug::clearWatchPoints();
  applyDebugWatchPoints();
}

// a memory (CPU address) or I/O port watchpoint, for reads and/or writes
EMSCRIPTEN_KEEPALIVE void ep_dbg_watch_add(int isIO, int addr, int r, int w)
{
  WebDebug::setWatchPoint(isIO != 0, uint16_t(addr & 0xFFFF), r != 0, w != 0);
  if (isIO)
    debugWatchPoints.addIOBreakPoint(uint16_t(addr & 0xFFFF), r != 0, w != 0, 0);
  else
    debugWatchPoints.addMemoryBreakPoint(uint16_t(addr & 0xFFFF),
                                         r != 0, w != 0, false, false, 0);
  applyDebugWatchPoints();
}

// the Z80 registers: PC AF BC DE HL IX IY SP AF' BC' DE' HL' I R IM IFF1
// IFF2, then the segments of the 4 pages (space separated decimal numbers)
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_regs()
{
  static char buf[256];
  const Ep128::Z80_REGISTERS& r =
      static_cast< const Ep128Emu::VirtualMachine * >(vm)->getZ80Registers();
  std::snprintf(buf, sizeof(buf),
                "%d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d %d",
                int(r.PC.W.l), int(r.AF.W), int(r.BC.W), int(r.DE.W),
                int(r.HL.W), int(r.IX.W), int(r.IY.W), int(r.SP.W),
                int(r.altAF.W), int(r.altBC.W), int(r.altDE.W),
                int(r.altHL.W), int(r.I),
                int((r.R & 0x7F) | (r.RBit7 & 0x80)), int(r.IM),
                int(r.IFF1 != 0), int(r.IFF2 != 0),
                int(vm->getMemoryPage(0)), int(vm->getMemoryPage(1)),
                int(vm->getMemoryPage(2)), int(vm->getMemoryPage(3)));
  return buf;
}

// sets a register, in the order of ep_dbg_regs()
EMSCRIPTEN_KEEPALIVE void ep_dbg_set_reg(int n, int value)
{
  Ep128::Z80_REGISTERS& r = vm->getZ80Registers();
  uint16_t  v = uint16_t(value & 0xFFFF);
  switch (n) {
  case 0: vm->setProgramCounter(v); break;
  case 1: r.AF.W = v; break;
  case 2: r.BC.W = v; break;
  case 3: r.DE.W = v; break;
  case 4: r.HL.W = v; break;
  case 5: r.IX.W = v; break;
  case 6: r.IY.W = v; break;
  case 7: r.SP.W = v; break;
  case 8: r.altAF.W = v; break;
  case 9: r.altBC.W = v; break;
  case 10: r.altDE.W = v; break;
  case 11: r.altHL.W = v; break;
  case 12: r.I = uint8_t(v); break;
  case 13: r.R = uint8_t(v & 0x7F); r.RBit7 = uint8_t(v & 0x80); break;
  case 14: r.IM = uint8_t(v < 3 ? v : 2); break;
  case 15: r.IFF1 = uint8_t(v ? 1 : 0); break;
  case 16: r.IFF2 = uint8_t(v ? 1 : 0); break;
  }
}

// 'count' disassembled lines from 'addr' (CPU address), one per line
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_disasm(int addr, int count)
{
  static std::string out;
  out.clear();
  uint32_t  a = uint32_t(addr & 0xFFFF);
  std::string line;
  for (int i = 0; i < count; i++) {
    line.clear();
    a = vm->disassembleInstruction(line, a, true) & 0xFFFF;
    out += line;
    out += '\n';
  }
  return out.c_str();
}

// memory of the debugger's memory view: 0: CPU address, 1: physical
// (segment * 16384 + offset), 2: 2dfx resource RAM, 3: TVC256k++ PSRAM
static int debugMemRead(int src, uint32_t a)
{
  switch (src) {
  case 0:
    return vm->readMemory(a & 0xFFFF, true);
  case 1:
    return vm->readMemory(a & 0x3FFFFF, false);
  case 2:
    {
      const twodfx_emu  *d = static_cast< const twodfx_emu * >(TwoDfx::device());
      return (d ? twodfx_emu_resource_byte(d, a) : -1);
    }
  case 3:
    if (TVC256kpp::current && a < TVC256kpp::current->psramSize())
      return TVC256kpp::current->psram()[a];
    return -1;
  case 4:                               // TVC256k++: the card's fast RAM
    if (TVC256kpp::current && a < 0x48000U)   // TVC_RAM_SIZE (card_shim.h)
      return TVC256kppFS::fastRam()[a];
    return -1;
  }
  return -1;
}

// 'len' bytes (max. 4096) from 'addr' of memory 'src' (see above); bytes
// that do not exist read as 0
EMSCRIPTEN_KEEPALIVE const uint8_t *ep_dbg_mem(int addr, int len, int src)
{
  static uint8_t buf[4096];
  if (len > 4096)
    len = 4096;
  for (int i = 0; i < len; i++) {
    int     v = debugMemRead(src, uint32_t(addr) + uint32_t(i));
    buf[i] = uint8_t(v < 0 ? 0 : v);
  }
  return buf;
}

// 1 if memory 'src' exists (the card is in use)
EMSCRIPTEN_KEEPALIVE int ep_dbg_mem_valid(int src)
{
  return (debugMemRead(src, 0) >= 0 ? 1 : 0);
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_poke(int addr, int value, int src)
{
  uint32_t  a = uint32_t(addr);
  if (src == 0 || src == 1) {
    vm->writeMemory(src ? (a & 0x3FFFFF) : (a & 0xFFFF), uint8_t(value), src == 0);
  }
  else if (src == 3 && TVC256kpp::current &&
           a < TVC256kpp::current->psramSize()) {
    TVC256kpp::current->psram()[a] = uint8_t(value);
  }
  else if (src == 4 && TVC256kpp::current && a < 0x48000U) {
    TVC256kppFS::fastRam()[a] = uint8_t(value);
  }
}

// assembles one line of the monitor's A command ("A 1234 LD A,5") to CPU
// memory; returns the address after the instruction, or -1 on error
// (ep_last_error())
EMSCRIPTEN_KEEPALIVE int ep_dbg_assemble(const char *line)
{
  try {
    std::vector< std::string >  args;
    Ep128Emu::tokenizeString(args, line);
    uint32_t  a = Ep128::Z80Disassembler::assembleInstruction(args, *vm, true, 0);
    return int(Ep128::Z80Disassembler::getNextInstructionAddr(*vm, a, true) & 0xFFFF);
  }
  catch (std::exception& e) {
    lastError = e.what();
    return -1;
  }
}

// monitor O command: writes an I/O port
EMSCRIPTEN_KEEPALIVE void ep_dbg_out(int port, int value)
{
  vm->writeIOPort(uint16_t(port & 0xFFFF), uint8_t(value));
}

// the I/O registers of the machine (NICK / DAVE / CRTC ...), as text
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_io_regs()
{
  static std::string buf;
  buf.clear();
  vm->listIORegisters(buf);
  return buf.c_str();
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_history_enable(int on)
{
  WebDebug::enableHistory(on != 0);
}

// the PCs of the last 'n' instructions (oldest first), as hex numbers
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_history(int n)
{
  static std::string out;
  static std::vector< uint16_t >  buf;
  if (n < 0)
    n = 0;
  buf.resize(size_t(n) + 1);
  n = WebDebug::getHistory(&(buf[0]), n);
  out.clear();
  char    tmp[8];
  for (int i = 0; i < n; i++) {
    std::snprintf(tmp, sizeof(tmp), "%04X ", unsigned(buf[i]));
    out += tmp;
  }
  return out.c_str();
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_profile_enable(int on)
{
  WebDebug::enableProfiler(on != 0);
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_profile_clear()
{
  WebDebug::clearProfiler();
}

// the 65536 instruction counters of the profiler
EMSCRIPTEN_KEEPALIVE const uint32_t *ep_dbg_profile()
{
  return WebDebug::profilerCounts();
}

// Lua debugger script (the scripting of ep128emu): runs 'code'; the text
// printed is returned by ep_lua_output()
EMSCRIPTEN_KEEPALIVE int ep_lua_run(const char *code)
{
  if (!vm)
    return -1;
  try {
    if (!luaScript) {
      luaScript = new WebLuaScript(*vm);
      WebLuaScript::breakPointsChanged = &applyDebugWatchPoints;
    }
    luaScript->run(code);
    return (luaScript->hasCallback() ? 1 : 0);
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE void ep_lua_stop()
{
  if (luaScript)
    luaScript->stop();
}

// 1: a breakpoint callback is active
EMSCRIPTEN_KEEPALIVE int ep_lua_active()
{
  return (luaScript && luaScript->hasCallback() ? 1 : 0);
}

EMSCRIPTEN_KEEPALIVE const char *ep_lua_output()
{
  static std::string  s;
  s = (luaScript ? luaScript->takeOutput() : std::string());
  return s.c_str();
}

EMSCRIPTEN_KEEPALIVE void ep_dbg_iolog_enable(int on)
{
  WebDebug::enableIOLog(on != 0);
  WebDebug::clearIOLog();
  applyDebugWatchPoints();
}

// the last 'n' I/O accesses: "pc port value w" lines (hex, w: 1 = OUT)
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_iolog(int n)
{
  static std::string out;
  static std::vector< WebDebug::IOLogEntry >  buf;
  if (n < 0)
    n = 0;
  buf.resize(size_t(n) + 1);
  n = WebDebug::getIOLog(&(buf[0]), n);
  out.clear();
  char    tmp[32];
  for (int i = 0; i < n; i++) {
    std::snprintf(tmp, sizeof(tmp), "%04X %02X %02X %d\n", unsigned(buf[i].pc),
                  unsigned(buf[i].port & 0xFF), unsigned(buf[i].value),
                  int(buf[i].isWrite));
    out += tmp;
  }
  return out.c_str();
}

// 2dfx card state, as text
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_2dfx()
{
  static std::string out;
  static const char *const ops[32] = {
    "NOP", "SET_COLOR", "PLOT", "LINE", "ERASE_LINE", "BUCKET_FILL", "RECT",
    "FILL_RECT", "ROUND_RECT", "FILL_ROUND_RECT", "ELLIPSE", "FILL_ELLIPSE",
    "ARC", "PIE", "SET_XY_OFFSET", "SKIP_NEXT", "DRAW_TEXT", "BLIT",
    "PATTERN_FILL", "TILEMAP", "PATTERN_BUCKET_FILL", "TRIANGLE",
    "FILL_TRIANGLE", "CROP_BLIT", "STRETCH_BLIT", "SET_CLIP_RECT",
    "DRAW_MESH_WIREFRAME", "DRAW_MESH_FILLED", "DRAW_MESH_FWE", "7Dh", "7Eh",
    "RET" };
  static const char *const modes[3] = { "OFF", "NORMAL", "FORCED" };
  out.clear();
  const twodfx_emu  *d = static_cast< const twodfx_emu * >(TwoDfx::device());
  if (!d) {
    out = "A 2dfx kártya nincs bekapcsolva.\n";
    return out.c_str();
  }
  char    tmp[200];
  int     mode = int(twodfx_emu_engine_mode(d));
  std::snprintf(tmp, sizeof(tmp),
                "Gép: %s  Motor: %s  F8h státusz: %02X  Átlátszó szín: %u  FPS: %u\n"
                "Képkocka: %u  Raszter IRQ: %02X  Ütközés: %s  Demó: %s\n",
                twodfx_emu_machine(d) == TWODFX_EMU_TVC ? "TVC" : "Enterprise",
                (mode >= 0 && mode < 3) ? modes[mode] : "?",
                unsigned(twodfx_emu_read_f8(d)),
                unsigned(twodfx_emu_transparent_colour(d)),
                unsigned(twodfx_emu_fps(d)),
                unsigned(twodfx_emu_video_frame_count(d)),
                unsigned(twodfx_emu_raster_pending(d)),
                twodfx_emu_collision_detected(d) ? "igen" : "nem",
                twodfx_emu_egg_active(d) ? "fut" : "nincs");
  out += tmp;
  if (twodfx_emu_egg_active(d)) {
    std::snprintf(tmp, sizeof(tmp), "Demó: %02Xh\n", 0xC0U + twodfx_emu_egg_id(d));
    out += tmp;
  }
  out += "Sprite-ok (bekapcsoltak):\n";
  int     nSpr = 0;
  for (unsigned i = 0; i < TWODFX_EMU_SPRITE_COUNT; i++) {
    uint8_t b[9];
    for (unsigned j = 0; j < 9; j++)
      b[j] = twodfx_emu_sprite_active_byte(d, i, j);
    if (!(b[0] & 0x80))
      continue;
    nSpr++;
    unsigned  x = (unsigned(b[0] & 0x30) << 4) | b[1];
    unsigned  y = (unsigned(b[0] & 0x08) << 5) | b[2];
    unsigned  w = (unsigned(b[0] & 0x06) << 7) | b[7];
    unsigned  h = (unsigned(b[0] & 0x01) << 8) | b[8];
    unsigned  a = unsigned(b[3]) | (unsigned(b[4]) << 8) | (unsigned(b[5] & 0x7F) << 16);
    std::snprintf(tmp, sizeof(tmp),
                  "  #%02u  X:%3u Y:%3u  %3ux%-3u  cím: %06X  %s%s%s%s%s\n",
                  i, x, y, w, h, a, (b[0] & 0x40) ? "ütk " : "",
                  (b[6] & 0x80) ? "2xX " : "", (b[6] & 0x40) ? "2xY " : "",
                  (b[6] & 0x20) ? "tükörX " : "", (b[6] & 0x10) ? "tükörY" : "");
    out += tmp;
  }
  if (!nSpr)
    out += "  nincs\n";
  for (unsigned fg = 0; fg < 2; fg++) {
    out += (fg ? "Előtér 2DPT:\n" : "Háttér 2DPT:\n");
    for (unsigned slot = 0; slot < 256; slot++) {
      twodfx_2dpt_entry e;
      if (!twodfx_emu_get_2dpt(d, fg, slot, 1, &e))
        break;
      unsigned  op = e.opcode & 0x1F;
      std::snprintf(tmp, sizeof(tmp), "  %3u  %-20s", slot, ops[op]);
      out += tmp;
      for (unsigned j = 0; j < e.nbytes && j < 11; j++) {
        std::snprintf(tmp, sizeof(tmp), " %02X", unsigned(e.payload[j]));
        out += tmp;
      }
      out += '\n';
      if (op == 0x1F || slot >= 63)
        break;
    }
  }
  return out.c_str();
}

// TVC256k++ card state, as text
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_card256()
{
  static std::string out;
  out.clear();
  TVC256kpp *c = TVC256kpp::current;
  if (machineType != 1 || !c || !c->isEnabled()) {
    out = "A TVC256k++ kártya nincs bent egyik bővítőportban sem.\n";
    return out.c_str();
  }
  char    tmp[480];
  std::snprintf(tmp, sizeof(tmp),
                "Port: %d (I/O %02X-%02X)  Kiválasztott regiszter: %02X / %02X  Border: %02X\n"
                "Lapok: P2 %02X  P3 %02X  8M P2: %02X%02X  8M P3: %02X%02X  ROM lap: %02X\n"
                "PSRAM: %u MB  Firmware: %u.%u  Meghajtó: %02X  USB: %02X\n",
                c->getSlot(), 0x10 + 0x10 * c->getSlot(), 0x1F + 0x10 * c->getSlot(),
                unsigned(c->baseRegister(0)), unsigned(c->baseRegister(1)),
                unsigned(c->borderColor()),
                unsigned(c->debugRegister(0xB0)), unsigned(c->debugRegister(0xB1)),
                unsigned(c->debugRegister(0xB3)), unsigned(c->debugRegister(0xB2)),
                unsigned(c->debugRegister(0xB5)), unsigned(c->debugRegister(0xB4)),
                unsigned(c->debugRegister(0xB7)),
                unsigned(c->psramSize() >> 20),
                unsigned(c->debugRegister(0xC3)), unsigned(c->debugRegister(0xC4)),
                unsigned(c->debugRegister(0xC5)), unsigned(c->debugRegister(0xD0)));
  out += tmp;
  out += "Regiszterek:\n    ";
  for (int i = 0; i < 16; i++) {
    std::snprintf(tmp, sizeof(tmp), " %X ", i);
    out += tmp;
  }
  for (int r = 0; r < 256; r++) {
    if (!(r & 15)) {
      std::snprintf(tmp, sizeof(tmp), "\n%02X: ", r);
      out += tmp;
    }
    std::snprintf(tmp, sizeof(tmp), " %02X", unsigned(c->debugRegister(r)));
    out += tmp;
  }
  out += '\n';
  return out.c_str();
}

// TVC sound cards (GameCard, Multichip): the chips' registers, as text
EMSCRIPTEN_KEEPALIVE const char *ep_dbg_sound()
{
  static std::string out;
  if (machineType != 1 || !TVCSoundCards::current)
    out = "Csak TVC-n: GameCard és Multichip hangkártya.\n";
  else
    out = TVCSoundCards::current->debugInfo();
  return out.c_str();
}

}       // extern "C"

int main()
{
  return 0;
}
