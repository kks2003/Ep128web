#ifndef SAA1099_HPP_INCLUDED
#define SAA1099_HPP_INCLUDED

#include <cstdint>
#include <cstring>

class SAA1099 {
public:
  SAA1099() { reset(); }

  void reset() {
    std::memset(m_channels, 0, sizeof(m_channels));
    std::memset(m_noise, 0, sizeof(m_noise));
    m_noise_params[0] = m_noise_params[1] = 0;
    m_env_enable[0] = m_env_enable[1] = false;
    m_env_reverse_right[0] = m_env_reverse_right[1] = false;
    m_env_mode[0] = m_env_mode[1] = 0;
    m_env_bits[0] = m_env_bits[1] = false;
    m_env_clock[0] = m_env_clock[1] = false;
    m_env_step[0] = m_env_step[1] = 0;
    m_all_ch_enable = false;
    m_sync_state = false;
    m_selected_reg = 0;

    for (int i = 0; i < 6; i++) {
      m_channels[i].envelope[0] = 16;
      m_channels[i].envelope[1] = 16;
    }
  }

  void writeAddress(uint8_t data) {
    m_selected_reg = data & 0x1F;
    if (m_selected_reg == 0x18 || m_selected_reg == 0x19) {
      if (m_env_clock[0]) envelope_w(0);
      if (m_env_clock[1]) envelope_w(1);
    }
  }

  void writeData(uint8_t data) {
    int reg = m_selected_reg;
    int ch;
    switch (reg) {
    case 0x00: case 0x01: case 0x02: case 0x03: case 0x04: case 0x05:
      ch = reg & 7;
      m_channels[ch].amplitude[0] = amplitude_lookup[data & 0x0F];
      m_channels[ch].amplitude[1] = amplitude_lookup[(data >> 4) & 0x0F];
      break;
    case 0x08: case 0x09: case 0x0A: case 0x0B: case 0x0C: case 0x0D:
      ch = reg & 7;
      m_channels[ch].frequency = data;
      break;
    case 0x10: case 0x11: case 0x12:
      ch = (reg - 0x10) << 1;
      m_channels[ch + 0].octave = data & 0x07;
      m_channels[ch + 1].octave = (data >> 4) & 0x07;
      break;
    case 0x14:
      for (ch = 0; ch < 6; ch++)
        m_channels[ch].freq_enable = (data & (1 << ch)) != 0;
      break;
    case 0x15:
      for (ch = 0; ch < 6; ch++)
        m_channels[ch].noise_enable = (data & (1 << ch)) != 0;
      break;
    case 0x16:
      m_noise_params[0] = data & 0x03;
      m_noise_params[1] = (data >> 4) & 0x03;
      break;
    case 0x18: case 0x19:
      ch = reg - 0x18;
      m_env_reverse_right[ch] = (data & 1) != 0;
      m_env_mode[ch] = (data >> 1) & 0x07;
      m_env_bits[ch] = (data & 0x10) != 0;
      m_env_clock[ch] = (data & 0x20) != 0;
      m_env_enable[ch] = (data & 0x80) != 0;
      m_env_step[ch] = 0;
      break;
    case 0x1C:
      m_all_ch_enable = (data & 1) != 0;
      m_sync_state = (data & 2) != 0;
      if (data & 2) {
        for (int i = 0; i < 6; i++) {
          m_channels[i].level = 0;
          m_channels[i].counter = m_channels[i].freq();
        }
      }
      break;
    default:
      break;
    }
  }

