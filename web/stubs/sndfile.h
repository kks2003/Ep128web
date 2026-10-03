/* Minimal libsndfile replacement for the WebAssembly build.
   Only what ep128emu's tape.cpp needs: read-only access to uncompressed
   PCM WAV files (8/16/24/32 bit integer and 32 bit float). */
#ifndef EP128WEB_SNDFILE_STUB_H
#define EP128WEB_SNDFILE_STUB_H
#include <stdint.h>
#include <stdio.h>
#ifdef __cplusplus
extern "C" {
#endif
typedef int64_t sf_count_t;
typedef struct SNDFILE_tag SNDFILE;
typedef struct SF_INFO {
  sf_count_t frames;
  int samplerate;
  int channels;
  int format;
  int sections;
  int seekable;
} SF_INFO;
enum {
  SFM_READ = 0x10, SFM_WRITE = 0x20, SFM_RDWR = 0x30
};
enum {
  SF_FORMAT_WAV = 0x010000,
  SF_FORMAT_PCM_S8 = 0x0001, SF_FORMAT_PCM_16 = 0x0002,
  SF_FORMAT_PCM_24 = 0x0003, SF_FORMAT_PCM_32 = 0x0004,
  SF_FORMAT_PCM_U8 = 0x0005, SF_FORMAT_FLOAT = 0x0006,
  SF_FORMAT_DOUBLE = 0x0007, SF_FORMAT_ULAW = 0x0010,
  SF_FORMAT_ALAW = 0x0011, SF_FORMAT_IMA_ADPCM = 0x0012,
  SF_FORMAT_MS_ADPCM = 0x0013,
  SF_FORMAT_SUBMASK = 0x0000FFFF, SF_FORMAT_TYPEMASK = 0x0FFF0000
};
SNDFILE *sf_open(const char *path, int mode, SF_INFO *sfinfo);
int sf_close(SNDFILE *sndfile);
sf_count_t sf_seek(SNDFILE *sndfile, sf_count_t frames, int whence);
sf_count_t sf_readf_short(SNDFILE *sndfile, short *ptr, sf_count_t frames);
sf_count_t sf_writef_short(SNDFILE *sndfile, const short *ptr,
                           sf_count_t frames);
#ifdef __cplusplus
}
#endif
#endif
