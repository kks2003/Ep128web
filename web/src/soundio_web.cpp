// ep128web -- replacement for ep128emu's soundio.cpp: the AudioOutput base
// class without PortAudio / libsndfile. The actual output device is
// WebAudioOutput in main.cpp, which hands the samples over to Web Audio.
// Licensed under the GNU GPL v2 or later, like ep128emu.

#include "ep128emu.hpp"
#include "soundio.hpp"

namespace Ep128Emu {

  AudioOutput::AudioOutput()
    : outputFileName(""),
      soundFile((SNDFILE *) 0),
      deviceNumber(-1),
      sampleRate(0.0f),
      totalLatency(0.0f),
      nPeriodsHW(0),
      nPeriodsSW(0)
  {
  }

  AudioOutput::~AudioOutput()
  {
  }

  void AudioOutput::setParameters(int deviceNumber_, float sampleRate_,
                                  float totalLatency_,
                                  int nPeriodsHW_, int nPeriodsSW_)
  {
    deviceNumber = (deviceNumber_ >= 0 ? deviceNumber_ : -1);
    sampleRate = (sampleRate_ > 11025.0f ?
                  (sampleRate_ < 192000.0f ? sampleRate_ : 192000.0f)
                  : 11025.0f);
    totalLatency = totalLatency_;
    nPeriodsHW = nPeriodsHW_;
    nPeriodsSW = nPeriodsSW_;
    if (deviceNumber >= 0)
      openDevice();
  }

  void AudioOutput::setOutputFile(const std::string& fileName)
  {
    if (fileName.length() != 0)
      throw Exception("sound file output is not supported in the web version");
  }

  void AudioOutput::sendAudioData(const int16_t *buf, size_t nFrames)
  {
    (void) buf;
    (void) nFrames;
  }

  void AudioOutput::closeDevice()
  {
    deviceNumber = -1;
  }

  std::vector< std::string > AudioOutput::getDeviceList()
  {
    std::vector< std::string >  tmp;
    tmp.push_back("Web Audio");
    return tmp;
  }

  void AudioOutput::openDevice()
  {
  }

}       // namespace Ep128Emu