  // Generate 1 stereo sample at ~390625 Hz (or called per audio tick)
  void render(int32_t &outLeft, int32_t &outRight) {
    if (!m_all_ch_enable) {
      outLeft = 0;
      outRight = 0;
      return;
    }

    for (int ch = 0; ch < 2; ch++) {
      switch (m_noise_params[ch]) {
      case 0:
      case 1:
      case 2:
        m_noise[ch].freq = 256 << m_noise_params[ch];
        break;
      case 3:
        m_noise[ch].freq = m_channels[ch * 3].freq();
        break;
      }
    }

    int output_l = 0;
    int output_r = 0;

    for (int ch = 0; ch < 6; ch++) {
      while (m_channels[ch].counter <= 0) {
        m_channels[ch].counter += m_channels[ch].freq();
        m_channels[ch].level ^= 1;
        if (ch == 1 && !m_env_clock[0]) envelope_w(0);
        if (ch == 4 && !m_env_clock[1]) envelope_w(1);
      }
      m_channels[ch].counter -= clock_divider;

      uint8_t level = 0;
      uint8_t noise_out = m_noise[ch / 3].level & 1;
      uint8_t tone_out = m_channels[ch].level & 1;

      if (m_channels[ch].noise_enable) {
        if (m_channels[ch].freq_enable) {
          level = noise_out ? (tone_out << 1) : tone_out;
        } else {
          level = noise_out;
        }
      } else if (m_channels[ch].freq_enable) {
        level = tone_out;
      }

      if (level > 0) {
        output_l += (int(m_channels[ch].amplitude[0]) * int(m_channels[ch].envelope[0])) / (16 * level);
        output_r += (int(m_channels[ch].amplitude[1]) * int(m_channels[ch].envelope[1])) / (16 * level);
      }
    }

    for (int ch = 0; ch < 2; ch++) {
      while (m_noise[ch].counter <= 0) {
        m_noise[ch].counter += m_noise[ch].freq;
        if (((m_noise[ch].level & 0x20000) == 0) != ((m_noise[ch].level & 0x0400) == 0))
          m_noise[ch].level = (m_noise[ch].level << 1) | 1;
        else
          m_noise[ch].level <<= 1;
      }
      m_noise[ch].counter -= clock_divider;
    }

    outLeft = output_l / 6;
    outRight = output_r / 6;
  }

private:
  static constexpr int clock_divider = 20; // scaled for 390.625 kHz audio tick rate vs ~8MHz SAA clock

  struct Channel {
    uint8_t frequency = 0;
    bool freq_enable = false;
    bool noise_enable = false;
    uint8_t octave = 0;
    uint16_t amplitude[2] = {0, 0};
    uint8_t envelope[2] = {16, 16};
    inline uint32_t freq() const { return (511 - frequency) << (8 - octave); }
    int counter = 0;
    uint8_t level = 0;
  };

  struct Noise {
    int counter = 0;
    int freq = 256;
    uint32_t level = 0xFFFFFFFF;
  };

  Channel m_channels[6];
  Noise m_noise[2];
  uint8_t m_noise_params[2];
  bool m_env_enable[2];
  bool m_env_reverse_right[2];
  uint8_t m_env_mode[2];
  bool m_env_bits[2];
  bool m_env_clock[2];
  uint8_t m_env_step[2];
  bool m_all_ch_enable;
  bool m_sync_state;
  uint8_t m_selected_reg;

  static constexpr uint16_t amplitude_lookup[16] = {
    0, 2047, 4095, 6143, 8191, 10239, 12287, 14335,
    16383, 18431, 20479, 22527, 24575, 26623, 28671, 30719
  };

  void envelope_w(int ch) {
    static const uint8_t env_table[8][64] = {
      { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
      { 15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,
        15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15 },
      { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
      { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,
        15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 },
      { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
      { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0,
        0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 },
      { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,
        0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 },
      { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,
        0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 }
    };

    if (m_env_enable[ch]) {
      int mode = m_env_mode[ch];
      int step = m_env_step[ch] = ((m_env_step[ch] + 1) & 0x3F) | (m_env_step[ch] & 0x20);
      int mask = m_env_bits[ch] ? 14 : 15;

      uint8_t valL = env_table[mode][step] & mask;
      uint8_t valR = m_env_reverse_right[ch] ? ((15 - env_table[mode][step]) & mask) : valL;

      m_channels[ch * 3 + 0].envelope[0] = valL;
      m_channels[ch * 3 + 1].envelope[0] = valL;
      m_channels[ch * 3 + 2].envelope[0] = valL;

      m_channels[ch * 3 + 0].envelope[1] = valR;
      m_channels[ch * 3 + 1].envelope[1] = valR;
      m_channels[ch * 3 + 2].envelope[1] = valR;
    } else {
      m_channels[ch * 3 + 0].envelope[0] = 16;
      m_channels[ch * 3 + 1].envelope[0] = 16;
      m_channels[ch * 3 + 2].envelope[0] = 16;
      m_channels[ch * 3 + 0].envelope[1] = 16;
      m_channels[ch * 3 + 1].envelope[1] = 16;
      m_channels[ch * 3 + 2].envelope[1] = 16;
    }
  }
};

#endif // SAA1099_HPP_INCLUDED
