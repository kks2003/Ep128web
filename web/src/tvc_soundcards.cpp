#include "tvc_soundcards.hpp"
#include "emu76489.h"
#include "opl3.h"
#include "saa1099.hpp"
#include "tvcmem.hpp"
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

bool TVCSoundCards::isSlot1Present() const
{
  return m_gameCardEnabled || m_multiSoundEnabled;
}

bool TVCSoundCards::isSlot2Present() const
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

  // If both cards are enabled:
  // Slot 1 (0x20..0x2F): GameCard
  // Slot 2 (0x30..0x3F): Multichip Soundcard
  if (m_gameCardEnabled && m_multiSoundEnabled) {
    if (addr == 0x20 || addr == 0x10) {
      if (m_sng) SNG_writeIO((SNG*)m_sng, val);
      return true;
    }
    if (addr == 0x30) {
      if (m_sng) SNG_writeIO((SNG*)m_sng, val);
      return true;
    }
    if (addr == 0x32) {
      if (m_saa) ((SAA1099*)m_saa)->writeData(val);
      return true;
    }
    if (addr == 0x33) {
      if (m_saa) ((SAA1099*)m_saa)->writeAddress(val);
      return true;
    }
    if (addr == 0x34) {
      m_oplSelectedReg = val;
      return true;
    }
    if (addr == 0x35) {
      if (m_opl) OPL3_WriteReg((opl3_chip*)m_opl, m_oplSelectedReg, val);
      return true;
    }
    return false;
  }

  // Only GameCard enabled (Slot 1 at 0x20, mirrored at 0x10)
  if (m_gameCardEnabled) {
    if (addr == 0x20 || addr == 0x10) {
      if (m_sng) SNG_writeIO((SNG*)m_sng, val);
      return true;
    }
    return false;
  }

  // Only MultiSound enabled (Slot 1 at 0x20, mirrored at 0x10)
  if (m_multiSoundEnabled) {
    if (addr == 0x20 || addr == 0x10) {
      if (m_sng) SNG_writeIO((SNG*)m_sng, val);
      return true;
    }
    if (addr == 0x22 || addr == 0x12) {
      if (m_saa) ((SAA1099*)m_saa)->writeData(val);
      return true;
    }
    if (addr == 0x23 || addr == 0x13) {
      if (m_saa) ((SAA1099*)m_saa)->writeAddress(val);
      return true;
    }
    if (addr == 0x24 || addr == 0x14) {
      m_oplSelectedReg = val;
      return true;
    }
    if (addr == 0x25 || addr == 0x15) {
      if (m_opl) OPL3_WriteReg((opl3_chip*)m_opl, m_oplSelectedReg, val);
      return true;
    }
    return false;
  }

  return false;
}

bool TVCSoundCards::handleRead(uint16_t addr, uint8_t &val)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return false;

  addr = addr & 0x7F;

  if (m_gameCardEnabled && m_multiSoundEnabled) {
    if (addr == 0x22 || addr == 0x12) {
      val = m_joy3State;
      return true;
    }
    if (addr == 0x23 || addr == 0x13) {
      val = m_joy4State;
      return true;
    }
    if (addr == 0x34) {
      val = 0x00; // YM3812 status
      return true;
    }
    return false;
  }

  if (m_gameCardEnabled) {
    if (addr == 0x22 || addr == 0x12) {
      val = m_joy3State;
      return true;
    }
    if (addr == 0x23 || addr == 0x13) {
      val = m_joy4State;
      return true;
    }
    return false;
  }

  if (m_multiSoundEnabled) {
    if (addr == 0x24 || addr == 0x14) {
      val = 0x00; // YM3812 status
      return true;
    }
    return false;
  }

  return false;
}

static uint8_t makeHeaderByte(const char *name, int len, uint16_t offset)
{
  if (offset == 0) return 'M';
  if (offset == 1) return 'O';
  if (offset == 2) return 'P';
  if (offset == 3) return 'S';
  if (offset == 4) return (uint8_t)len;
  if (offset >= 5 && offset < uint16_t(5 + len)) return (uint8_t)name[offset - 5];
  if (offset == uint16_t(5 + len)) return 0x0E;     // Init vector low byte (0xC00E)
  if (offset == uint16_t(5 + len + 1)) return 0xC0; // Init vector high byte
  return 0xC9; // Z80 RET opcode
}

bool TVCSoundCards::handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return false;

  uint16_t offset = addr & 0x3FFF;

  // Slot 1 paged (0x4000)
  if (slotPaging == 0x4000 && isSlot1Present()) {
    if (m_gameCardEnabled)
      val = makeHeaderByte("JOY+SN", 6, offset);
    else
      val = makeHeaderByte("SndMx", 5, offset);
    return true;
  }

  // Slot 2 paged (0x8000)
  if (slotPaging == 0x8000 && isSlot2Present()) {
    val = makeHeaderByte("SndMx", 5, offset);
    return true;
  }

  return false;
}

void TVCSoundCards::updateRAMHeaders(TVC64::Memory &mem)
{
  if (!m_gameCardEnabled && !m_multiSoundEnabled)
    return;

  if (m_gameCardEnabled && m_multiSoundEnabled) {
    // Slot 1: GameCard at 0x0070
    mem.writeROM(0x0070, 6);
    const char *n1 = "JOY+SN";
    for (int i = 0; i < 6; i++) mem.writeROM(0x0071 + i, (uint8_t)n1[i]);

    // Slot 2: MultiSound at 0x00A0
    mem.writeROM(0x00A0, 5);
    const char *n2 = "SndMx";
    for (int i = 0; i < 5; i++) mem.writeROM(0x00A1 + i, (uint8_t)n2[i]);
  }
  else if (m_gameCardEnabled) {
    mem.writeROM(0x0070, 6);
    const char *n = "JOY+SN";
    for (int i = 0; i < 6; i++) mem.writeROM(0x0071 + i, (uint8_t)n[i]);
  }
  else if (m_multiSoundEnabled) {
    mem.writeROM(0x0070, 5);
    const char *n = "SndMx";
    for (int i = 0; i < 5; i++) mem.writeROM(0x0071 + i, (uint8_t)n[i]);
  }
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
