/* Minimal PortAudio type stubs for the WebAssembly build: audio output is
   handled by web/webaudio.cpp + Web Audio, PortAudio itself is not used. */
#ifndef EP128WEB_PORTAUDIO_STUB_H
#define EP128WEB_PORTAUDIO_STUB_H
typedef void PaStream;
typedef unsigned long PaStreamCallbackFlags;
typedef double PaTime;
typedef struct PaStreamCallbackTimeInfo {
  PaTime inputBufferAdcTime;
  PaTime currentTime;
  PaTime outputBufferDacTime;
} PaStreamCallbackTimeInfo;
typedef double PaTimestamp;
#endif
