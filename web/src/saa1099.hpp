// Philips SAA1099 sound chip, after SAASound by Dave Hooper and Simon Owen
// (as ported to TypeScript in SAA1099Tracker by Martin Borik):
//   https://github.com/mborik/SAA1099Tracker/tree/main/src/libs/SAASound
//
// SAASound - a portable Philips SAA 1099 sound chip emulator
// Copyright (c) 1998-2004, Dave Hooper <dave@beermex.com>
// Copyright (c) 2004-2025, Dave Hooper <dave@beermex.com> + Simon Owen <simon@simonowen.com>
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// - Redistributions of source code must retain the above copyright notice, this
//   list of conditions and the following disclaimer.
//
// - Redistributions in binary form must reproduce the above copyright notice,
//   this list of conditions and the following disclaimer in the documentation
//   and/or other materials provided with the distribution.
//
// - Neither the name Dave Hooper nor the names of its contributors may
//   be used to endorse or promote products derived from this software without
//   specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
// ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
// ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
// (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
// LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
// ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Ep128web: the generators count in exact integer steps of the 8 MHz chip
// clock of the TVC Multichip Soundcard (crystal Q2), at the 390625 Hz rate
// of render(): one call is 20.48 clocks = 512/25, so the counters are in
// units of 1/25 clock.

#ifndef SAA1099_HPP_INCLUDED
#define SAA1099_HPP_INCLUDED

#include <cstdint>

class SAA1099 {
 public:
  SAA1099()
  {
    for (int i = 0; i < 2; i++) {
      env[i].loadData(0);
      noise[i].rnd = 0xFFFFFFFFu;
    }
    for (int i = 0; i < 6; i++) {
      freq[i].noise = (i == 0 || i == 3) ? &noise[i / 3] : nullptr;
      freq[i].env = (i == 1 || i == 4) ? &env[i / 3] : nullptr;
      amp[i].freq = &freq[i];
      amp[i].noise = &noise[i / 3];
      amp[i].env = (i == 2 || i == 5) ? &env[i / 3] : nullptr;
    }
    reset();
  }

  void reset()
  {
    // as the chip after power-on: sync and mute, all registers 0
    writeRegister(28, 2);
    for (int r = 31; r >= 0; r--) {
      if (r != 28)
        writeRegister(r, 0);
    }
    writeRegister(28, 0);
    writeAddress(0);
  }

  void writeAddress(uint8_t data)
  {
    selectedReg = data & 0x1F;
    // an address write to an envelope register is its external clock
    if (selectedReg == 24)
      env[0].tickExt();
    else if (selectedReg == 25)
      env[1].tickExt();
  }

  void writeData(uint8_t data)
  {
    switch (selectedReg) {
    case 0: case 1: case 2: case 3: case 4: case 5:
      amp[selectedReg].setLevel(data);
      break;
    case 8: case 9: case 10: case 11: case 12: case 13:
      freq[selectedReg & 7].setOffset(data);
      break;
    case 16: case 17: case 18: {
      int ch = (selectedReg - 16) * 2;
      freq[ch].setOctave(data & 7);
      freq[ch + 1].setOctave((data >> 4) & 7);
      break;
    }
    case 20:
      for (int i = 0; i < 6; i++)
        amp[i].setFreqMixer(data & (1 << i));
      break;
    case 21:
      for (int i = 0; i < 6; i++)
        amp[i].setNoiseMixer(data & (1 << i));
      break;
    case 22:
      noise[0].set(data & 3);
      noise[1].set((data >> 4) & 3);
      break;
    case 24:
    case 25:
      env[selectedReg - 24].set(data);
      break;
    case 28: {
      bool mute = !(data & 1);
      bool sync = (data & 2) != 0;
      for (int i = 0; i < 6; i++)
        freq[i].setSync(sync);
      for (int i = 0; i < 2; i++)
        noise[i].setSync(sync);
      for (int i = 0; i < 6; i++)
        amp[i].mute = mute;
      break;
    }
    default:
      break;
    }
  }

  // one stereo sample at 390625 Hz; each channel gives 0..480, the sum is
  // scaled to 0..30720
  void render(int32_t &outLeft, int32_t &outRight)
  {
    noise[0].tick();
    noise[1].tick();
    int left = 0, right = 0;
    for (int i = 0; i < 6; i++)
      amp[i].output(left, right);
    outLeft = left * 64 / 6;
    outRight = right * 64 / 6;
  }

 private:
  static const int32_t kStep = 512;       // 20.48 clocks per render() call, in 1/25 clocks
  static const int32_t kClockUnit = 25;

  // ------------------------------------------------------------------------
  // envelope generator

