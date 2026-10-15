#include "tvc_soundcards.hpp"
#include "emu76489.h"
#include "opl3.h"
#include "saa1099.hpp"
#include <cstring>

TVCSoundCards::TVCSoundCards()
  : m_gameCardSlot(-1),
    m_multiSoundSlot(-1),
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

void TVCSoundCards::setGameCardSlot(int slot)
{
  m_gameCardSlot = (slot >= 0 && slot <= 3) ? slot : -1;
}

void TVCSoundCards::setMultiSoundSlot(int slot)
{
  m_multiSoundSlot = (slot >= 0 && slot <= 3) ? slot : -1;
}

void TVCSoundCards::setExtJoyState(int joyIndex, uint8_t state)
{
  if (joyIndex == 0)
    m_joy3State = state;
  else if (joyIndex == 1)
    m_joy4State = state;
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

// I/O ports of extension slot n are 0x10 + 0x10 * n .. 0x1F + 0x10 * n.
// GameCard:  +0: SN76489, +2/+3: joystick 3/4 (read)
// MultiSound: +0: SN76489, +2/+3: SAA1099 data/address, +4/+5: OPL2
int TVCSoundCards::gameCardPort() const
{
  return m_gameCardSlot >= 0 ? 0x10 + 0x10 * m_gameCardSlot : -1;
}

int TVCSoundCards::multiSoundPort() const
{
  return m_multiSoundSlot >= 0 ? 0x10 + 0x10 * m_multiSoundSlot : -1;
}

bool TVCSoundCards::handleWrite(uint16_t addr, uint8_t val)
{
  addr = addr & 0x7F;

  int gc = gameCardPort();
  if (gc >= 0 && addr == gc) {
    if (m_sng) SNG_writeIO((SNG*)m_sng, val);
    return true;
  }

  int ms = multiSoundPort();
  if (ms >= 0) {
    switch (int(addr) - ms) {
    case 0:
      if (m_sng) SNG_writeIO((SNG*)m_sng, val);
      return true;
    case 2:
      if (m_saa) ((SAA1099*)m_saa)->writeData(val);
      return true;
    case 3:
      if (m_saa) ((SAA1099*)m_saa)->writeAddress(val);
      return true;
    case 4:
      m_oplSelectedReg = val;
      return true;
    case 5:
      if (m_opl) OPL3_WriteReg((opl3_chip*)m_opl, m_oplSelectedReg, val);
      return true;
    }
  }

  return false;
}

bool TVCSoundCards::handleRead(uint16_t addr, uint8_t &val)
{
  addr = addr & 0x7F;

  int gc = gameCardPort();
  if (gc >= 0) {
    if (addr == gc + 2) {
      val = m_joy3State;
      return true;
    }
    if (addr == gc + 3) {
      val = m_joy4State;
      return true;
    }
  }

  int ms = multiSoundPort();
  if (ms >= 0 && addr == ms + 4) {
    val = 0x00;                         // OPL2 status
    return true;
  }

  return false;
}

// Extension ROM of a card with ID 3 (port 0x5A), as read by the IOS at
// boot (see tvc12_ext.rom at 0xF050): "MOPS", name length and a name of
// at most 4 characters (copied to the slot's RAM area at
// 0x0040 + 0x30 * slot), IRQ vector at 0x09, init vector at 0x0B, number of
// device functions at 0x0D. The init routine is called with IX pointing to
// the slot's RAM area, and it stores the full name of the card there, which
// is where programs look for the cards. Everything else reads as RET.
static uint8_t makeROMByte(const char *name, int len, uint16_t offset)
{
  if (offset < 4) return (uint8_t)"MOPS"[offset];
  if (offset == 4) return 4;
  if (offset < 9) return (uint8_t)name[offset - 5];
  switch (offset) {
  case 0x09: return 0x1F;               // IRQ vector: 0xC01F (RET)
  case 0x0A: return 0xC0;
  case 0x0B: return 0x20;               // init vector: 0xC020
  case 0x0C: return 0xC0;
  case 0x0D: return 0x00;               // no device functions
  }
  if (offset < 0x20) return 0xC9;
  // init routine at 0xC020
  static const uint8_t prologue[] = {
    0xDD, 0xE5,                         // PUSH IX
    0xE3,                               // EX (SP), HL
    0x7D,                               // LD A, L
    0xE6, 0xF0,                         // AND 0F0H
    0x6F                                // LD L, A
  };
  uint16_t n = offset - 0x20;
  if (n < sizeof(prologue)) return prologue[n];
  n -= sizeof(prologue);
  // LD (HL), len / name[i]; INC L
  if (n < uint16_t((len + 1) * 3)) {
    uint16_t i = n / 3;
    switch (n % 3) {
    case 0: return 0x36;
    case 1: return i == 0 ? (uint8_t)len : (uint8_t)name[i - 1];
    default: return 0x2C;
    }
  }
  n -= uint16_t((len + 1) * 3);
  static const uint8_t epilogue[] = {
    0xE1,                               // POP HL
    0xAF,                               // XOR A
    0xC9                                // RET
  };
  if (n < sizeof(epilogue)) return epilogue[n];
  return 0xC9;
}

bool TVCSoundCards::handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val)
{
  int slot = int(slotPaging >> 14);
  uint16_t offset = addr & 0x3FFF;
  if (slot == m_gameCardSlot) {
    val = makeROMByte("JOY+SN", 6, offset);
    return true;
  }
  if (slot == m_multiSoundSlot) {
    val = makeROMByte("SndMx", 5, offset);
    return true;
  }
  return false;
}

void TVCSoundCards::renderAudio(int32_t &outLeft, int32_t &outRight)
{
  outLeft = 0;
  outRight = 0;
  if (m_gameCardSlot < 0 && m_multiSoundSlot < 0)
    return;

  // SN76489 (used by GameCard and Multichip Soundcard)
  if (m_sng) {
    int16_t sngSample = SNG_calc((SNG*)m_sng);
    int32_t sngLevel = int32_t(sngSample) * 2;
    outLeft += sngLevel;
    outRight += sngLevel;
  }

  // SAA1099 & OPL2 (Multichip Soundcard)
  if (m_multiSoundSlot >= 0) {
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
