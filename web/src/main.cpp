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
#include "decompm2.hpp"

#include <emscripten/emscripten.h>
#include <cmath>
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
    if (vm) {
      delete vm;
      vm = (Ep128Emu::VirtualMachine *) 0;
    }
    machineType = -1;
    if (type == 1) {
      // clock frequencies as set by ep128emu's EmulatorConfiguration for TVC
      vm = new TVC64::TVC64VM(*display, *audioOutput);
      vm->setCPUFrequency(3125000);
      vm->setVideoFrequency(1562500);
      vm->setSoundClockFrequency(390625);
    }
    else {
      vm = new Ep128::Ep128VM(*display, *audioOutput);
      vm->setCPUFrequency(4000000);
      vm->setVideoFrequency(889846);
      vm->setSoundClockFrequency(500000);
    }
    machineType = (type == 1 ? 1 : 0);
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
    return 0;
  }
  catch (...) {
    return handleException();
  }
}

EMSCRIPTEN_KEEPALIVE int ep_run(int microseconds)
{
  try {
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
    vm->setDiskImageFile(n, std::string(fileName));
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

}       // extern "C"

int main()
{
  return 0;
}