  struct Env {
    int left = 0, right = 0;
    bool enabled = false;
    int table = 0;
    bool stereo = false;
    int phase = 0, position = 0;
    bool ended = true, loop = false;
    int phaseLen = 1;
    bool res = false;                 // 3-bit resolution
    bool newData = false;
    uint8_t nextData = 0;
    bool processData = false;
    bool extClock = false;

    struct Shape { int plen; bool loop; uint8_t data[2][2][16]; };

    static const Shape &shape(int i)
    {
      static const Shape shapes[8] = {
        { 1, false, { { { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } },
                      { { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } } } },
        { 1, true, { { { 15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15 }, { 15,15,15,15,15,15,15,15,15,15,15,15,15,15,15,15 } },
                     { { 14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14 }, { 14,14,14,14,14,14,14,14,14,14,14,14,14,14,14,14 } } } },
        { 1, false, { { { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } },
                      { { 14,14,12,12,10,10,8,8,6,6,4,4,2,2,0,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } } } },
        { 1, true, { { { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } },
                     { { 14,14,12,12,10,10,8,8,6,6,4,4,2,2,0,0 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } } } },
        { 2, false, { { { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 }, { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 } },
                      { { 0,0,2,2,4,4,6,6,8,8,10,10,12,12,14,14 }, { 14,14,12,12,10,10,8,8,6,6,4,4,2,2,0,0 } } } },
        { 2, true, { { { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 }, { 15,14,13,12,11,10,9,8,7,6,5,4,3,2,1,0 } },
                     { { 0,0,2,2,4,4,6,6,8,8,10,10,12,12,14,14 }, { 14,14,12,12,10,10,8,8,6,6,4,4,2,2,0,0 } } } },
        { 1, false, { { { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } },
                      { { 0,0,2,2,4,4,6,6,8,8,10,10,12,12,14,14 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } } } },
        { 1, true, { { { 0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } },
                     { { 0,0,2,2,4,4,6,6,8,8,10,10,12,12,14,14 }, { 0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0 } } } }
      };
      return shapes[i & 7];
    }

    void tickInt() { if (enabled && !extClock) tick(); }
    void tickExt() { if (enabled && extClock) tick(); }

    void set(uint8_t data)
    {
      res = (data & 0x10) != 0;
      enabled = (data & 0x80) != 0;
      if (!enabled) {
        phase = 0;
        position = 0;
        ended = true;
        processData = true;
        newData = true;
        nextData = data;
        setLevels();
        return;
      }
      if (processData) {
        loadData(data);
        newData = false;
        processData = false;
      }
      else {
        // the new data is acted upon at the end of the current cycle
        setLevels();
        newData = true;
        nextData = data;
      }
    }

    void tick()
    {
      if (!enabled) {
        ended = true;
        phase = 0;
        position = 0;
        processData = true;
        return;
      }
      if (ended)
        return;
      position += res ? 2 : 1;
      processData = false;
      if (position >= 16) {
        phase++;
        position -= 16;
        if (phase == phaseLen) {
          processData = true;
          if (!loop) {
            ended = true;
            phase = phaseLen - 1;
            position = 15;
          }
          else {
            ended = false;
            phase = 0;
          }
        }
      }
      if (newData && processData) {
        newData = false;
        processData = false;
        loadData(nextData);
      }
      else {
        setLevels();
      }
    }

    void setLevels()
    {
      int r = res ? 1 : 0;
      left = shape(table).data[r][phase][position];
      right = stereo ? (15 - r) - left : left;
    }

    void loadData(uint8_t data)
    {
      phase = 0;
      position = 0;
      table = (data >> 1) & 7;
      stereo = (data & 1) != 0;
      extClock = (data & 0x20) != 0;
      phaseLen = shape(table).plen;
      loop = shape(table).loop;
      res = (data & 0x10) != 0;
      enabled = (data & 0x80) != 0;
      if (enabled) {
        ended = false;
      }
      else {
        ended = true;
        processData = true;
      }
      setLevels();
    }
  };

  // ------------------------------------------------------------------------
  // noise generator

  struct Noise {
    int level = 0;
    int32_t counter = 0;
    int32_t period = (256 << 0) * kClockUnit;   // 31.25 / 15.63 / 7.81 kHz
    bool sync = false;
    int src = 0;
    uint32_t rnd = 0xFFFFFFFFu;

    void set(int s)
    {
      src = s & 3;
      period = (256 << src) * kClockUnit;
    }

    // clocked by the frequency generator 0 or 3 in source mode 3
    void trigger()
    {
      if (src == 3)
        step();
    }

    void tick()
    {
      if (!sync && src != 3) {
        counter += kStep;
        while (counter >= period) {
          counter -= period;
          step();
        }
      }
    }

    void setSync(bool s)
    {
      if (s)
        counter = 0;
      sync = s;
    }

