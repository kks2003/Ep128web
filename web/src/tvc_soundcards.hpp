#ifndef TVC_SOUNDCARDS_HPP_INCLUDED
#define TVC_SOUNDCARDS_HPP_INCLUDED

#include <cstdint>

class TVCSoundCards {
public:
  TVCSoundCards();
  ~TVCSoundCards();

  void setGameCardEnabled(bool enabled);
  void setMultiSoundEnabled(bool enabled);
  bool isGameCardEnabled() const { return m_gameCardEnabled; }
  bool isMultiSoundEnabled() const { return m_multiSoundEnabled; }

  // Ext joystick state: bit 0: UP, 1: DOWN, 2: LEFT, 3: RIGHT, 4: FIRE
  // Active LOW: 0 = pressed, 1 = released.
  void setExtJoyState(int joyIndex, uint8_t state);

  bool isSlot1Present() const { return false; } // Slot 1 reserved for tvcfileio.rom
  bool isSlot2Present() const;
  bool isSlot3Present() const;

  bool handleRead(uint16_t addr, uint8_t &val);
  bool handleWrite(uint16_t addr, uint8_t val);
  bool handleSlotROMRead(uint16_t addr, uint16_t slotPaging, uint8_t &val);

  void renderAudio(int32_t &outLeft, int32_t &outRight);
  void reset();

private:
  bool m_gameCardEnabled;
  bool m_multiSoundEnabled;
  uint8_t m_joy3State;
  uint8_t m_joy4State;

  void *m_sng; // SNG* from emu76489
  void *m_opl; // opl3_chip* from Nuked-OPL3
  void *m_saa; // SAA1099*

  uint8_t m_oplSelectedReg;
};

#endif // TVC_SOUNDCARDS_HPP_INCLUDED
