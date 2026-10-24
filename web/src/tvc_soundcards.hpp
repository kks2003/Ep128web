#ifndef TVC_SOUNDCARDS_HPP_INCLUDED
#define TVC_SOUNDCARDS_HPP_INCLUDED

#include <cstdint>
#include <string>

class TVCSoundCards {
public:
  TVCSoundCards();
  ~TVCSoundCards();

  // Expansion slot (0..3) of each card, or -1 if the card is not installed.
  void setGameCardSlot(int slot);
  void setMultiSoundSlot(int slot);
  bool isGameCardEnabled() const { return m_gameCardSlot >= 0; }
  bool isMultiSoundEnabled() const { return m_multiSoundSlot >= 0; }

  // Ext joystick state: bit 0: UP, 1: DOWN, 2: LEFT, 3: RIGHT, 4: FIRE
  // Active LOW: 0 = pressed, 1 = released.
  void setExtJoyState(int joyIndex, uint8_t state);

  bool handleRead(uint16_t addr, uint8_t &val);
  bool handleWrite(uint16_t addr, uint8_t val);
  bool handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val);

  void renderAudio(int32_t &outLeft, int32_t &outRight);
  void reset();

  // debugger: the chips' registers as written by the programs
  std::string debugInfo() const;
  static TVCSoundCards *current;        // the cards of the running TVC

private:
  int m_gameCardSlot;
  int m_multiSoundSlot;
  uint8_t m_joy3State;
  uint8_t m_joy4State;

  void *m_sng; // SNG* from emu76489
  void *m_opl; // opl3_chip* from Nuked-OPL3
  void *m_saa; // SAA1099*

  uint8_t m_oplSelectedReg;
  // register shadows for the debugger
  uint16_t m_snRegs[8];                 // tone 0, vol 0, tone 1, ..., noise, vol 3
  uint8_t m_snLatch;
  uint8_t m_saaRegs[32];
  uint8_t m_saaSelected;
  uint8_t m_oplRegs[256];
  void snWrite(uint8_t val);

  int gameCardPort() const;
  int multiSoundPort() const;
};

#endif // TVC_SOUNDCARDS_HPP_INCLUDED