    void step()
    {
      uint32_t t = rnd & 0x40000004u;
      if (t && t != 0x40000004u)
        rnd = (rnd << 1) | 1;
      else
        rnd <<= 1;
      level = int(rnd & 1) << 1;
    }
  };

  // ------------------------------------------------------------------------
  // frequency (tone) generator

  struct Freq {
    int level = 2;
    int32_t counter = 0;
    int32_t period = 511 * 256 * kClockUnit;  // half-cycle length
    int curOffset = 0, curOctave = 0;
    int nextOffset = 0, nextOctave = 0;
    bool ignoreOffset = false;
    bool newData = false;
    bool sync = false;
    Noise *noise = nullptr;
    Env *env = nullptr;

    void setPeriod()
    {
      // a half-cycle is (511 - offset) * 256 / 2^octave clocks
      period = ((511 - curOffset) << (8 - curOctave)) * kClockUnit;
    }

    void setOffset(int offset)
    {
      if (!sync) {
        nextOffset = offset;
        newData = true;
        // octave, then offset written: on the next half-cycle only the
        // octave is acted upon, the offset the time after (Philips)
        if (nextOctave == curOctave)
          ignoreOffset = true;
      }
      else {
        newData = false;
        curOffset = offset;
        curOctave = nextOctave;
        setPeriod();
      }
    }

    void setOctave(int octave)
    {
      if (!sync) {
        nextOctave = octave;
        newData = true;
        ignoreOffset = false;
      }
      else {
        newData = false;
        curOctave = octave;
        curOffset = nextOffset;
        setPeriod();
      }
    }

    // the buffered octave and offset take effect at the end of a half-cycle
    void update()
    {
      if (!newData)
        return;
      curOctave = nextOctave;
      if (!ignoreOffset) {
        curOffset = nextOffset;
        newData = false;
      }
      ignoreOffset = false;
      setPeriod();
    }

    int tick()
    {
      if (!sync) {
        counter += kStep;
        if (counter >= period) {
          while (counter >= period) {
            counter -= period;
            level = 2 - level;
            if (env)
              env->tickInt();
            else if (noise)
              noise->trigger();
          }
          update();
        }
      }
      return level;
    }

    void setSync(bool s)
    {
      sync = s;
      if (s) {
        counter = 0;
        level = 2;
        curOctave = nextOctave;
        curOffset = nextOffset;
        setPeriod();
      }
    }
  };

  // ------------------------------------------------------------------------
  // tone/noise mixing, envelope and amplitude of a channel

  struct Amp {
    bool mute = true;
    int lastLevel = -1;
    int leftx16 = 0, leftx32 = 0, lefta0E = 0, lefta0Ex2 = 0;
    int rightx16 = 0, rightx32 = 0, righta0E = 0, righta0Ex2 = 0;
    int out = 0;
    int mix = 0;
    Freq *freq = nullptr;
    Noise *noise = nullptr;
    Env *env = nullptr;                 // only channels 2 and 5 have one

    void setLevel(int level)
    {
      level &= 0xFF;
      if (level == lastLevel)
        return;
      lastLevel = level;
      lefta0E = level & 0x0E;
      lefta0Ex2 = lefta0E << 1;
      leftx16 = (level & 0x0F) << 4;
      leftx32 = leftx16 << 1;
      righta0E = (level >> 4) & 0x0E;
      righta0Ex2 = righta0E << 1;
      rightx16 = level & 0xF0;
      rightx32 = rightx16 << 1;
    }

    void setFreqMixer(int enable) { mix = enable ? (mix | 1) : (mix & 2); }
    void setNoiseMixer(int enable) { mix = enable ? (mix | 2) : (mix & 1); }

    void tick()
    {
      switch (mix) {
      case 0:
        freq->tick();
        out = 0;
        break;
      case 1:
        out = freq->tick();
        break;
      case 2:
        freq->tick();
        out = noise->level;
        break;
      default:
        out = freq->tick();
        if (out == 2 && noise->level)
          out = 1;
        break;
      }
    }

    void output(int &left, int &right)
    {
      tick();
      if (mute)
        return;
      bool envOn = env && env->enabled;
      switch (out) {
      case 0:
        if (envOn) {
          left += env->left * lefta0Ex2;
          right += env->right * righta0Ex2;
        }
        break;
      case 1:
        if (envOn) {
          left += env->left * lefta0E;
          right += env->right * righta0E;
        }
        else {
          left += leftx16;
          right += rightx16;
        }
        break;
      default:
        if (!envOn) {
          left += leftx32;
          right += rightx32;
        }
        break;
      }
    }
  };

  Env env[2];
  Noise noise[2];
  Freq freq[6];
  Amp amp[6];
  int selectedReg = 0;

  void writeRegister(int reg, uint8_t data)
  {
    writeAddress(uint8_t(reg));
    writeData(data);
  }
};

#endif // SAA1099_HPP_INCLUDED
