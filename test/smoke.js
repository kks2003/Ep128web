// Smoke test for the WebAssembly build (run after ./build.sh):
//   node test/smoke.js path/to/ep128emu_roms-2.0.11.bin
// Boots an EP128 with EXOS 2.1 + IS-BASIC + EXDOS + FILE:, enters BASIC,
// saves a program through the FILE: device and loads it back; then does the
// same on a Videoton TVC 64k+ with BASIC 2.2 and tvcfileio.rom.
'use strict';
const fs = require('fs');
const path = require('path');
const createEp128Module = require(path.join(__dirname, '..', 'dist', 'ep128emu.js'));

const KEYS = { a: 0x0E, b: 0x02, c: 0x03, d: 0x0B, e: 0x15, f: 0x0C, g: 0x0A,
  h: 0x08, i: 0x48, j: 0x30, k: 0x32, l: 0x34, m: 0x40, n: 0x00, o: 0x4A,
  p: 0x4C, q: 0x11, r: 0x13, s: 0x0D, t: 0x14, u: 0x10, v: 0x04, w: 0x16,
  x: 0x05, y: 0x12, z: 0x06, ' ': 0x46, '\n': 0x3E, ':': 0x35, '1': 0x19,
  '0': 0x2C };

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

(async () => {
  const pkg = process.argv[2];
  if (!pkg) fail('usage: node test/smoke.js ep128emu_roms-2.0.11.bin');
  const M = await createEp128Module();
  const api = (name, ret, args) => M.cwrap(name, ret, args);
  const unpack = api('ep_unpack_rom_package', 'number', ['string', 'string']);
  const loadRom = api('ep_load_rom', 'number', ['number', 'string', 'number']);
  M.FS.mkdir('/roms');
  M.FS.mkdir('/files');
  M.FS.mkdir('/disk');
  M.FS.writeFile('/pkg.bin', fs.readFileSync(pkg));
  if (unpack('/pkg.bin', '/roms') < 10) fail('ROM package');
  if (M._ep_init(48000) !== 0) fail('init');
  M._ep_reset_memory(128);
  const roms = [[0x00, 'exos21.rom', 0], [0x01, 'exos21.rom', 16384],
    [0x04, 'basic21.rom', 0], [0x10, 'epfileio.rom', 0],
    [0x20, 'exdos14isdos10uk.rom', 0], [0x21, 'exdos14isdos10uk.rom', 16384]];
  for (const [seg, f, offs] of roms)
    if (loadRom(seg, '/roms/' + f, offs) !== 0) fail('loading ' + f);
  M._ep_reset(1);

  const run = (ms) => {
    for (let i = 0; i < ms / 20; i++) { M._ep_run(20000); M._ep_audio_clear(); }
  };
  const activity = (y0, y1) => {
    const p = M._ep_frame_buffer() >> 2;
    const px = M.HEAPU32.subarray(p + 768 * y0, p + 768 * y1);
    let n = 0;
    for (let i = 0; i < px.length; i += 3) if (px[i] !== 0xFF000000) n++;
    return n;
  };
  const press = (code, shift) => {
    if (shift) { M._ep_set_key(0x07, 1); run(40); }
    M._ep_set_key(code, 1); run(80); M._ep_set_key(code, 0); run(20);
    if (shift) M._ep_set_key(0x07, 0);
    run(60);
  };
  const type = (s) => {
    for (const ch of s) {
      if (ch === '"') press(0x1E, true);
      else press(KEYS[ch], false);
      if (ch === '\n') run(600);
    }
  };

  // wait for the ENTERPRISE logo after the memory test
  let t = 0, dark = false, logo = 0;
  for (;;) {
    run(20); t += 20;
    const v = activity(120, 200);
    if (v < 100) dark = true;
    if (dark && v > 300 && v < 4000 && activity(0, 100) < 50) logo++;
    else logo = 0;
    if (logo >= 10) break;
    if (t > 30000) fail('no startup logo');
  }
  console.log('logo after ' + (t / 1000).toFixed(2) + ' s');
  press(0x46, false);
  run(6000);
  if (activity(20, 60) < 300) fail('no IS-BASIC banner');
  type('10 print 1\nsave "file:smoke"\n');
  run(1000);
  if (!M.FS.readdir('/files').includes('smoke')) fail('FILE: save');
  type('new\nload "file:smoke"\n');
  run(1000);
  if (M._ep_audio_frames() !== 0) fail('audio buffer not cleared');
  console.log('EP OK (' + M.FS.stat('/files/smoke').size + ' byte BASIC program saved via FILE:)');

  // Videoton TVC (Hungarian layout as mapped by ep128emu: '0' is EP '@')
  if (M._ep_set_machine_type(1) !== 0) fail('TVC machine type');
  M._ep_reset_memory(128);
  for (const [seg, f] of [[0, 'tvc22_sys.rom'], [2, 'tvc22_ext.rom'], [4, 'tvcfileio.rom']])
    if (loadRom(seg, '/roms/' + f, 0) !== 0) fail('loading ' + f);
  M._ep_reset(1);
  let stable = 0, last = -1;
  for (t = 0; stable < 25; t += 20) {
    run(20);
    const v = activity(20, 60);
    stable = (v > 300 && v === last) ? stable + 1 : 0;
    last = v;
    if (t > 30000) fail('no TVC BASIC banner');
  }
  console.log('TVC BASIC after ' + (t / 1000).toFixed(2) + ' s');
  run(2000);
  KEYS['0'] = 0x4B;
  type('\n1 print 1\nsave "tvcsmoke"\n');
  run(1000);
  if (!M.FS.readdir('/files').includes('tvcsmoke.cas')) fail('TVC FILE: save');
  console.log('TVC OK (' + M.FS.stat('/files/tvcsmoke.cas').size + ' byte .cas file saved via FILE:)');
  for (const [name, size] of [['tvc360.img', 360 * 1024], ['tvc720.img', 720 * 1024]]) {
    const image = '/disk/' + name;
    M.FS.writeFile(image, Buffer.alloc(size));
    if (M._ep_set_disk(0, image) !== 0) fail('TVC ' + name + ' disk image');
    if (M._ep_set_disk(0, '') !== 0) fail('TVC disk eject');
  }
  console.log('TVC OK (360 KiB and 720 KiB floppy images mounted)');
})();
