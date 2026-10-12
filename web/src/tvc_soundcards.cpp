#include "tvc_soundcards.hpp"
#include "emu76489.h"
#include "opl3.h"
#include "saa1099.hpp"
#include <cstring>

TVCSoundCards::TVCSoundCards()
  : m_gameCardEnabled(false),
    m_multiSoundEnabled(false),
    m_joy3State(0xFF),
    m_joy4State(0xFF),
    m_sng(nullptr),
    m_opl(nullptr),
    m_saa(nullptr),
    m_oplSelectedReg(0)
{
  m_sng = (void*)SNG_new(3579545, 390625);
  opl3_chip *opl = new opl3_chip();
  OPL3_Reset(opl, 390625);
  m_opl = (void*)opl;
  m_saa = (void*)(new SAA1099());
}

TVCSoundCards::~TVCSoundCards()
{
  if (m_sng) {
    SNG_delete((SNG*)m_sng);
    m_sng = nullptr;
  }
  if (m_opl) {
    delete (opl3_chip*)m_opl;
    m_opl = nullptr;
  }
  if (m_saa) {
    delete (SAA1099*)m_saa;
    m_saa = nullptr;
  }
}

void TVCSoundCards::setGameCardEnabled(bool enabled)
{
  m_gameCardEnabled = enabled;
}

void TVCSoundCards::setMultiSoundEnabled(bool enabled)
{
  m_multiSoundEnabled = enabled;
}

void TVCSoundCards::setExtJoyState(int joyIndex, uint8_t state)
{
  if (joyIndex == 0)
    m_joy3State = state;
  else if (joyIndex == 1)
    m_joy4State = state;
}

bool TVCSoundCards::isSlot2Present() const
{
  return m_gameCardEnabled || m_multiSoundEnabled;
}

bool TVCSoundCards::isSlot3Present() const
{
  return m_gameCardEnabled && m_multiSoundEnabled;
}

void TVCSoundCards::reset()
{
  if (m_sng) SNG_reset((SNG*)m_sng);
  if (m_opl) OPL3_Reset((opl3_chip*)m_opl, 390625);
  if (m_saa) ((SAA1099*)m_saa)->reset();
  m_oplSelectedReg = 0;
  m_joy3State = 0xFF;
  m_joy4State = 0xFF;
}

bool TVCSoundCards::handleWrite(uint16_t addr, uint8_t val)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return false;

  addr = addr & 0x7F;

  // Never intercept floppy controller
  if (addr >= 0x10 && addr <= 0x13)
    return false;

  // SN76489 write:
  // Support Port 0x20 (slot 1 compatibility) and Port 0x30 (slot 2)
  if (addr == 0x20 || addr == 0x30) {
    if (m_sng) SNG_writeIO((SNG*)m_sng, val);
    return true;
  }

  // MultiSound chips (SAA1099, OPL2)
  if (m_multiSoundEnabled) {
    // SAA1099 data: 0x22 or 0x32 or 0x42
    if (addr == 0x22 || addr == 0x32 || addr == 0x42) {
      if (m_saa) ((SAA1099*)m_saa)->writeData(val);
      return true;
    }
    // SAA1099 address: 0x23 or 0x33 or 0x43
    if (addr == 0x23 || addr == 0x33 || addr == 0x43) {
      if (m_saa) ((SAA1099*)m_saa)->writeAddress(val);
      return true;
    }
    // OPL2 register select: 0x24 or 0x34 or 0x44
    if (addr == 0x24 || addr == 0x34 || addr == 0x44) {
      m_oplSelectedReg = val;
      return true;
    }
    // OPL2 data: 0x25 or 0x35 or 0x45
    if (addr == 0x25 || addr == 0x35 || addr == 0x45) {
      if (m_opl) OPL3_WriteReg((opl3_chip*)m_opl, m_oplSelectedReg, val);
      return true;
    }
  }

  return false;
}

bool TVCSoundCards::handleRead(uint16_t addr, uint8_t &val)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return false;

  addr = addr & 0x7F;

  // Never intercept floppy controller
  if (addr >= 0x10 && addr <= 0x13)
    return false;

  // GameCard joystick 3 & 4
  if (m_gameCardEnabled) {
    if (addr == 0x22 || addr == 0x32) {
      val = m_joy3State;
      return true;
    }
    if (addr == 0x23 || addr == 0x33) {
      val = m_joy4State;
      return true;
    }
  }

  // MultiSound OPL2 status
  if (m_multiSoundEnabled) {
    if (addr == 0x24 || addr == 0x34 || addr == 0x44) {
      val = 0x00;
      return true;
    }
  }

  return false;
}

// Extension ROM header in the format of tvcfileio.s: "MOPS", name length,
// name, IRQ vector, init vector, number of device functions (none here).
// The init routine at 0xC020 is XOR A, RET; everything else reads as RET.
static uint8_t makeHeaderByte(const char *name, int len, uint16_t offset)
{
  if (offset < 4) return (uint8_t)"MOPS"[offset];
  if (offset == 4) return (uint8_t)len;
  if (offset < uint16_t(5 + len)) return (uint8_t)name[offset - 5];
  switch (offset - uint16_t(5 + len)) {
  case 0: return 0x21;                  // IRQ vector: 0xC021 (RET)
  case 1: return 0xC0;
  case 2: return 0x20;                  // init vector: 0xC020
  case 3: return 0xC0;
  case 4: return 0x00;                  // no device functions
  }
  if (offset == 0x20) return 0xAF;      // XOR A
  return 0xC9;                          // RET
}

bool TVCSoundCards::handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return false;

  uint16_t offset = addr & 0x3FFF;

  // Never touch Slot 0 (0x0000) or Slot 1 (0x4000) - Slot 1 belongs to tvcfileio.rom!
  if (m_gameCardEnabled && m_multiSoundEnabled) {
    if (slotPaging == 0x8000) { // Slot 2: GameCard
      val = makeHeaderByte("JOY+SN", 6, offset);
      return true;
    }
    if (slotPaging == 0xC000) { // Slot 3: MultiSound
      val = makeHeaderByte("SndMx", 5, offset);
      return true;
    }
    return false;
  }

  if (m_gameCardEnabled) {
    if (slotPaging == 0x8000) { // Slot 2: GameCard
      val = makeHeaderByte("JOY+SN", 6, offset);
      return true;
    }
    return false;
  }

  if (m_multiSoundEnabled) {
    if (slotPaging == 0x8000) { // Slot 2: MultiSound
      val = makeHeaderByte("SndMx", 5, offset);
      return true;
    }
    return false;
  }

  return false;
}

void TVCSoundCards::renderAudio(int32_t &outLeft, int32_t &outRight)
{
  outLeft = 0;
  outRight = 0;
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return;

  // SN76489 (used by GameCard and Multichip Soundcard)
  if (m_sng) {
    int16_t sngSample = SNG_calc((SNG*)m_sng);
    int32_t sngLevel = int32_t(sngSample) * 2;
    outLeft += sngLevel;
    outRight += sngLevel;
  }

  // SAA1099 & OPL2 (Multichip Soundcard)
  if (m_multiSoundEnabled) {
    if (m_saa) {
      int32_t saaL = 0, saaR = 0;
      ((SAA1099*)m_saa)->render(saaL, saaR);
      outLeft += saaL;
      outRight += saaR;
    }
    if (m_opl) {
      int16_t oplSamples[2] = {0, 0};
      OPL3_GenerateResampled((opl3_chip*)m_opl, oplSamples);
      outLeft += int32_t(oplSamples[0]);
      outRight += int32_t(oplSamples[1]);
    }
  }
}
