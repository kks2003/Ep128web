// ep128web -- minimal read-only WAV implementation of the libsndfile API
// subset used by ep128emu's tape emulation (see web/stubs/sndfile.h).
// Licensed under the GNU GPL v2 or later, like ep128emu.

#include <sndfile.h>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <vector>

struct SNDFILE_tag {
  std::FILE   *f;
  long        dataOffset;
  sf_count_t  nFrames;
  sf_count_t  curFrame;
  int         nChannels;
  int         bytesPerSample;
  bool        isFloat;
};

static uint32_t readLE(const unsigned char *p, int n)
{
  uint32_t  x = 0U;
  for (int i = n - 1; i >= 0; i--)
    x = (x << 8) | p[i];
  return x;
}

extern "C" SNDFILE *sf_open(const char *path, int mode, SF_INFO *sfinfo)
{
  if (mode != SFM_READ || !path || !sfinfo)
    return (SNDFILE *) 0;
  std::FILE *f = std::fopen(path, "rb");
  if (!f)
    return (SNDFILE *) 0;
  unsigned char hdr[12];
  if (std::fread(hdr, 1, 12, f) != 12 ||
      std::memcmp(hdr, "RIFF", 4) != 0 || std::memcmp(hdr + 8, "WAVE", 4) != 0) {
    std::fclose(f);
    return (SNDFILE *) 0;
  }
  int   fmtTag = 0, nChannels = 0, bitsPerSample = 0;
  long  sampleRate = 0L;
  bool  haveFmt = false;
  while (true) {
    unsigned char chunk[8];
    if (std::fread(chunk, 1, 8, f) != 8)
      break;
    uint32_t  len = readLE(chunk + 4, 4);
    if (std::memcmp(chunk, "fmt ", 4) == 0 && len >= 16 && len < 1024) {
      unsigned char buf[1024];
      if (std::fread(buf, 1, len, f) != len)
        break;
      fmtTag = int(readLE(buf, 2));
      nChannels = int(readLE(buf + 2, 2));
      sampleRate = long(readLE(buf + 4, 4));
      bitsPerSample = int(readLE(buf + 14, 2));
      if (fmtTag == 0xFFFE && len >= 26)        // WAVE_FORMAT_EXTENSIBLE
        fmtTag = int(readLE(buf + 24, 2));
      haveFmt = true;
      if (len & 1)
        std::fseek(f, 1L, SEEK_CUR);
    }
    else if (std::memcmp(chunk, "data", 4) == 0 && haveFmt) {
      if (!((fmtTag == 1 && (bitsPerSample == 8 || bitsPerSample == 16 ||
                             bitsPerSample == 24 || bitsPerSample == 32)) ||
            (fmtTag == 3 && bitsPerSample == 32)) ||
          nChannels < 1 || nChannels > 16) {
        break;
      }
      SNDFILE *sf = new SNDFILE;
      sf->f = f;
      sf->dataOffset = std::ftell(f);
      sf->nChannels = nChannels;
      sf->bytesPerSample = bitsPerSample / 8;
      sf->isFloat = (fmtTag == 3);
      // clamp to the actual file size (some writers leave len = 0xFFFFFFFF)
      std::fseek(f, 0L, SEEK_END);
      long  avail = std::ftell(f) - sf->dataOffset;
      if (long(len) > avail || long(len) < 0L)
        len = uint32_t(avail);
      sf->nFrames = sf_count_t(len / uint32_t(nChannels * sf->bytesPerSample));
      sf->curFrame = 0;
      std::fseek(f, sf->dataOffset, SEEK_SET);
      std::memset(sfinfo, 0, sizeof(SF_INFO));
      sfinfo->frames = sf->nFrames;
      sfinfo->samplerate = int(sampleRate);
      sfinfo->channels = nChannels;
      sfinfo->sections = 1;
      sfinfo->seekable = 1;
      sfinfo->format = SF_FORMAT_WAV
                       | (sf->isFloat ? SF_FORMAT_FLOAT
                          : (bitsPerSample == 8 ? SF_FORMAT_PCM_U8
                             : (bitsPerSample == 16 ? SF_FORMAT_PCM_16
                                : (bitsPerSample == 24 ? SF_FORMAT_PCM_24
                                   : SF_FORMAT_PCM_32))));
      return sf;
    }
    else {
      if (std::fseek(f, long(len + (len & 1U)), SEEK_CUR) != 0)
        break;
    }
  }
  std::fclose(f);
  return (SNDFILE *) 0;
}

extern "C" int sf_close(SNDFILE *sf)
{
  if (sf) {
    std::fclose(sf->f);
    delete sf;
  }
  return 0;
}

extern "C" sf_count_t sf_seek(SNDFILE *sf, sf_count_t frames, int whence)
{
  sf_count_t  pos = frames;
  if (whence == SEEK_CUR)
    pos += sf->curFrame;
  else if (whence == SEEK_END)
    pos += sf->nFrames;
  if (pos < 0 || pos > sf->nFrames)
    return -1;
  sf->curFrame = pos;
  std::fseek(sf->f, sf->dataOffset
                    + long(pos) * sf->nChannels * sf->bytesPerSample,
             SEEK_SET);
  return pos;
}

extern "C" sf_count_t sf_readf_short(SNDFILE *sf, short *ptr,
                                     sf_count_t frames)
{
  if (frames > sf->nFrames - sf->curFrame)
    frames = sf->nFrames - sf->curFrame;
  if (frames <= 0)
    return 0;
  size_t  nSamples = size_t(frames) * size_t(sf->nChannels);
  std::vector< unsigned char >  buf(nSamples * size_t(sf->bytesPerSample));
  size_t  nRead = std::fread(&(buf.front()), size_t(sf->bytesPerSample)
                                             * size_t(sf->nChannels),
                             size_t(frames), sf->f);
  nSamples = nRead * size_t(sf->nChannels);
  const unsigned char *p = &(buf.front());
  for (size_t i = 0; i < nSamples; i++) {
    int   s = 0;
    switch (sf->bytesPerSample) {
    case 1:
      s = (int(p[0]) - 128) << 8;
      break;
    case 2:
      s = int(int16_t(readLE(p, 2)));
      break;
    case 3:
      s = int(int16_t(readLE(p + 1, 2)));
      break;
    case 4:
      if (sf->isFloat) {
        uint32_t  tmp = readLE(p, 4);
        float     x;
        std::memcpy(&x, &tmp, 4);
        x = x * 32768.0f;
        s = (x < -32768.0f ? -32768 : (x > 32767.0f ? 32767 : int(x)));
      }
      else {
        s = int(int16_t(readLE(p + 2, 2)));
      }
      break;
    }
    ptr[i] = short(s);
    p = p + sf->bytesPerSample;
  }
  sf->curFrame += sf_count_t(nRead);
  return sf_count_t(nRead);
}

extern "C" sf_count_t sf_writef_short(SNDFILE *sf, const short *ptr,
                                      sf_count_t frames)
{
  (void) sf;
  (void) ptr;
  (void) frames;
  return 0;
}
