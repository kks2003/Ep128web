// Ep128web: tape helpers
//  - tapToWav: ep128emu tape file (.tap, what the emulator records) -> .wav
//  - casToWav: TVC .cas -> .wav, encoded like the TVC ROM's cassette writer
//    (see the ROM listing, F972-FB0D: block write, tones, CRC)

function wavFile(samples, rate) {
  const n = samples.length;
  const out = new Uint8Array(44 + n + (n & 1));
  const dv = new DataView(out.buffer);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) out[o + i] = s.charCodeAt(i); };
  str(0, 'RIFF'); dv.setUint32(4, 36 + n + (n & 1), true); str(8, 'WAVE');
  str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  str(36, 'data'); dv.setUint32(40, n, true);
  out.set(samples, 44);
  return out;
}

// ep128emu tape file: 4096 byte header of big endian 32 bit words
// (magic 0x0275CD72 0x1C445126, bits per sample, sample rate, cue points),
// then the samples packed MSB first
export function tapToWav(tap) {
  const be = (o) => ((tap[o] << 24) | (tap[o + 1] << 16) | (tap[o + 2] << 8) | tap[o + 3]) >>> 0;
  if (tap.length < 4096 || be(0) !== 0x0275CD72 || be(4) !== 0x1C445126) throw new Error('nem ep128emu kazettafájl');
  const bits = be(8), rate = be(12);
  if (![1, 2, 4, 8].includes(bits) || rate < 10000 || rate > 120000) throw new Error('hibás kazettafájl');
  const per = 8 / bits, max = (1 << bits) - 1;
  const n = (tap.length - 4096) * per;
  const s = new Uint8Array(n);
  let k = 0;
  for (let i = 4096; i < tap.length; i++) {
    const b = tap[i];
    for (let j = per - 1; j >= 0; j--) {
      const v = (b >> (j * bits)) & max;
      s[k++] = 0x20 + Math.round(v * 0xC0 / max);
    }
  }
  // drop the silence at the end (an empty recording is all zeros)
  let end = n;
  while (end > 0 && s[end - 1] === 0x20) end--;
  return wavFile(s.subarray(0, Math.min(n, end + rate)), rate);
}

const RATE = 44100;
const TICK = 1 / 195312.5;              // sound generator clock (3.125 MHz / 16)
const LEAD = 0xD6, ONE = 0xDE, ZERO = 0xCE, SYNC = 0xBC;

class Writer {
  constructor() { this.out = []; this.t = 0; this.level = false; this.crc = 0; }
  silence(sec) {
    const n = Math.round(sec * RATE);
    for (let i = 0; i < n; i++) this.out.push(0x80);
    this.t = 0;
  }
  half(pitch) {
    // one sound interrupt period: the tape output toggles at each one
    this.t += (4096 - (0xF00 | pitch)) * TICK * RATE;
    const n = Math.round(this.t);
    this.t -= n;
    this.level = !this.level;
    const v = this.level ? 0xD0 : 0x30;
    for (let i = 0; i < n; i++) this.out.push(v);
  }
  period(pitch) { this.half(pitch); this.half(pitch); }
  byte(c) {
    for (let i = 0; i < 8; i++) {
      const bit = (c >> i) & 1;
      this.period(bit ? ONE : ZERO);
      const fb = bit ^ (this.crc >> 15);
      this.crc = ((this.crc << 1) ^ (fb ? 0x1021 : 0)) & 0xFFFF;
    }
  }
  // one block: lead tone, sync, block type, file type, protection,
  // sector count, then the sectors, each with its own CRC
  block(type, fileType, protect, data, sector) {
    this.silence(1);
    const lead = (type ? 40 : 20) * 256;
    for (let i = 0; i < lead; i++) this.period(LEAD);
    this.period(SYNC);
    this.byte(0);
    this.crc = 0;
    this.byte(0x6A);
    this.byte(type);
    this.byte(fileType);
    this.byte(protect);
    this.byte((data.length + 255) >> 8);
    for (let p = 0; p < data.length; p += 256, sector++) {
      if (p) this.crc = 0;
      const n = Math.min(256, data.length - p);
      this.byte(sector & 255);
      this.byte(n & 255);
      for (let i = 0; i < n; i++) this.byte(data[p + i]);
      this.byte(p + n >= data.length && type === 0 ? 0xFF : 0);
      const crc = this.crc;
      this.byte(crc & 255);
      this.byte(crc >> 8);
    }
    for (let i = 0; i < 5; i++) this.period(LEAD);
    return sector;
  }
}

// TVC .cas: 128 byte header (file type, protection, 128 byte block count,
// last block length), then the file itself (16 byte program header + program)
export function casToWav(cas, name) {
  if (cas.length < 144 || (cas[0] !== 0x11 && cas[0] !== 0x01)) throw new Error('nem TVC .cas fájl');
  const blocks = cas[2] | (cas[3] << 8), last = cas[4] | (cas[5] << 8);
  let len = blocks ? (blocks - 1) * 128 + last : cas.length - 128;
  if (len <= 0 || 128 + len > cas.length) len = cas.length - 128;
  const data = cas.subarray(128, 128 + len);
  // the name the ROM stores: max. 16 characters, upper case
  const nm = Array.from(String(name).replace(/\.[^.]*$/, '').toUpperCase().slice(0, 16), (ch) => {
    const c = ch.charCodeAt(0);
    return c >= 32 && c < 127 ? c : 0x5F;
  });
  const w = new Writer();
  const fileType = 0x11, protect = cas[1] ? 0xFF : 0;
  // the first 16 bytes (the program header) go to the header block after
  // the name (CAS_CHOUT), the rest to the data block (CAS_BKOUT)
  const head = Math.min(16, data.length);
  const sector = w.block(0xFF, fileType, protect, Uint8Array.from([nm.length, ...nm, ...data.subarray(0, head)]), 0);
  if (data.length > head) w.block(0x00, fileType, protect, data.subarray(head), sector);
  w.silence(1);
  return wavFile(Uint8Array.from(w.out), RATE);
}
