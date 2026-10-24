// ep128web front end: drives the WebAssembly build of ep128emu
// (see web/src/main.cpp for the C API used here).
(() => {
  'use strict';

  // --------------------------------------------------------------------------
  // Machine configurations (subset of the ones created by ep128emu's
  // epmakecfg); ROM file names are those in ep128emu_roms-2.0.11.bin

  // type 0: Enterprise, 1: Videoton TVC. For the TVC, tvcfileio.rom is added
  // automatically when FILE: is in use (it replaces the cassette device).
  const MACHINES = [
    {
      id: 'ep128uk-exdos', name: 'EP128 (UK) · EXDOS · 128K', ram: 128,
      roms: [['exos21.rom', [0x00, 0x01]], ['basic21.rom', [0x04]],
             ['epfileio.rom', [0x10]], ['exdos14isdos10uk.rom', [0x20, 0x21]]]
    },
    {
      id: 'ep128hu-exdos', name: 'EP128 (magyar) · EXDOS · 128K', ram: 128,
      roms: [['exos21.rom', [0x00, 0x01]], ['hun.rom', [0x04]],
             ['basic21.rom', [0x05]], ['epfileio.rom', [0x10]],
             ['exdos14isdos10uk-hfont.rom', [0x20, 0x21]]]
    },
    {
      id: 'ep128uk-tape', name: 'EP128 (UK) · csak magnó · 128K', ram: 128,
      roms: [['exos21.rom', [0x00, 0x01]], ['basic21.rom', [0x04]],
             ['epfileio.rom', [0x10]]]
    },
    {
      id: 'ep640uk', name: 'EP 640K · EXOS 2.32 (UK) · EXDOS', ram: 640,
      roms: [['exos232uk.rom', [0x00, 0x01, 0x02, 0x03]],
             ['epfileio.rom', [0x10]], ['exdos14isdos10uk.rom', [0x20, 0x21]]]
    },
    {
      id: 'ep640hu', name: 'EP 640K · EXOS 2.32 (magyar) · EXDOS', ram: 640,
      roms: [['exos232hun.rom', [0x00, 0x01, 0x02, 0x03]],
             ['epfileio.rom', [0x10]],
             ['exdos14isdos10uk-hfont.rom', [0x20, 0x21]]]
    },
    {
      id: 'ep2048uk', name: 'EP 2048K · EXOS 2.4 (UK) · EXDOS', ram: 2048,
      roms: [['exos24uk.rom', [0x00, 0x01, 0x02, 0x03]],
             ['epfileio.rom', [0x10]], ['exdos14isdos10uk.rom', [0x20, 0x21]]]
    },
    {
      id: 'ep2048uk-tape', name: 'EP 2048K · EXOS 2.4 (UK) · csak magnó', ram: 2048,
      roms: [['exos24uk.rom', [0x00, 0x01, 0x02, 0x03]],
             ['epfileio.rom', [0x10]]]
    },
    {
      id: 'tvc64p-22', type: 1, name: 'TVC 64k+ · BASIC 2.2', ram: 128,
      roms: [['tvc22_sys.rom', [0x00]], ['tvc22_ext.rom', [0x02]]]
    },
    {
      id: 'tvc64-12', type: 1, name: 'TVC 64k · BASIC 1.2', ram: 80,
      roms: [['tvc12_sys.rom', [0x00]], ['tvc12_ext.rom', [0x02]]]
    },
    {
      id: 'tvc32-12', type: 1, name: 'TVC 32k · BASIC 1.2', ram: 48,
      roms: [['tvc12_sys.rom', [0x00]], ['tvc12_ext.rom', [0x02]]]
    },
    // with a system cartridge (segment 1) and the disk card it needs, which
    // the page puts into a slot (as ep128emu's TVC_64k+_V22_VTDOS_CART and
    // TVC_64k+_V12_UPM configurations)
    {
      id: 'tvc64p-22-vtdoscart', type: 1, name: 'TVC 64k+ · BASIC 2.2 · VT-DOS (cartridge)', ram: 128,
      roms: [['tvc22_sys.rom', [0x00]], ['tvc22_ext.rom', [0x02]], ['tvc_dos12c.rom', [0x01]]],
      diskCard: 1, cart: 'vtdos'
    },
    {
      id: 'tvc64p-12-upm', type: 1, name: 'TVC 64k+ · BASIC 1.2 · UPM (cartridge)', ram: 128,
      roms: [['tvc12_sys.rom', [0x00]], ['tvc12_ext.rom', [0x02]], ['tvcupm_c.rom', [0x01]]],
      diskCard: 6, cart: 'upm'
    }
  ];
  for (const m of MACHINES) m.type = m.type || 0;
  // machine ids of earlier versions (VT-DOS is a card in a slot now)
  const DEFAULT_TVC = 'tvc64-12';   // the default machine, and the TVC switched to for TVC files
  let lastPlainTvc = DEFAULT_TVC;    // the last TVC without a system cartridge
  const MACHINE_ALIASES = { 'tvc64p-22-vtdos': 'tvc64p-22', 'tvc64-12-vtdos': 'tvc64-12' };

  // TVC expansion cards; the ids are those of ep_set_tvc_slot(), except for
  // the UPM disk card, which is the VT-DOS card's hardware (hw) with the
  // ROM of the UPM compatible floppy interface
  const SLOT_EMPTY = 0, SLOT_VTDOS = 1, SLOT_FILEIO = 2, SLOT_CARD256 = 5, SLOT_UPM = 6;
  const TVC_CARDS = [
    { id: SLOT_EMPTY, name: '— üres —' },
    { id: SLOT_VTDOS, name: 'VT-DOS (lemez)', rom: 'tvc_dos12d.rom', seg: 0x03 },
    { id: SLOT_UPM, name: 'UPM (lemez)', rom: 'tvcupm_d.rom', seg: 0x03, hw: SLOT_VTDOS },
    { id: SLOT_FILEIO, name: 'FILE: (.cas fájlok)', rom: 'tvcfileio.rom', seg: 0x04 },
    { id: 3, name: 'GameCard (SN76489 + Joy 3-4)' },
    { id: 4, name: 'Multichip Soundcard (SN, SAA, OPL2)' },
    { id: SLOT_CARD256, name: 'TVC256k++' }
  ];
  // the card initialized last (highest slot) of VT-DOS, FILE: and TVC256k++
  // becomes the default storage device, so VT-DOS comes after FILE:
  const TVC_DEFAULT_SLOTS = [SLOT_FILEIO, SLOT_VTDOS, 3, SLOT_EMPTY];

  // KeyboardEvent.code -> Enterprise keyboard matrix position (row * 8 + col),
  // following ep128emu's default config/ep_keys.cfg
  const KEYMAP = {
    KeyN: 0x00, Backslash: 0x01, IntlBackslash: 0x01, KeyB: 0x02, KeyC: 0x03,
    KeyV: 0x04, KeyX: 0x05, KeyZ: 0x06, ShiftLeft: 0x07,
    KeyH: 0x08, CapsLock: 0x09, KeyG: 0x0A, KeyD: 0x0B, KeyF: 0x0C,
    KeyS: 0x0D, KeyA: 0x0E, ControlLeft: 0x0F, ControlRight: 0x0F,
    KeyU: 0x10, KeyQ: 0x11, KeyY: 0x12, KeyR: 0x13, KeyT: 0x14, KeyE: 0x15,
    KeyW: 0x16, Tab: 0x17,
    Digit7: 0x18, Digit1: 0x19, Digit6: 0x1A, Digit4: 0x1B, Digit5: 0x1C,
    Digit3: 0x1D, Digit2: 0x1E, Escape: 0x1F,
    F4: 0x20, F8: 0x21, F3: 0x22, F6: 0x23, F5: 0x24, F7: 0x25, F2: 0x26,
    F1: 0x27,
    Digit8: 0x28, Digit9: 0x2A, Minus: 0x2B, Digit0: 0x2C, Equal: 0x2D,
    Backspace: 0x2E,
    KeyJ: 0x30, KeyK: 0x32, Semicolon: 0x33, KeyL: 0x34, Quote: 0x35,
    BracketRight: 0x36,
    End: 0x38, Pause: 0x38, ArrowDown: 0x39, ArrowRight: 0x3A, ArrowUp: 0x3B,
    Home: 0x3C, ArrowLeft: 0x3D, Enter: 0x3E, NumpadEnter: 0x3E,
    AltLeft: 0x3F, AltRight: 0x3F,
    KeyM: 0x40, Delete: 0x41, Comma: 0x42, Slash: 0x43, Period: 0x44,
    ShiftRight: 0x45, Space: 0x46, Insert: 0x47,
    KeyI: 0x48, KeyO: 0x4A, Backquote: 0x4B, KeyP: 0x4C, BracketLeft: 0x4D,
  };
  const KEYMAP_TVC = Object.assign({}, KEYMAP, {
    Escape: 0x38, IntlBackslash: 0x1F, End: undefined, Pause: undefined
  });
  // TVC: End and Pause press CTRL+ESC, the STOP of the TVC (Ctrl+Esc itself
  // is taken by Windows for the Start menu)
  const TVC_STOP_KEYS = new Set(['End', 'Pause']);
  const TVC_STOP = [0x0F, 0x38];

  // --------------------------------------------------------------------------
  // Joysticks: each input (key set, gamepad, touch joystick) drives one of the
  // joysticks chosen on the Joystick panel. State bits: 0..4 = right, left,
  // down, up, fire.
  // TVC: 1 = port 1 (the same as the built-in cursor joystick), 2 = port 2,
  // 3 and 4 = the GameCard's joysticks; Enterprise: 1 and 2 = external.
  const JOY_SOURCES = [
    { id: 'numpad', name: 'Num 8/4/6/2 + 0',
      keys: { Numpad6: 1, Numpad4: 2, Numpad2: 4, Numpad5: 4, Numpad8: 8, Numpad0: 16 } },
    { id: 'arrows', name: 'Nyilak + j.Ctrl',
      keys: { ArrowRight: 1, ArrowLeft: 2, ArrowDown: 4, ArrowUp: 8, ControlRight: 16 } },
    { id: 'wasd', name: 'WASD + Space',
      keys: { KeyD: 1, KeyA: 2, KeyS: 4, KeyW: 8, Space: 16 } },
    { id: 'gp1', name: 'Gamepad 1' }, { id: 'gp2', name: 'Gamepad 2' },
    { id: 'gp3', name: 'Gamepad 3' }, { id: 'gp4', name: 'Gamepad 4' },
    { id: 'touch', name: 'Érintős' }
  ];
  const JOY_DEFAULT = { numpad: 1, arrows: 0, wasd: 0, gp1: 1, gp2: 2, gp3: 3, gp4: 4, touch: 1 };
  let joyTarget = Object.assign({}, JOY_DEFAULT);
  try {
    const v = JSON.parse(localStorage.getItem('ep128web.joymap'));
    if (v && typeof v === 'object') Object.assign(joyTarget, v);
  } catch (e) { }
  const joySource = {};             // current state of each input
  const joyOut = [0, 0, 0, 0, 0];   // state sent to joystick 1..4

  function joyCount() { return machine && machine.type === 1 ? 4 : 2; }

  function joyName(t) {
    if (machine && machine.type === 1)
      return ['nincs', '1. port', '2. port', 'GameCard 3', 'GameCard 4'][t];
    return ['nincs', 'külső 1', 'külső 2'][t];
  }

  // sends the changes of the joystick states to the machine
  function updateJoysticks() {
    for (let t = 1; t <= 4; t++) {
      let state = 0;
      if (t <= joyCount()) {
        for (const src of JOY_SOURCES)
          if (joyTarget[src.id] === t) state |= joySource[src.id] || 0;
      }
      const old = joyOut[t];
      if (state === old) continue;
      joyOut[t] = state;
      if (t <= 2) {
        const base = t === 1 ? 0x70 : 0x78;
        for (let i = 0; i < 5; i++) {
          const bit = 1 << i;
          if ((state & bit) && !(old & bit)) keyDown(base + i);
          else if (!(state & bit) && (old & bit)) keyUp(base + i);
        }
      } else if (api && api.setTvcExtJoy) {
        // GameCard: active low, bits up, down, left, right, fire
        let b = 0xFF;
        if (state & 8) b &= ~1;
        if (state & 4) b &= ~2;
        if (state & 2) b &= ~4;
        if (state & 1) b &= ~8;
        if (state & 16) b &= ~16;
        api.setTvcExtJoy(t - 3, b);
      }
    }
  }

  // the key-set input a key belongs to, if that input drives a joystick
  function joyKeySource(code) {
    for (const src of JOY_SOURCES) {
      if (src.keys && src.keys[code] !== undefined) {
        const t = joyTarget[src.id];
        return (t > 0 && t <= joyCount()) ? src : null;
      }
    }
    return null;
  }

  function setJoySource(id, state) {
    if ((joySource[id] || 0) === state) return;
    joySource[id] = state;
    updateJoysticks();
  }

  function renderJoyMap() {
    const box = $('joy-map');
    if (!box) return;
    box.textContent = '';
    for (const src of JOY_SOURCES) {
      const row = document.createElement('label');
      row.className = 'slot';
      const name = document.createElement('span');
      name.textContent = src.name;
      const sel = document.createElement('select');
      for (let t = 0; t <= joyCount(); t++) {
        const o = document.createElement('option');
        o.value = String(t);
        o.textContent = joyName(t);
        sel.appendChild(o);
      }
      sel.value = String(Math.min(joyTarget[src.id] || 0, joyCount()));
      sel.onchange = () => {
        joyTarget[src.id] = Number(sel.value);
        try { localStorage.setItem('ep128web.joymap', JSON.stringify(joyTarget)); } catch (e) { }
        for (const k of Object.keys(joySource)) joySource[k] = 0;
        updateJoysticks();
        canvas.focus({ preventScroll: true });
      };
      row.appendChild(name);
      row.appendChild(sel);
      box.appendChild(row);
    }
  }
  const SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End', 'Space',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const KEY_SHIFT = 0x07;
  const KEY_ENTER = 0x3E;
  const KEY_SPACE = 0x46;

  // characters that can be typed automatically: [matrix code, shift]
  // (CHARMAP[0]: Enterprise UK layout, CHARMAP[1]: TVC Hungarian layout as
  // mapped by ep128emu: QWERTZ, '0' left of '1', ':' = Shift + '.')
  const CHARMAP_EP = (() => {
    const m = {};
    const letters = { a: 0x0E, b: 0x02, c: 0x03, d: 0x0B, e: 0x15, f: 0x0C,
      g: 0x0A, h: 0x08, i: 0x48, j: 0x30, k: 0x32, l: 0x34, m: 0x40, n: 0x00,
      o: 0x4A, p: 0x4C, q: 0x11, r: 0x13, s: 0x0D, t: 0x14, u: 0x10, v: 0x04,
      w: 0x16, x: 0x05, y: 0x12, z: 0x06 };
    for (const c in letters) {
      m[c] = [letters[c], false];
      m[c.toUpperCase()] = [letters[c], true];
    }
    const digits = [0x2C, 0x19, 0x1E, 0x1D, 0x1B, 0x1C, 0x1A, 0x18, 0x28, 0x2A];
    digits.forEach((code, i) => { m[String(i)] = [code, false]; });
    m[' '] = [KEY_SPACE, false];
    m['\n'] = [KEY_ENTER, false];
    m['.'] = [0x44, false];
    m[','] = [0x42, false];
    m['/'] = [0x43, false];
    m[':'] = [0x35, false];
    m[';'] = [0x33, false];
    m['-'] = [0x2B, false];
    m['"'] = [0x1E, true];
    // shifted symbols of the EP (UK) keyboard
    const shifted = { '!': 0x19, '£': 0x1D, '$': 0x1B, '%': 0x1C, '&': 0x1A,
      "'": 0x18, '(': 0x28, ')': 0x2A, '=': 0x2B, '~': 0x2D, '+': 0x33,
      '*': 0x35, '}': 0x36, '`': 0x4B, '{': 0x4D, '|': 0x01, '<': 0x42,
      '>': 0x44, '?': 0x43 };
    for (const c in shifted) m[c] = [shifted[c], true];
    Object.assign(m, { '^': [0x2D, false], '@': [0x4B, false], '[': [0x4D, false],
                       ']': [0x36, false], '\\': [0x01, false] });
    return m;
  })();
  const CHARMAP_TVC = (() => {
    const m = Object.assign({}, CHARMAP_EP);
    m.y = [0x06, false]; m.Y = [0x06, true];
    m.z = [0x12, false]; m.Z = [0x12, true];
    m['0'] = [0x4B, false];
    m[':'] = [0x44, true];
    m['-'] = [0x43, false];
    for (const c of ['£', '~', '*', '}', '{', '|', '<', '>', '^', '[', ']', '\\', '&'])
      delete m[c];
    m['*'] = [0x24, false];
    const shifted = { "'": 0x19, '+': 0x1D, '!': 0x1B, '%': 0x1C, '/': 0x1A,
      '=': 0x18, '(': 0x28, ')': 0x2A, '?': 0x42, '$': 0x17, '`': 0x27 };
    for (const c in shifted) m[c] = [shifted[c], true];
    Object.assign(m, { ';': [0x17, false], '@': [0x27, false] });
    // the keys of the TVC that the PC layout has elsewhere (found by typing
    // every key through the TVC BASIC 1.2 ROM): < > beside Y, [ { ] } \ |
    // ^ ~ on the right, # and & shifted
    Object.assign(m, {
      '<': [0x22, false], '>': [0x22, true], '[': [0x25, false], '{': [0x25, true],
      ']': [0x21, false], '}': [0x21, true], '\\': [0x20, false], '|': [0x20, true],
      '^': [0x23, false], '~': [0x23, true], '#': [0x24, true], '&': [0x4B, true] });
    // Hungarian letters
    const hu = { 'ö': 0x2C, 'ü': 0x2B, 'ó': 0x2D, 'ő': 0x4D, 'ú': 0x36,
      'é': 0x33, 'á': 0x35, 'ű': 0x01 };
    for (const c in hu) {
      m[c] = [hu[c], false];
      m[c.toUpperCase()] = [hu[c], true];
    }
    return m;
  })();
  CHARMAP_EP._ = [0x2C, true];
  CHARMAP_TVC._ = [0x43, true];
  CHARMAP_EP['#'] = [0x1D, true];   // the UK EXOS shows it as £
  // the Hungarian Enterprise with hun.rom: the keys that differ from the UK
  // layout, found by typing every key through its IS-BASIC (EXOS 2.32 HU
  // keeps the UK layout)
  const CHARMAP_EP_HU = Object.assign({}, CHARMAP_EP, {
    "#": [0x36, false], "'": [0x2B, false], "*": [0x4D, true], "+": [0x4D, false], "-": [0x43, false],
    "/": [0x18, true], ":": [0x44, true], ";": [0x42, true], "<": [0x01, true], "=": [0x2C, true],
    ">": [0x01, false], "?": [0x2B, true], "@": [0x2D, true], "Y": [0x06, true], "Z": [0x12, true],
    "[": [0x35, true], "\\": [0x33, true], "]": [0x4B, true], "^": [0x36, true], "_": [0x43, true],
    "`": [0x2D, false], "y": [0x06, false], "z": [0x12, false], "{": [0x35, false], "|": [0x33, false],
    "}": [0x4B, false], "~": [0x1D, true] });
  const CHARMAP = [CHARMAP_EP, CHARMAP_TVC];

  // the character map of the current machine
  function charMap() {
    if (machine && machine.type === 1) return CHARMAP_TVC;
    return (machine && machine.roms.some((r) => r[0] === 'hun.rom')) ? CHARMAP_EP_HU : CHARMAP_EP;
  }
  const PAUSE = '\u0001';      // in autotyped text: wait 2.5 seconds
  const PRESS_ESC = '\u0002';  // in autotyped text: press the TVC ESC key

  // can a file name be typed in a LOAD command? Only plain ASCII: accented
  // letters are typable, but the FILE: devices would not match them with
  // the host file name
  function isTypable(text, type) {
    const map = type === 1 ? CHARMAP_TVC : charMap();
    return /^[\x20-\x7e]*$/.test(text) && Array.from(text).every((ch) => map[ch]);
  }

  // --------------------------------------------------------------------------

  const $ = (id) => document.getElementById(id);
  const canvas = $('screen');
  const ctx = canvas.getContext('2d', { alpha: false });
  const overlay = $('overlay');
  const statusMsg = $('st-msg');

  let M = null;                 // Emscripten module
  let api = null;
  let imageData = null;
  // TVC: the 48 pixels on both sides of the 768 pixel line are horizontal
  // blanking (always black, a TV hides them), so they are not shown
  const TVC_CROP_X = 48;
  let cropX = 0;
  function updateScreenCrop() {
    if (!imageData) return;
    cropX = (machine && machine.type === 1) ? TVC_CROP_X : 0;
    const w = imageData.width - 2 * cropX;
    if (canvas.width !== w) {
      canvas.width = w;
      ctx.putImageData(imageData, -cropX, 0);
    }
    // 768 pixels are 4:3 wide
    const wrap = $('screen-wrap');
    wrap.style.setProperty('--screen-ar', String(w / imageData.width * 4 / 3));
  }
  let ready = false;            // ROMs loaded, machine running
  let paused = false;
  let turbo = false;
  let machine = null;
  let lastFrameCount = -1;
  let emulatedUs = 0;
  let audioCtx = null;
  let audioNode = null;
  let audioLevel = 0;           // frames buffered in the AudioWorklet
  let audioRunning = false;
  let sampleRate = 48000;
  let audioStreamDest = null;    // MediaStream of the sound, for video recording
  let audioRec = null;           // WAV recording: { chunks: [Float32Array], frames }
  const pressedKeys = new Set();
  let tapeName = '';
  let diskName = '';
  let diskNameB = '';           // drive B: (image in /diskb)
  let autoTask = null;          // automatic typing / autostart state
  let tvcSlots = TVC_DEFAULT_SLOTS.slice();   // TVC: card in expansion slots 0..3
  let cartridgeName = '';       // TVC: cartridge ROM image name
  try {
    const v = JSON.parse(localStorage.getItem('ep128web.tvcSlots'));
    if (validTvcSlots(v)) tvcSlots = v;
  } catch (e) {}

  function validTvcSlots(v) {
    if (!Array.isArray(v) || v.length !== 4) return false;
    if (!v.every((c) => TVC_CARDS.some((x) => x.id === c))) return false;
    // a card can only be in one slot, and only one floppy interface works
    if (v.includes(SLOT_VTDOS) && v.includes(SLOT_UPM)) return false;
    return v.every((c, i) => c === SLOT_EMPTY || v.indexOf(c) === i);
  }

  // the disk card in a slot (VT-DOS or UPM), or -1
  function tvcDiskCard() {
    return tvcSlotOf(SLOT_UPM) >= 0 ? SLOT_UPM : (tvcSlotOf(SLOT_VTDOS) >= 0 ? SLOT_VTDOS : -1);
  }

  // "a" or "az" before a word or number (Hungarian article)
  function az(w) {
    return /^([aeiouáéíóöőúüű]|1(\D|$)|5)/i.test(String(w)) ? 'az' : 'a';
  }

  function tvcCardName(id) {
    const c = TVC_CARDS.find((x) => x.id === id);
    return c ? c.name : String(id);
  }

  function tvcCardMoved(card, slot) {
    const n = tvcCardName(card);
    return az(n).replace(/^a/, 'A') + ' ' + n + ' kártya ' + az(slot) + ' ' + slot + '. portba került';
  }

  let refreshTvcSlotsUI = () => { };

  // puts a disk card into a slot if it is not there: in place of the other
  // disk card, else into the first empty slot (else slot 1); returns the
  // slot if the slots changed (the machine must be restarted), else -1
  function ensureTvcDiskCard(card) {
    if (tvcSlotOf(card) >= 0) return -1;
    let slot = tvcSlotOf(card === SLOT_UPM ? SLOT_VTDOS : SLOT_UPM);
    if (slot < 0) slot = tvcSlots.indexOf(SLOT_EMPTY);
    if (slot < 0) slot = 1;
    tvcSlots = tvcSlots.slice();
    tvcSlots[slot] = card;
    try { localStorage.setItem('ep128web.tvcSlots', JSON.stringify(tvcSlots)); } catch (e) { }
    refreshTvcSlotsUI();
    return slot;
  }

  function tvcSlotOf(card) {
    return tvcSlots.indexOf(card);
  }

  // value of the cassette device redirect ($0B05/$0B0D) that points at the
  // slot of a card, or 0 if the card is not installed
  // device for the LOAD / RUN buttons: the tape if one is loaded, else the
  // card the last loaded program or disk was started from (e.g. VT-DOS after
  // a disk image), else the TVC256k++ card if present, else FILE:
  let tvcLastLoadCard = -1;

  function defaultTvcLoadRedirect() {
    if (tapeName) return 5;
    if (tvcLastLoadCard >= 0 && tvcSlotOf(tvcLastLoadCard) >= 0) return tvcRedirectFor(tvcLastLoadCard);
    return tvcSlotOf(SLOT_CARD256) >= 0 ? tvcRedirectFor(SLOT_CARD256) : tvcRedirectFor(SLOT_FILEIO);
  }

  function tvcRedirectFor(card) {
    const slot = tvcSlotOf(card);
    return slot >= 0 ? (0x80 | slot) : 0;
  }

  function setTvcRedirect(value) {
    if (machine.type !== 1 || !value) return;
    writeMemory(2821, value);
    writeMemory(2829, value);
  }

  // --- 2dfx graphics card (Enterprise and TVC, ports F8h/F9h) ---
  // On the TVC it does not work together with the TVC256k++ card.
  let fxOn = false;
  try { fxOn = localStorage.getItem('ep128web.2dfx') === '1'; } catch (e) { }

  function fxBlocked() {
    return !!(machine && machine.type === 1 && tvcSlotOf(SLOT_CARD256) >= 0);
  }
  function apply2dfx() {
    if (api && api.set2dfx) api.set2dfx(fxOn && !fxBlocked() ? 1 : 0);
    const cb = $('fx-on');
    if (cb) cb.checked = fxOn;
    const note = $('fx-note');
    if (note) note.textContent = fxOn && fxBlocked() ? 'a TVC256k++ mellett nem működik' : '';
  }
  function setup2dfx() {
    const cb = $('fx-on');
    if (!cb) return;
    cb.onchange = () => {
      fxOn = cb.checked;
      try { localStorage.setItem('ep128web.2dfx', fxOn ? '1' : '0'); } catch (e) { }
      if (fxOn && fxBlocked()) {
        // the two cards do not work together: the TVC256k++ is taken out
        const slot = tvcSlotOf(SLOT_CARD256);
        tvcSlots = tvcSlots.slice();
        tvcSlots[slot] = SLOT_EMPTY;
        try { localStorage.setItem('ep128web.tvcSlots', JSON.stringify(tvcSlots)); } catch (e) { }
        refreshTvcSlotsUI();
        autoTask = null;
        releaseAllKeys();
        applyMachine(machine);          // without the card, cold reset
        setMessage('2dfx bekapcsolva; a TVC256k++ kártya kikerült a ' + slot + '. portból (a kettő együtt nem működik)');
      } else {
        apply2dfx();
        setMessage(fxOn ? '2dfx kártya bekapcsolva (F8h/F9h)' : '2dfx kártya kikapcsolva');
      }
      canvas.focus({ preventScroll: true });
    };
    apply2dfx();
  }

  function applyTvcSlots() {
    if (api && api.setTvcSlot) tvcSlots.forEach((card, slot) => {
      const c = TVC_CARDS.find((x) => x.id === card);
      api.setTvcSlot(slot, (c && c.hw) || card);
    });
    applyTvcUsb();
    if (tvcSlotOf(SLOT_CARD256) >= 0) fetchDefaultCardFlash();
  }

  // The TVC256k++ flash drive: unless the user loaded an image, the one
  // published in the card's repository (GPL-3.0, with the TVC programs on it)
  // is downloaded from there once, like a real card shipping with it
  const CARD_FLASH_URL = 'https://raw.githubusercontent.com/dikdom/tvc256kplusplus/main/binaries/flash-root-1.3-bin.zip';
  let cardFlashLoaded = false, cardFlashFetching = false;

  async function fetchDefaultCardFlash() {
    if (cardFlashLoaded || cardFlashFetching) return;
    cardFlashFetching = true;
    try {
      const r = await fetch(CARD_FLASH_URL);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const f = (await unzip(new Uint8Array(await r.arrayBuffer())))
        .find((e) => fileKind(e) === 'cardflash');
      if (!f) throw new Error('nincs benne flash-kép');
      if (!cardFlashLoaded) loadCardFlash(f);
    } catch (e) {
      console.warn(e);
      setMessage('A TVC256k++ flash drive képe nem tölthető le (' + (e.message || e) + '); ráhúzhatod a flash-root-*-bin.zip fájlt', true);
    }
    cardFlashFetching = false;
  }

  // --------------------------------------------------------------------------
  // USB pendrive of the TVC256k++ card: a FAT volume in the emulator; the
  // page shows and edits its files, and keeps them in IndexedDB (key
  // 'usbfiles': [{p: path, b: bytes} or {p: path, d: 1}])

  let usbOn = false, usbSize = 128, usbPlugged = false, usbCwd = '';
  let usbSaved = null;            // the stored files, read at start-up
  let usbSavedWrites = -1;        // sector write count at the last save
  try {
    usbOn = localStorage.getItem('ep128web.usbOn') === '1';
    usbSize = Number(localStorage.getItem('ep128web.usbSize')) || 128;
  } catch (e) { }

  function applyTvcUsb() {
    if (!api || !api.cardUsb) return;
    if (usbOn && !usbPlugged) {
      usbPlugged = (api.cardUsb(usbSize) === 0);
      if (usbPlugged && usbSaved) restoreUsb(usbSaved);
      usbSavedWrites = api.usbInfo(2);
    }
    else if (!usbOn && usbPlugged) { api.cardUsb(0); usbPlugged = false; }
    renderUsb();
    updateMouseButton();
  }

  function usbJoin(dir, name) { return dir ? dir + '/' + name : name; }

  // every file and directory of the pendrive, depth first
  function usbWalk(dir, out) {
    const list = JSON.parse(api.usbList(dir) || 'null') || [];
    for (const e of list) {
      const p = usbJoin(dir, e.n);
      if (e.d) { out.push({ p, d: 1 }); usbWalk(p, out); }
      else if (api.usbGet(p, '/tmp/usbfile') === 0) out.push({ p, b: M.FS.readFile('/tmp/usbfile') });
    }
    return out;
  }

  function saveUsb() {
    if (!usbPlugged) return;
    try { M.FS.mkdir('/tmp'); } catch (e) { }
    usbSaved = usbWalk('', []);
    usbSavedWrites = api.usbInfo(2);
    db.put('usbfiles', usbSaved);
  }

  function restoreUsb(entries) {
    const failed = [];
    for (const e of entries) {
      if (e.d) api.usbMkdir(e.p);
      else if (!usbPutBytes(e.p, e.b)) failed.push(e.p);
    }
    if (failed.length) setMessage('Nem fért a pendrive-ra: ' + failed.join(', '), true);
  }

  function usbPutBytes(path, bytes) {
    try { M.FS.mkdir('/tmp'); } catch (e) { }
    M.FS.writeFile('/tmp/usbput', bytes);
    const ok = api.usbPut(path, '/tmp/usbput') === 0;
    M.FS.unlink('/tmp/usbput');
    return ok;
  }

  // adds files to the current directory; entries: {path (relative), bytes}
  async function addUsbFiles(fileList, useRelativePath) {
    if (!usbPlugged) { setMessage('Előbb dugd be a pendrive-ot (Bedugva)', true); return; }
    const entries = [];
    for (const file of Array.from(fileList)) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const rel = (useRelativePath && file.webkitRelativePath) || file.name;
      if (extOf(file.name) === 'zip') {
        for (const z of await unzip(bytes)) entries.push({ path: z.path || z.name, bytes: z.bytes });
      } else {
        entries.push({ path: rel, bytes });
      }
    }
    const failed = entries.filter((e) => !usbPutBytes(usbJoin(usbCwd, e.path), e.bytes)).map((e) => e.path);
    if (failed.length)
      setMessage('Nem sikerült (megtelt, vagy a név nem megengedett): ' + failed.join(', '), true);
    else
      setMessage(entries.length + ' fájl a pendrive-ra került');
    saveUsb();
    renderUsb();
  }

  function fmtSize(n) {
    if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(1) + ' kB';
    return n + ' B';
  }

  function renderUsb() {
    const grp = $('usb-group');
    if (!grp) return;
    grp.hidden = !(machine && machine.type === 1);
    $('usb-on').checked = usbOn;
    $('usb-size').value = String(usbSize);
    const list = $('usb-list'), path = $('usb-path');
    list.textContent = '';
    path.textContent = '';
    $('usb-note').textContent = (usbOn && tvcSlotOf(SLOT_CARD256) < 0)
      ? 'A TVC256k++ kártya nincs egyik portban sem (Bővítőportok).' : '';
    if (!usbPlugged) {
      $('usb-space').textContent = 'nincs bedugva';
      return;
    }
    const total = api.usbInfo(0), free = api.usbInfo(1);
    $('usb-space').textContent = 'szabad: ' + fmtSize(free * 1024) + ' / ' + fmtSize(total * 1024);
    // path: clickable parts
    const parts = usbCwd ? usbCwd.split('/') : [];
    const link = (text, to) => {
      const a = document.createElement('a');
      a.textContent = text;
      a.onclick = () => { usbCwd = to; renderUsb(); };
      path.appendChild(a);
    };
    link('USB:/', '');
    parts.forEach((p, i) => { link(p + '/', parts.slice(0, i + 1).join('/')); });
    let entries = JSON.parse(api.usbList(usbCwd) || 'null');
    if (!entries) { usbCwd = ''; entries = JSON.parse(api.usbList('') || '[]'); }
    entries.sort((a, b) => (b.d - a.d) || a.n.localeCompare(b.n));
    const row = (name, cls, size, onOpen, actions) => {
      const li = document.createElement('li');
      const n = document.createElement('span');
      n.className = 'n' + (cls ? ' ' + cls : '');
      n.textContent = name;
      if (onOpen) n.onclick = onOpen;
      li.appendChild(n);
      const s = document.createElement('span');
      s.className = 's';
      s.textContent = size;
      li.appendChild(s);
      for (const [label, title, fn] of actions) {
        const b = document.createElement('button');
        b.textContent = label;
        b.title = title;
        b.onclick = fn;
        li.appendChild(b);
      }
      list.appendChild(li);
    };
    if (usbCwd) row('..', 'dir', '', () => { usbCwd = parts.slice(0, -1).join('/'); renderUsb(); }, []);
    for (const e of entries) {
      const p = usbJoin(usbCwd, e.n);
      const del = ['✕', 'Törlés', () => {
        if (!confirm('Törlöd: ' + p + (e.d ? ' (a mappa teljes tartalmával)' : '') + '?')) return;
        api.usbDelete(p);
        saveUsb();
        renderUsb();
      }];
      if (e.d) {
        row(e.n + '/', 'dir', '', () => { usbCwd = p; renderUsb(); }, [del]);
      } else {
        const runnable = extOf(e.n) === 'cas';
        const run = () => runFromUsb(usbCwd, e.n);
        row(e.n, runnable ? 'run' : '', fmtSize(e.s), runnable ? run : null, [
          ...(runnable ? [['▶', 'Indítás a pendrive-ról (a kártyán keresztül)', run]] : []),
          ['⬇', 'Letöltés', () => {
          try { M.FS.mkdir('/tmp'); } catch (err) { }
          if (api.usbGet(p, '/tmp/usbfile') === 0) download(M.FS.readFile('/tmp/usbfile'), e.n);
        }], del]);
      }
    }
    if (!entries.length) row('(üres)', '', '', null, []);
  }

  // starts a .cas program of the pendrive: the machine restarts, then the
  // card loads it from its directory (as LOAD after CD on the card)
  function runFromUsb(dir, name) {
    if (!machine || machine.type !== 1) return;
    if (tvcSlotOf(SLOT_CARD256) < 0) {
      setMessage('A pendrive-ról indításhoz tedd a TVC256k++ kártyát egy portba (Bővítőportok)', true);
      return;
    }
    let base = name.replace(/\.cas$/i, '');
    if (!isTypable(base, 1)) {
      // a copy with a name that can be typed, next to the original
      const simple = sanitizeName(base).replace(/\./g, '-') || 'program';
      if (api.usbGet(usbJoin(dir, name), '/tmp/usbfile') !== 0 ||
          !usbPutBytes(usbJoin(dir, simple + '.cas'), M.FS.readFile('/tmp/usbfile'))) {
        setMessage('Nem sikerült elindítani: ' + name, true);
        return;
      }
      base = simple;
      saveUsb();
      renderUsb();
    }
    if (tapeName) {
      api.setTape('');
      tapeName = '';
      $('tape-name').textContent = 'nincs kazetta';
    }
    startAutostart('load "' + base + '"\n', null, false, tvcRedirectFor(SLOT_CARD256), () => {
      api.cardSelectDrive(0);
      api.usbChdir(dir);
    });
    canvas.focus({ preventScroll: true });
  }

  // deletes everything from the pendrive (it is formatted again)
  function clearUsb() {
    if (!usbPlugged) return;
    if (!confirm('Törlöd a pendrive teljes tartalmát?')) return;
    api.cardUsb(0);
    usbPlugged = false;
    usbSaved = [];
    db.put('usbfiles', usbSaved);
    usbCwd = '';
    applyTvcUsb();
    saveUsb();
    setMessage('A pendrive üres');
  }

  function setupUsbUI() {
    if (!$('usb-group')) return;
    $('usb-on').onchange = () => {
      usbOn = $('usb-on').checked;
      try { localStorage.setItem('ep128web.usbOn', usbOn ? '1' : '0'); } catch (e) { }
      if (!usbOn && usbPlugged) saveUsb();
      applyTvcUsb();
      setMessage(usbOn ? 'Pendrive bedugva' : 'Pendrive kihúzva (a tartalma megmarad)');
    };
    $('usb-size').onchange = () => {
      const size = Number($('usb-size').value);
      if (usbPlugged) {
        saveUsb();
        if (!confirm('A pendrive újraformázódik ' + size + ' MB-ra, a fájlok visszakerülnek rá. Mehet?')) {
          $('usb-size').value = String(usbSize);
          return;
        }
        api.cardUsb(0);
        usbPlugged = false;
      }
      usbSize = size;
      try { localStorage.setItem('ep128web.usbSize', String(usbSize)); } catch (e) { }
      applyTvcUsb();
    };
    $('usb-add').onclick = () => $('usb-file').click();
    $('usb-clear').onclick = clearUsb;
    $('usb-add-dir').onclick = () => $('usb-folder').click();
    $('usb-file').onchange = (e) => { addUsbFiles(e.target.files, false); e.target.value = ''; };
    $('usb-folder').onchange = (e) => { addUsbFiles(e.target.files, true); e.target.value = ''; };
    $('usb-mkdir').onclick = () => {
      if (!usbPlugged) return;
      const name = prompt('Az új mappa neve:');
      if (!name) return;
      if (api.usbMkdir(usbJoin(usbCwd, name.replace(/[\\/]/g, '_'))) !== 0) setMessage('Nem sikerült a mappát létrehozni', true);
      saveUsb();
      renderUsb();
    };
    const box = $('usb-group');
    box.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); $('usb-browser').classList.add('drag'); });
    box.addEventListener('dragleave', () => $('usb-browser').classList.remove('drag'));
    box.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      $('usb-browser').classList.remove('drag');
      if (e.dataTransfer && e.dataTransfer.files.length) addUsbFiles(e.dataTransfer.files, false);
    });
    // what TVC programs write to the pendrive is saved too
    setInterval(() => {
      if (usbPlugged && ready && api.usbInfo(2) !== usbSavedWrites) {
        saveUsb();
        if (!$('usb-group').hidden) renderUsb();
      }
    }, 5000);
  }

  function setMessage(text, isError) {
    statusMsg.textContent = text || '';
    statusMsg.style.color = isError ? '' : 'var(--muted)';
    if (text && !isError) {
      clearTimeout(setMessage.t);
      setMessage.t = setTimeout(() => { statusMsg.textContent = ''; }, 5000);
    }
  }

  function lastError() {
    return M.UTF8ToString(api.lastError());
  }

  function check(result, what) {
    if (result < 0) {
      const msg = what + ': ' + lastError();
      setMessage(msg, true);
      throw new Error(msg);
    }
    return result;
  }

  function writeMemory(addr, val) {
    if (api && api.writeMemory) api.writeMemory(addr, val);
  }

  // --------------------------------------------------------------------------
  // IndexedDB storage for ROM images

  const db = (() => {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          const r = indexedDB.open('ep128web', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('files');
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => reject(r.error);
        });
      }
      return dbp;
    }
    async function tx(mode, fn) {
      const d = await open();
      return new Promise((resolve, reject) => {
        const t = d.transaction('files', mode);
        const req = fn(t.objectStore('files'));
        t.oncomplete = () => resolve(req && req.result);
        t.onerror = () => reject(t.error);
      });
    }
    return {
      put: (key, value) => tx('readwrite', (s) => s.put(value, key)).catch(() => {}),
      del: (key) => tx('readwrite', (s) => s.delete(key)).catch(() => {}),
      getAll: async () => {
        try {
          const d = await open();
          return await new Promise((resolve, reject) => {
            const out = [];
            const t = d.transaction('files', 'readonly');
            const req = t.objectStore('files').openCursor();
            req.onsuccess = () => {
              const c = req.result;
              if (c) { out.push([c.key, c.value]); c.continue(); }
              else resolve(out);
            };
            req.onerror = () => reject(req.error);
          });
        } catch (e) {
          return [];
        }
      }
    };
  })();

  // --------------------------------------------------------------------------
  // ROMs

  function fileExists(path) {
    try { M.FS.stat(path); return true; } catch (e) { return false; }
  }

  function installROMPackage(bytes) {
    M.FS.writeFile('/tmp/roms.bin', bytes);
    const n = api.unpackRoms('/tmp/roms.bin', '/roms');
    M.FS.unlink('/tmp/roms.bin');
    return n;
  }

  function machineROMs(m) {
    let roms = m.roms;
    if (m.type === 1) {
      for (const card of TVC_CARDS) {
        if (card.rom && tvcSlots.includes(card.id))
          roms = roms.concat([[card.rom, [card.seg]]]);
      }
    }
    if (m.type === 1 && !m.cart && cartridgeName && fileExists('/roms/' + cartridgeName))
      roms = roms.concat([[cartridgeName, [0x01]]]);
    return roms;
  }

  function missingROMs(m) {
    return machineROMs(m).map((r) => r[0]).filter((f) => !fileExists('/roms/' + f));
  }

  let machineType = 0;

  function updateLoadButton() {
    const b = $('btn-load');
    if (b) b.hidden = !(machine && machine.type === 1);
  }

  function updateCatalogVisibility() {
    const cat = $('catalog');
    if (cat) cat.hidden = !(machine && machine.type === 1);
  }

  function updateCartridgeUI() {
    const grp = $('cart-group');
    const nameEl = $('cart-name');
    if (grp) grp.hidden = !(machine && machine.type === 1);
    // the machines with a system cartridge show it, else the loaded .crt
    const sys = machine && machine.cart && machine.roms.find((r) => r[1][0] === 0x01);
    if (nameEl) nameEl.textContent = sys
      ? (machine.cart === 'upm' ? 'UPM' : 'VT-DOS') + ' rendszer (' + sys[0] + ')'
      : (cartridgeName || 'nincs modul');
    updateTvcCardsUI();
  }

  function updateTvcCardsUI() {
    const grp = $('tvc-cards-group');
    if (grp) grp.hidden = !(machine && machine.type === 1);
    renderUsb();
  }

  // a TVC without a system cartridge (the last one used)
  function plainTvc() {
    return MACHINES.find((x) => x.id === lastPlainTvc) || MACHINES.find((x) => x.id === DEFAULT_TVC);
  }

  function ejectCartridge() {
    if (machine && machine.cart) {
      // the system cartridge goes with its machine
      autoTask = null;
      releaseAllKeys();
      applyMachine(plainTvc());
      setMessage('Cartridge eltávolítva');
      canvas.focus({ preventScroll: true });
      return;
    }
    if (!cartridgeName) return;
    cartridgeName = '';
    if (machine && machine.type === 1) {
      check(api.loadRom(1, '', 0), 'cartridge');
      api.reset(1);
      keyedSinceReset = false;
    }
    updateCartridgeUI();
    setMessage('Cartridge eltávolítva');
    canvas.focus({ preventScroll: true });
  }

  function loadCartridgeFile(f) {
    if (machine.type !== 1 || machine.cart) applyMachine(plainTvc());
    cartridgeName = sanitizeName(f.name) || 'cartridge.crt';
    M.FS.writeFile('/roms/' + cartridgeName, f.bytes);
    check(api.loadRom(1, '/roms/' + cartridgeName, 0), 'cartridge');
    api.reset(1);
    keyedSinceReset = false;
    updateCartridgeUI();
    setMessage('TVC Cartridge (bővítő modul) betöltve: ' + f.name);
  }

  function applyMachine(m, coldReset) {
    machine = m;
    if (m.type === 1 && !m.cart) lastPlainTvc = m.id;
    const sel = $('machine');
    if (sel && sel.value !== m.id) sel.value = m.id;
    updateLoadButton();
    updateCatalogVisibility();
    if (m.type !== 1) {
      cartridgeName = '';
    }
    updateCartridgeUI();
    updateMouseButton();
    renderJoyMap();               // the TVC has the GameCard joysticks too
    apply2dfx();
    try { listFiles(); } catch (e) { }   // startable files depend on the machine
    updateScreenCrop();
    if (vkbdType >= 0) renderKeyboard();
    const diskSlot = (m.type === 1 && m.diskCard) ? ensureTvcDiskCard(m.diskCard) : -1;
    const missing = missingROMs(m);
    if (missing.length) {
      ready = false;
      overlay.hidden = false;
      setMessage('Hiányzó ROM: ' + missing.join(', '), true);
      return false;
    }
    overlay.hidden = true;
    if (m.type !== machineType) {
      // a different emulated machine: the VM object is recreated
      check(api.setMachineType(m.type), 'gép');
      machineType = m.type;
      applyVolume();
      if (tapeName && fileExists('/tape/' + tapeName))
        api.setTape('/tape/' + tapeName);
    }
    check(api.resetMemory(m.ram), 'memória');
    for (const [file, segments] of machineROMs(m)) {
      segments.forEach((seg, i) => {
        check(api.loadRom(seg, '/roms/' + file, i * 16384), file);
      });
    }
    if (diskName)
      api.setDisk(0, '/disk/' + diskName);
    if (diskNameB)
      api.setDisk(1, '/diskb/' + diskNameB);
    if (m.type === 1) applyTvcSlots();   // before the reset: the TVC OS detects the cards at boot
    if (coldReset !== false) {
      api.reset(1);
      keyedSinceReset = false;
    }
    ready = true;
    try { localStorage.setItem('ep128web.machine', m.id); } catch (e) { }
    setMessage(diskSlot >= 0 ? tvcCardMoved(m.diskCard, diskSlot) : '');
    return true;
  }

  // --------------------------------------------------------------------------
  // Audio

  const WORKLET_SRC = `
class EPOutput extends AudioWorkletProcessor {
  constructor() {
    super();
    this.cap = sampleRate;              // 1 second ring buffer
    this.buf = new Float32Array(this.cap * 2);
    this.r = 0; this.w = 0; this.n = 0; this.cnt = 0;
    this.lastL = 0; this.lastR = 0;
    this.port.onmessage = (e) => {
      const d = e.data;
      const frames = d.length >> 1;
      for (let i = 0; i < frames; i++) {
        if (this.n >= this.cap) break;
        this.buf[this.w * 2] = d[i * 2];
        this.buf[this.w * 2 + 1] = d[i * 2 + 1];
        this.w = (this.w + 1) % this.cap;
        this.n++;
      }
      // keep latency bounded
      const maxN = (this.cap * 0.25) | 0;
      if (this.n > maxN) {
        const drop = this.n - ((this.cap * 0.08) | 0);
        this.r = (this.r + drop) % this.cap;
        this.n -= drop;
      }
    };
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    for (let i = 0; i < L.length; i++) {
      if (this.n > 0) {
        this.lastL = this.buf[this.r * 2];
        this.lastR = this.buf[this.r * 2 + 1];
        this.r = (this.r + 1) % this.cap;
        this.n--;
      } else {
        this.lastL *= 0.995; this.lastR *= 0.995;
      }
      L[i] = this.lastL; R[i] = this.lastR;
    }
    if (++this.cnt >= 4) { this.cnt = 0; this.port.postMessage(this.n); }
    return true;
  }
}
registerProcessor('ep-output', EPOutput);
`;

  async function setupAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      audioCtx = new AC({ latencyHint: 'interactive' });
      sampleRate = audioCtx.sampleRate;
      const url = URL.createObjectURL(new Blob([WORKLET_SRC], { type: 'application/javascript' }));
      await audioCtx.audioWorklet.addModule(url);
      audioNode = new AudioWorkletNode(audioCtx, 'ep-output', {
        numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2]
      });
      audioNode.port.onmessage = (e) => { audioLevel = e.data; };
      audioNode.connect(audioCtx.destination);
      // the sound track of the video recording
      if (audioCtx.createMediaStreamDestination) {
        audioStreamDest = audioCtx.createMediaStreamDestination();
        audioNode.connect(audioStreamDest);
      }
    } catch (e) {
      console.warn('Web Audio unavailable', e);
      audioCtx = null;
    }
  }

  function resumeAudio() {
    if (audioCtx && audioCtx.state !== 'running') {
      audioCtx.resume().then(() => {
        audioRunning = true;
        $('click-hint').hidden = true;
      }).catch(() => {});
    } else if (audioCtx) {
      audioRunning = true;
      $('click-hint').hidden = true;
    }
  }

  // --------------------------------------------------------------------------
  // Keyboard, joystick

  // Key events are queued and applied with minimum timing in emulated time,
  // so that the machine sees every key even if the browser reports the press
  // and release in the same frame, or several keys at once while typing fast.
  const MIN_KEY_HOLD_US = 50000;
  const KEY_GAP_US = 20000;
  const keyQueue = [];
  const keyPressTime = new Map();
  let nextKeyEventUs = 0;
  let keyedSinceReset = false;  // TVC BASIC ignores the first key after reset

  function keyDown(code) {
    keyedSinceReset = true;
    keyQueue.push([code, 1]);
    processKeyQueue();
  }

  function keyUp(code) {
    keyQueue.push([code, 0]);
    processKeyQueue();
  }

  function processKeyQueue() {
    while (keyQueue.length && emulatedUs >= nextKeyEventUs) {
      const [code, down] = keyQueue[0];
      if (down) {
        if (!pressedKeys.has(code)) {
          pressedKeys.add(code);
          keyPressTime.set(code, emulatedUs);
          api.setKey(code, 1);
          nextKeyEventUs = emulatedUs + KEY_GAP_US / 2;
        }
      } else if (pressedKeys.has(code)) {
        const t = keyPressTime.get(code) + MIN_KEY_HOLD_US;
        if (emulatedUs < t) {
          nextKeyEventUs = t;
          return;
        }
        pressedKeys.delete(code);
        api.setKey(code, 0);
        nextKeyEventUs = emulatedUs + KEY_GAP_US;
      }
      keyQueue.shift();
    }
  }

  function releaseAllKeys() {
    for (const k of Object.keys(joySource)) joySource[k] = 0;
    joyOut.fill(0);
    if (api && api.setTvcExtJoy) { api.setTvcExtJoy(0, 0xFF); api.setTvcExtJoy(1, 0xFF); }
    keyQueue.length = 0;
    for (const code of Array.from(pressedKeys)) {
      pressedKeys.delete(code);
      if (api) api.setKey(code, 0);
    }
  }

  function isTextInput(el) {
    return el && (el.tagName === 'INPUT' && el.type !== 'checkbox' && el.type !== 'range'
                  || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  }

  function mapKey(e) {
    return (machine && machine.type === 1 ? KEYMAP_TVC : KEYMAP)[e.code];
  }

  document.addEventListener('keydown', (e) => {
    if (isTextInput(e.target)) return;
    if (e.code === 'F11') {
      e.preventDefault();
      if (!e.repeat) reset(e.shiftKey);
      return;
    }
    if (e.code === 'F12') {
      e.preventDefault();
      if (!e.repeat) toggleTurbo();
      return;
    }
    if (e.metaKey) return;      // leave Cmd+... shortcuts to the browser
    const joySrc = joyKeySource(e.code);
    if (joySrc) {
      e.preventDefault();
      resumeAudio();
      if (!autoTask) setJoySource(joySrc.id, (joySource[joySrc.id] || 0) | joySrc.keys[e.code]);
      return;
    }
    if (machine && machine.type === 1 && TVC_STOP_KEYS.has(e.code)) {
      e.preventDefault();
      resumeAudio();
      if (!autoTask && !e.repeat) TVC_STOP.forEach(keyDown);
      return;
    }
    const code = mapKey(e);
    if (code === undefined) {
      // keys without an emulated key that would scroll the page away from
      // the screen (e.g. End on the TVC)
      if (SCROLL_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    e.preventDefault();
    resumeAudio();
    if (autoTask || e.repeat) return;   // the EP has its own auto-repeat
    keyDown(code);
  });

  document.addEventListener('keyup', (e) => {
    if (isTextInput(e.target)) return;
    const joySrc = joyKeySource(e.code);
    if (joySrc) {
      e.preventDefault();
      setJoySource(joySrc.id, (joySource[joySrc.id] || 0) & ~joySrc.keys[e.code]);
      return;
    }
    if (machine && machine.type === 1 && TVC_STOP_KEYS.has(e.code)) {
      e.preventDefault();
      TVC_STOP.forEach(keyUp);
      return;
    }
    const code = mapKey(e);
    if (code === undefined) return;
    e.preventDefault();
    keyUp(code);
    // the browser may swallow some keyup events (e.g. Shift+key combos)
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
      keyUp(KEYMAP.ShiftLeft);
      keyUp(KEYMAP.ShiftRight);
    }
  });

  window.addEventListener('blur', releaseAllKeys);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAllKeys();
  });

  let padState = [0, 0, 0, 0];
  function pollGamepads() {
    if (!navigator.getGamepads) return;
    let names = [];
    const pads = navigator.getGamepads();
    for (let pIdx = 0; pIdx < Math.min(pads.length, 4); pIdx++) {
      const gp = pads[pIdx];
      if (!gp) continue;
      names.push(gp.id);
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      let state = 0;
      if (ax > 0.5 || b(15)) state |= 1;      // right
      if (ax < -0.5 || b(14)) state |= 2;     // left
      if (ay > 0.5 || b(13)) state |= 4;      // down
      if (ay < -0.5 || b(12)) state |= 8;     // up
      if (b(0) || b(1) || b(2) || b(3)) state |= 16;

      if (state !== padState[pIdx]) {
        padState[pIdx] = state;
        setJoySource('gp' + (pIdx + 1), state);
      }
    }
    $('pad-status').textContent = names.length ? 'Gamepad: ' + names[0] + (names.length > 1 ? ' (+' + (names.length - 1) + ')' : '') : '';
  }

  // --------------------------------------------------------------------------
  // Automatic typing and program autostart
  //
  // Autostart does a cold reset, runs the machine at full speed until the
  // ENTERPRISE logo appears (the end of the memory test), presses a key to
  // enter BASIC, then types the command.

  function screenActivity(row0, row1) {
    // number of non-black pixels (sampled) in rows row0 to row1 - 1
    const w = api.frameWidth();
    const base = api.frameBuffer() >> 2;
    const px = M.HEAPU32.subarray(base + w * row0, base + w * row1);
    let n = 0;
    for (let i = 0; i < px.length; i += 3)
      if (px[i] !== 0xFF000000) n++;
    return n;
  }

  function buildKeyEvents(text) {
    const ev = [];
    for (const ch of text) {
      if (ch === PAUSE) {
        ev.push([-1, 0, 2500000]);
        continue;
      }
      if (ch === PRESS_ESC) {
        ev.push([KEYMAP_TVC.Escape, 1, 60000], [KEYMAP_TVC.Escape, 0, 30000],
                [-1, 0, 50000]);
        continue;
      }
      const k = charMap()[ch];
      if (!k) continue;
      if (k[1]) ev.push([KEY_SHIFT, 1, 30000]);
      ev.push([k[0], 1, 60000]);
      ev.push([k[0], 0, 30000]);
      if (k[1]) ev.push([KEY_SHIFT, 0, 30000]);
      ev.push([-1, 0, ch === '\n' ? 600000 : 50000]);
    }
    return ev;
  }

  function startAutostart(command, onTyped, isTvcTape = false, tvcRedirect, prepare) {
    releaseAllKeys();
    api.reset(1);
    keyedSinceReset = false;
    autoTask = {
      // the TVC starts BASIC directly, the Enterprise shows a logo first
      phase: machine.type === 1 ? 'basic' : 'boot',
      t: 0, phaseT: 0, dark: false, logo: 0, stable: 0,
      command, onTyped, events: null, wait: 0,
      // called once after the reset, when BASIC is ready, before typing
      prepare,
      isTvcTape: !!isTvcTape,
      // TVC: the cassette device redirect the loading command must use
      // (5: TAPE, 129: FILE: in slot 1), forced while the task types
      tvcRedirect: tvcRedirect !== undefined ? tvcRedirect
        : (isTvcTape ? 5 : tvcRedirectFor(SLOT_FILEIO))
    };
    if (machine.type === 1 && (autoTask.tvcRedirect & 0x80))
      tvcLastLoadCard = tvcSlots[autoTask.tvcRedirect & 3];
    setMessage('Indítás…');
  }

  // TVC: forces the cassette device redirect (system variables $0B05/$0B0D)
  // for an autostart task. Plain text typing does not set one, so that it
  // does not take the redirect away from e.g. the TVC256k++ card's commands.
  function applyTvcRedirect(a) {
    if (machine.type !== 1 || !a.tvcRedirect) return;
    writeMemory(2821, a.tvcRedirect);
    writeMemory(2829, a.tvcRedirect);
  }

  // returns the number of microseconds to emulate before calling again,
  // or 0 when the task is finished
  function stepAutoTask() {
    const a = autoTask;
    const phaseTime = a.t - a.phaseT;
    if (a.phase === 'boot') {
      // wait for the end of the memory test: the ENTERPRISE logo appears in
      // the middle of the (previously black) screen
      // (power-on RAM garbage can look similar for a frame, so the top of
      // the screen must also be black, for at least 10 frames in a row)
      const v = screenActivity(120, 200);
      if (v < 100) a.dark = true;
      if (a.dark && v > 300 && v < 4000 && screenActivity(0, 100) < 50) a.logo++;
      else a.logo = 0;
      if (a.logo >= 10 || phaseTime > 40e6) {
        a.phase = 'logo';
        a.phaseT = a.t;
        a.events = [[-1, 0, 300000], [KEY_SPACE, 1, 80000], [KEY_SPACE, 0, 20000]];
      }
      return 20000;
    }
    if (a.phase === 'basic') {
      // wait until the IS-BASIC banner has been displayed and the screen has
      // not changed for a while (EXDOS without a disk can take seconds)
      const v = screenActivity(20, 60);
      if (v > 300 && v === a.last) a.stable++;
      else a.stable = 0;
      a.last = v;
      if (a.bootWait ? phaseTime > a.bootWait : (a.stable >= 25 || phaseTime > 15e6)) {
        a.phase = 'type';
        if (a.prepare) a.prepare();
        applyTvcRedirect(a);
        // TVC BASIC ignores keys for about a second after the banner appears,
        // and then the first key: wait, and send an Enter first
        a.events = machine.type === 1
          ? [[-1, 0, 2000000]].concat(buildKeyEvents('\n' + a.command))
          : buildKeyEvents(a.command);
      }
      return 20000;
    }
    if (a.events.length) {
      const [code, down, delay] = a.events.shift();
      if (code >= 0) api.setKey(code, down);
      applyTvcRedirect(a);
      return delay;
    }
    if (a.phase === 'logo') {
      a.phase = 'basic';
      a.phaseT = a.t;
      return 20000;
    }
    applyTvcRedirect(a);
    autoTask = null;
    setMessage('');
    if (a.onTyped) a.onTyped();
    return 0;
  }

  function runAutoTask(budgetUs) {
    // runs at most budgetUs of emulated time while the task is active
    let spent = 0;
    while (autoTask && spent < budgetUs) {
      if (api.dbgState()) break;        // stopped in the debugger: wait
      if (autoTask.wait <= 0) {
        autoTask.wait = stepAutoTask();
        if (!autoTask) break;
      }
      const us = Math.min(autoTask.wait, 20000);
      check(api.run(us), 'emuláció');
      autoTask.t += us;
      autoTask.wait -= us;
      spent += us;
    }
    return spent;
  }

  // --------------------------------------------------------------------------
  // Files

  function sanitizeName(name) {
    // lower case, only characters that can be typed with the autostart code
    // (accented letters lose their accents: ÁTTÖRÉS -> attores)
    let base = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9.\-]/g, '');
    if (!base || base[0] === '.') base = 'file' + base;
    return base.slice(0, 28);
  }

  function ensureDir(path) {
    try { M.FS.mkdir(path); } catch (e) { }
  }

  // the FILE: directory; the programs can be started with a click
  function listFiles() {
    const names = M.FS.readdir('/files').filter((n) => n !== '.' && n !== '..').sort();
    const list = $('files-list');
    list.textContent = names.length ? '' : 'üres';
    names.forEach((n, i) => {
      if (i) list.append(', ');
      if (!isStartable(n)) { list.append(n); return; }
      const b = document.createElement('a');
      b.href = '#';
      b.className = 'file-start';
      b.textContent = n;
      b.title = 'Indítás';
      b.onclick = (e) => {
        e.preventDefault();
        if (!ready) return;
        resumeAudio();
        // every file in FILE: goes along (e.g. to the TVC256k++ PSRAM drive)
        lastStoredFiles = names.slice();
        startProgram(n);
        canvas.focus({ preventScroll: true });
      };
      list.append(b);
    });
  }

  function download(bytes, name) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // --- ZIP archives (stored and deflated entries) ---

  const CP852_HIGH =
    'ÇüéâäůćçłëŐőîŹÄĆÉĹĺôöĽľŚśÖÜŤťŁ×čáíóúĄąŽžĘę¬źČş«»░▒▓│┤ÁÂĚŞ╣║╗╝Żż┐' +
    '└┴┬├─┼Ăă╚╔╩╦╠═╬¤đĐĎËďŇÍÎě┘┌█▄ŢŮ▀ÓßÔŃńňŠšŔÚŕŰýÝţ´\u00AD˝˛ˇ˘§÷¸°¨˙űŘř■\u00A0';

  function decodeCp852(raw) {
    // plain ASCII or valid UTF-8 (many tools leave the flag unset) as is
    if (raw.every((b) => b < 0x80)) return String.fromCharCode(...raw);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(raw); } catch (e) { }
    let out = '';
    for (const b of raw) out += b < 0x80 ? String.fromCharCode(b) : CP852_HIGH[b - 0x80];
    return out;
  }

  async function unzip(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // find the end of central directory record
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054B50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('hibás ZIP fájl');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = [];
    for (let i = 0; i < n; i++) {
      if (dv.getUint32(p, true) !== 0x02014B50) throw new Error('hibás ZIP fájl');
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nameLen = dv.getUint16(p + 28, true);
      const extraLen = dv.getUint16(p + 30, true);
      const commentLen = dv.getUint16(p + 32, true);
      const local = dv.getUint32(p + 42, true);
      // names are UTF-8 if flag bit 11 is set, else in the DOS code page
      // (Hungarian archives: CP852)
      const rawName = bytes.subarray(p + 46, p + 46 + nameLen);
      const name = (dv.getUint16(p + 8, true) & 0x800) ? new TextDecoder().decode(rawName) : decodeCp852(rawName);
      p += 46 + nameLen + extraLen + commentLen;
      if (name.endsWith('/')) continue;
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = bytes.subarray(start, start + csize);
      let content;
      if (method === 0) {
        content = data.slice();
      } else if (method === 8 && window.DecompressionStream) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        content = new Uint8Array(await new Response(stream).arrayBuffer());
      } else {
        throw new Error('nem támogatott ZIP tömörítés: ' + name);
      }
      out.push({ name: name.split('/').pop(), path: name, bytes: content });
    }
    return out;
  }

  // --- classification of loaded files ---

  function extOf(name) {
    return (name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();
  }

  function fileKind(f) {
    const ext = extOf(f.name);
    if (ext === 'crt') return 'cartridge';
    // TVC256k++ flash drive image (15 MB littlefs), e.g. flash-root-1.3.bin
    if (ext === 'bin' && (/^flash-root/i.test(f.name) || f.bytes.length === 15728640)) return 'cardflash';
    if (ext === 'rom' || (ext === 'bin' && f.bytes.length > 100000 && /rom/i.test(f.name)))
      return 'rom';
    if (ext === 'ep128s' || ext === 'ep128d' || ext === 'ep128s2') return 'snapshot';
    if (['tap', 'wav', 'tzx', 'cdt'].includes(ext)) return 'tape';
    if (['img', 'dsk'].includes(ext)) return 'disk';
    return 'program';
  }

  // file name as stored in the FILE: directory: the original name without
  // directories (the FILE: devices look up names case-insensitively)
  function hostName(name) {
    const n = name.replace(/[\/\\:*?"<>|]/g, '_').slice(-60);
    return n || 'file';
  }

  function isStartable(name) {
    const ext = extOf(name);
    if (machine.type === 1) return ext === 'cas';
    return ['com', 'bas', 'prg', 'ep', 'exe', 'app', ''].includes(ext);
  }

  function loadCardFlash(f) {
    try { M.FS.mkdir('/card'); } catch (e) { }
    M.FS.writeFile('/card/flash.bin', f.bytes);
    check(api.loadTvcCardFlash('/card/flash.bin'), 'TVC256k++ flash drive kép');
    cardFlashLoaded = true;
    db.put('cardflash', f.bytes);
    setMessage('TVC256k++ flash drive kép betöltve' + (tvcSlotOf(SLOT_CARD256) >= 0 ? '' : ' – tedd a kártyát egy bővítőportba'));
  }

  function loadROMFile(f) {
    if (extOf(f.name) === 'rom') {
      const romName = f.name.toLowerCase();
      M.FS.writeFile('/roms/' + romName, f.bytes);
      db.put('rom:' + romName, f.bytes);
      setMessage('ROM betöltve: ' + romName);
    } else {
      const n = check(installROMPackage(f.bytes), 'ROM-csomag');
      db.put('pkg', f.bytes);
      setMessage(n + ' ROM kicsomagolva');
    }
    if (!ready || machine && missingROMs(machine).length === 0)
      applyMachine(machine);
  }

  function loadSnapshotFile(f) {
    const ext = extOf(f.name);
    M.FS.writeFile('/tmp/snapshot', f.bytes);
    // switch to the machine type the snapshot was saved from
    const type = api.fileMachineType('/tmp/snapshot');
    if (type >= 0 && type !== machineType) {
      const m = MACHINES.find((x) => x.type === type);
      if (missingROMs(m).length === 0) {
        applyMachine(m);
      } else {
        check(api.setMachineType(type), 'gép');
        machineType = type;
        machine = m;
        updateLoadButton();
        applyVolume();
        renderKeyboard();
      }
      $('machine').value = m.id;
    }
    check(api.loadSnapshot('/tmp/snapshot'), 'pillanatkép');
    setMessage((ext === 'ep128d' ? 'Demó: ' : 'Pillanatkép: ') + f.name);
  }

  function loadTapeFile(f) {
    ensureDir('/tape');
    tapeName = sanitizeName(f.name);
    M.FS.writeFile('/tape/' + tapeName, f.bytes);
    setTvcRedirect(5);
    check(api.setTape('/tape/' + tapeName), 'kazetta');
    $('tape-name').textContent = f.name;
    setMessage('Kazetta betöltve – indítás…');
    // the default device is set to TAPE: so that multi-part programs load
    // their further parts from the tape as well
    startAutostart(machine.type === 1 ? 'load\n' : ':def_dev_tape\nload\n',
                   () => {
                     if (machine.type === 1) {
                       writeMemory(2821, 5);
                       writeMemory(2829, 5);
                     }
                     api.tapeCommand(1);
                   },
                   machine.type === 1);
  }

  // TVC disk image format: 'fat' (VT-DOS, with a boot sector), 'upm' (UPM:
  // 4 unused tracks, then a CP/M directory), or '' if neither
  function tvcDiskFormat(b) {
    if (b.length >= 512 && b[11] === 0 && b[12] === 2 && b[21] >= 0xF0) return 'fat';
    const dir = 4 * 9 * 512;
    if (b.length < dir + 2048) return '';
    for (let p = dir; p < dir + 2048; p += 32) {
      if (b[p] === 0xE5) continue;
      if (b[p] > 15) return '';
      for (let i = 1; i < 12; i++) {
        const c = b[p + i] & 0x7F;
        if (c < 0x20 || c > 0x7E) return '';
      }
    }
    return 'upm';
  }

  // the .CAS files in the directory of a UPM disk image
  function upmCasFiles(b) {
    const dir = 4 * 9 * 512, names = new Set();
    for (let p = dir; p < dir + 2048; p += 32) {
      if (b[p] > 15) continue;
      const str = (from, n) => String.fromCharCode(...Array.from(b.subarray(p + from, p + from + n), (c) => c & 0x7F)).trim();
      if (str(9, 3) === 'CAS' && str(1, 8)) names.add(str(1, 8));
    }
    return Array.from(names).sort();
  }

  // a disk image in the TVC's drive A:, with the disk card its format needs:
  // VT-DOS lists it, UPM (BASIC) offers its programs, the cartridge
  // machines boot from it
  function loadTvcDisk(bytes) {
    const fmt = tvcDiskFormat(bytes);
    const card = machine.diskCard || (fmt === 'upm' ? SLOT_UPM : fmt === 'fat' ? SLOT_VTDOS
      : (tvcDiskCard() >= 0 ? tvcDiskCard() : SLOT_VTDOS));
    const slot = ensureTvcDiskCard(card);
    if (slot >= 0) {
      autoTask = null;
      applyMachine(machine);          // loads the card's ROM, cold reset
    }
    check(api.setDisk(0, '/disk/' + diskName), 'lemez');
    const moved = slot >= 0 ? ' (' + tvcCardMoved(card, slot) + ')' : '';
    const wrong = machine.diskCard && fmt && fmt !== (machine.diskCard === SLOT_UPM ? 'upm' : 'fat')
      ? ' – figyelem: ez ' + (fmt === 'upm' ? 'UPM' : 'VT-DOS') + ' lemez' : '';
    if (machine.cart === 'upm') {
      // the cartridge waits for RETURN after its "*", then UPM starts (a
      // second RETURN in case the first one came too early: at the A>
      // prompt it does nothing)
      setMessage('UPM indítása a lemezről…' + moved + wrong);
      startAutostart(PAUSE + '\n' + PAUSE + 'dir\n', null, false, 0);
      autoTask.bootWait = 3e6;
    } else if (machine.cart) {
      api.reset(1);
      keyedSinceReset = false;
      setMessage('VT-DOS indítása a lemezről…' + moved + wrong);
    } else if (card === SLOT_UPM) {
      const names = upmCasFiles(bytes);
      setMessage('UPM lemez az A: meghajtóban' + moved);
      if (names.length) chooseUpmProgram(names);
    } else {
      setMessage('Lemez az A: meghajtóban – VT-DOS indítása…' + moved);
      // the VT-DOS commands (EXT 2) need the default device to be the DOS
      startAutostart('ext 2\n' + PAUSE + 'dir\n' + PAUSE + PRESS_ESC, null, false,
                     tvcRedirectFor(SLOT_VTDOS));
    }
  }

  // the programs of a UPM disk: BASIC loads them with the UPM card
  function chooseUpmProgram(names) {
    const box = $('chooser');
    $('chooser-title').textContent = 'Melyik programot töltsem be?';
    $('chooser-desc').textContent = 'A lemezen lévő programok (BASIC: LOAD "NÉV" az UPM kártyáról).';
    const list = $('chooser-list');
    list.textContent = '';
    for (const n of names) {
      const b = document.createElement('button');
      b.textContent = n;
      b.onclick = () => {
        box.hidden = true;
        startAutostart('load "' + n + '"\n', null, false, tvcRedirectFor(SLOT_UPM));
        canvas.focus({ preventScroll: true });
      };
      list.appendChild(b);
    }
    showChooser(box);
  }

  // --- disk drives A: and B:, three slots each ---
  // The active slot is the disk in the drive; the images (and the active
  // slots) are kept in the browser (IndexedDB, localStorage).

  const DISK_SLOTS = 3;
  const drives = [0, 1].map((d) => ({
    dir: d ? '/diskb' : '/disk', active: 0, slots: new Array(DISK_SLOTS).fill(null)
  }));

  function slotRel(d, i) {
    const s = drives[d].slots[i];
    return s ? 's' + i + '/' + s.file : '';
  }
  function slotPath(d, i) {
    return slotRel(d, i) ? drives[d].dir + '/' + slotRel(d, i) : '';
  }
  // diskName / diskNameB: the active image (relative to /disk, /diskb)
  function syncDiskNames() {
    diskName = slotRel(0, drives[0].active);
    diskNameB = slotRel(1, drives[1].active);
  }
  function saveDiskActive() {
    try {
      localStorage.setItem('ep128web.diskActive', drives.map((x) => x.active).join(','));
    } catch (e) { }
  }
  // a quick checksum, to save only changed images
  function sumOf(b) {
    let h = 2166136261 ^ b.length;
    for (let k = 0; k < b.length; k += 4) h = Math.imul(h ^ (b[k] | (b[k + 1] << 8) | (b[k + 2] << 16) | (b[k + 3] << 24)), 16777619);
    return h >>> 0;
  }
  function putSlot(d, i, bytes) {
    const s = drives[d].slots[i];
    const sum = sumOf(bytes);
    if (s.sum === sum) return;
    s.sum = sum;
    db.put('disk:' + d + i, { name: s.name, bytes });
  }

  function storeSlot(d, i, f) {
    const old = slotPath(d, i);
    if (old && drives[d].active === i) api.setDisk(d, '');
    if (old) { try { M.FS.unlink(old); } catch (e) { } }
    ensureDir(drives[d].dir);
    ensureDir(drives[d].dir + '/s' + i);
    drives[d].slots[i] = { name: f.name, file: sanitizeName(f.name) };
    M.FS.writeFile(slotPath(d, i), f.bytes);
    putSlot(d, i, f.bytes);
  }
  // keeps what the machine wrote to the disk (image not in the drive)
  function persistSlot(d, i) {
    const p = slotPath(d, i);
    if (!p) return;
    try { putSlot(d, i, M.FS.readFile(p)); } catch (e) { }
  }
  // the content of a slot; the disk in the drive is closed and reopened, so
  // that everything written is in the file
  function slotBytes(d, i) {
    const p = slotPath(d, i);
    if (drives[d].active === i && ready) {
      api.setDisk(d, '');
      const b = M.FS.readFile(p);
      api.setDisk(d, p);
      return b;
    }
    return M.FS.readFile(p);
  }
  function mountDrive(d) {
    syncDiskNames();
    if (!ready) return;
    const p = slotPath(d, drives[d].active);
    check(api.setDisk(d, p), d ? 'lemez (B:)' : 'lemez');
  }
  // selecting a slot puts its disk in the drive at once
  function selectSlot(d, i) {
    const old = drives[d].active;
    if (old === i) return;
    drives[d].active = i;
    mountDrive(d);                      // closes the old image
    persistSlot(d, old);
    saveDiskActive();
    renderDrives();
    const s = drives[d].slots[i];
    setMessage((d ? 'B:' : 'A:') + ' ' + (i + 1) + '. lemez: ' + (s ? s.name : 'üres'));
  }
  function clearSlot(d, i) {
    const p = slotPath(d, i);
    if (!p) return;
    if (drives[d].active === i) api.setDisk(d, '');
    try { M.FS.unlink(p); } catch (e) { }
    drives[d].slots[i] = null;
    db.del('disk:' + d + i);
    syncDiskNames();
    renderDrives();
  }
  // saves the disks in the drives, e.g. when the page is closed
  function persistDrives() {
    if (!ready) return;
    for (let d = 0; d < 2; d++) {
      const i = drives[d].active;
      if (!slotPath(d, i)) continue;
      try { putSlot(d, i, slotBytes(d, i)); } catch (e) { }
    }
  }
  // when a drive's LED has gone off after some activity, its buffered track
  // is already in the image file: the changed image is saved
  let ledAccUs = 0;
  let ledState = 0;
  const diskSeen = [0, 0];
  const diskUsed = [false, false];
  function checkDiskActivity() {
    if (!ready) return;
    const led = ledState;
    const now = performance.now();
    for (let d = 0; d < 2; d++) {
      if ((led >>> (8 * d)) & 0xFF) {
        diskSeen[d] = now;
        diskUsed[d] = true;
      } else if (diskUsed[d] && now - diskSeen[d] > 500) {
        diskUsed[d] = false;
        persistSlot(d, drives[d].active);
      }
    }
  }
  function restoreDisk(key, value) {
    const d = Number(key[5]), i = Number(key[6]);
    if (!(d >= 0 && d < 2 && i >= 0 && i < DISK_SLOTS) || !value || !value.bytes) return;
    ensureDir(drives[d].dir);
    ensureDir(drives[d].dir + '/s' + i);
    drives[d].slots[i] = { name: value.name, file: sanitizeName(value.name), sum: sumOf(value.bytes) };
    M.FS.writeFile(slotPath(d, i), value.bytes);
  }
  function restoreDiskActive() {
    try {
      const v = (localStorage.getItem('ep128web.diskActive') || '').split(',').map(Number);
      v.forEach((a, d) => { if (d < 2 && a >= 0 && a < DISK_SLOTS) drives[d].active = a; });
    } catch (e) { }
    syncDiskNames();
  }

  function renderDrives() {
    for (let d = 0; d < 2; d++) {
      const box = $(d ? 'drive-b' : 'drive-a');
      if (!box) continue;
      box.textContent = '';
      for (let i = 0; i < DISK_SLOTS; i++) {
        const s = drives[d].slots[i];
        const row = document.createElement('div');
        row.className = 'dslot' + (drives[d].active === i ? ' active' : '');
        const pick = document.createElement('label');
        pick.className = 'dpick';
        pick.title = 'Ez a lemez legyen a meghajtóban';
        const r = document.createElement('input');
        r.type = 'radio';
        r.name = 'drive' + d;
        r.checked = drives[d].active === i;
        r.onchange = () => { selectSlot(d, i); canvas.focus({ preventScroll: true }); };
        const nm = document.createElement('span');
        nm.className = 'dname';
        nm.textContent = (i + 1) + '. ' + (s ? s.name : 'üres');
        nm.title = s ? s.name : '';
        pick.append(r, nm);
        const open = document.createElement('label');
        open.className = 'file';
        open.title = 'Megnyitás: lemezkép feltöltése ebbe a helyre (.dsk, .img, .zip)';
        open.textContent = '📂';
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.img,.dsk,.zip';
        inp.onchange = diskInput((f) => (d ? loadDiskFileB(f, i) : loadDiskFile(f, i)));
        open.append(inp);
        const dl = document.createElement('button');
        dl.textContent = '⬇';
        dl.title = 'Letöltés: a lemezkép mentése';
        dl.disabled = !s;
        dl.onclick = () => { if (s) download(slotBytes(d, i), s.name); canvas.focus({ preventScroll: true }); };
        const x = document.createElement('button');
        x.textContent = '✕';
        x.className = 'dclear';
        x.title = 'A lemez kivétele (a hely üres lesz)';
        x.disabled = !s;
        x.onclick = () => { clearSlot(d, i); canvas.focus({ preventScroll: true }); };
        row.append(pick, open, dl, x);
        box.append(row);
      }
    }
  }

  // Megnyitás… of a slot: a disk image, or the first one in a ZIP
  function diskInput(load) {
    return async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (!ready) { setMessage('Először a ROM-okat kell betölteni', true); return; }
      resumeAudio();
      try {
        let bytes = new Uint8Array(await file.arrayBuffer());
        let name = file.name;
        if (extOf(name) === 'zip') {
          const img = (await unzip(bytes)).find((x) => fileKind(x) === 'disk');
          if (!img) { setMessage('Nincs lemezkép a ZIP-ben', true); return; }
          bytes = img.bytes;
          name = img.name;
        }
        load({ name, bytes });
      } catch (err) {
        setMessage(String(err.message || err), true);
      }
      canvas.focus({ preventScroll: true });
    };
  }

  // a disk image in drive B: (no autostart: the program or the user uses it)
  function loadDiskFileB(f, slot) {
    const i = slot === undefined ? drives[1].active : slot;
    const old = drives[1].active;
    storeSlot(1, i, f);
    drives[1].active = i;
    mountDrive(1);
    if (old !== i) persistSlot(1, old);
    saveDiskActive();
    renderDrives();
    setMessage('Lemez a B: meghajtóban: ' + f.name);
  }

  function loadDiskFile(f, slot) {
    const i = slot === undefined ? drives[0].active : slot;
    const old = drives[0].active;
    storeSlot(0, i, f);
    drives[0].active = i;
    syncDiskNames();
    if (old !== i) { api.setDisk(0, ''); persistSlot(0, old); }
    saveDiskActive();
    renderDrives();
    if (machine.type === 1) {
      if (tapeName) {
        api.setTape('');
        tapeName = '';
        $('tape-name').textContent = 'nincs kazetta';
      }
      loadTvcDisk(f.bytes);
    } else {
      if (!machine.roms.some((r) => r[0].startsWith('exdos'))) {
        applyMachine(MACHINES.find((x) => x.id === 'ep128uk-exdos'));
        $('machine').value = machine.id;
      }
      check(api.setDisk(0, '/disk/' + diskName), 'lemez');
      setMessage('Lemez az A: meghajtóban');
      startAutostart(':def_dev_disk\n:dir\n', null);
    }
  }

  // writes program files to the FILE: directory; returns the names of the
  // files that can be started
  function storeProgramFiles(files) {
    const startable = [];
    const stored = [];
    lastStoredFiles = stored;
    for (const f of files) {
      let name = hostName(f.name);
      if (machine.type === 1 && !extOf(name)) name += '.cas';
      M.FS.writeFile('/files/' + name, f.bytes);
      stored.push(name);
      if (isStartable(name)) startable.push(name);
    }
    listFiles();
    // a single file is started even if its extension is not a known one
    return (startable.length === 0 && stored.length === 1) ? stored : startable;
  }

  // the files of the last drop (in /files), copied to the TVC256k++ card's
  // PSRAM drive when the card loads the program
  let lastStoredFiles = [];

  // TVC with the TVC256k++ card: the program and the files dropped with it go
  // to the card's PSRAM drive and LOAD runs through the card, so the program
  // sees the card (its drives, functions, graphics) like on the real machine
  function startProgramOnCard(name) {
    let base = name.replace(/\.cas$/i, '');
    let files = lastStoredFiles.includes(name) ? lastStoredFiles.slice() : [name];
    if (!isTypable(base, 1)) {
      base = sanitizeName(base).replace(/\./g, '-') || 'program';
      files.push(base + '.cas');
      M.FS.writeFile('/files/' + base + '.cas', M.FS.readFile('/files/' + name));
      listFiles();
    }
    // as on the real card: the files go to the USB pendrive (plugged in now if
    // needed); the PSRAM is left to the programs, which often use it as memory
    if (!usbPlugged) {
      usbOn = true;
      try { localStorage.setItem('ep128web.usbOn', '1'); } catch (e) { }
      applyTvcUsb();
    }
    if (usbPlugged) {
      const failed = files.filter((f) => !usbPutBytes(f, M.FS.readFile('/files/' + f)));
      if (failed.length) setMessage('Nem fért a pendrive-ra: ' + failed.join(', '), true);
      saveUsb();
      renderUsb();
      startAutostart('load "' + base + '"\n', null, false, tvcRedirectFor(SLOT_CARD256), () => api.cardSelectDrive(0));
      return;
    }
    const prepare = () => {
      const failed = files.filter((f) => api.cardPutFile(f, '/files/' + f) !== 0);
      if (failed.length)
        setMessage('Nem fért a kártya PSRAM drive-jára: ' + failed.join(', '), true);
    };
    startAutostart('load "' + base + '"\n', null, false, tvcRedirectFor(SLOT_CARD256), prepare);
  }

  // TVC256k++ card: the browser's mouse becomes the card's USB mouse while
  // the pointer is locked to the screen (the button starts it, Esc ends it)
  function setupMouse() {
    const btn = $('btn-mouse');
    if (!btn) return;
    const toCard = (b) => (b & 1) | ((b & 4) >> 1) | ((b & 2) << 1);   // left, middle, right
    let buttons = 0;
    const locked = () => document.pointerLockElement === canvas;
    btn.onclick = () => {
      if (!ready) return;
      canvas.focus({ preventScroll: true });
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    };
    document.addEventListener('pointerlockchange', () => {
      btn.classList.toggle('on', locked());
      if (locked()) setMessage('Egér a TVC256k++ kártyán – kilépés: Esc');
      else { buttons = 0; if (ready) api.setMouse(0, 0, 0, 0); setMessage(''); }
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!locked() || !ready) return;
      api.setMouse(e.movementX | 0, e.movementY | 0, buttons, 0);
    });
    const onButton = (e) => {
      if (!locked() || !ready) return;
      buttons = toCard(e.buttons);
      api.setMouse(0, 0, buttons, 0);
      e.preventDefault();
    };
    canvas.addEventListener('mousedown', onButton);
    canvas.addEventListener('mouseup', onButton);
    canvas.addEventListener('contextmenu', (e) => { if (locked()) e.preventDefault(); });
    updateMouseButton();
  }

  // the mouse button is shown on the TVC when the TVC256k++ card is installed
  function updateMouseButton() {
    const btn = $('btn-mouse');
    if (!btn) return;
    btn.hidden = !(machine && machine.type === 1 && tvcSlotOf(SLOT_CARD256) >= 0);
  }

  function startProgram(name) {
    let cmd;
    if (machine.type === 1 && tvcSlotOf(SLOT_CARD256) >= 0 && extOf(name) === 'cas') {
      if (tapeName) {
        api.setTape('');
        tapeName = '';
        $('tape-name').textContent = 'nincs kazetta';
      }
      startProgramOnCard(name);
      return;
    }
    if (machine.type === 1) {
      if (tvcSlotOf(SLOT_FILEIO) < 0) {
        setMessage('A .cas programokhoz tegyél FILE: kártyát egy bővítőportba (Bővítőportok)', true);
        return;
      }
      if (tapeName) {
        api.setTape('');
        tapeName = '';
        $('tape-name').textContent = 'nincs kazetta';
      }
      setTvcRedirect(tvcRedirectFor(SLOT_FILEIO));
      let base = name.replace(/\.cas$/i, '');
      if (!isTypable(base, 1)) {
        // the name cannot be typed: start it through a copy with a simple name
        base = sanitizeName(base).replace(/\./g, '-') || 'program';
        M.FS.writeFile('/files/' + base + '.cas', M.FS.readFile('/files/' + name));
        listFiles();
      }
      cmd = 'load "' + base + '"\n';
    } else {
      let fname = name;
      if (!isTypable(fname, 0)) {
        fname = sanitizeName(fname);
        M.FS.writeFile('/files/' + fname, M.FS.readFile('/files/' + name));
        listFiles();
      }
      // EXOS file header: 00h, type (04h = BASIC program, 05h = machine code)
      const head = M.FS.readFile('/files/' + fname).subarray(0, 2);
      const isBasic = extOf(fname) === 'bas' || (head[0] === 0 && head[1] === 4);
      // FILE: as default device, so that further files are loaded from there
      cmd = ':def_dev_file\n' + (isBasic ? 'run' : 'load') + ' "file:' + fname + '"\n';
    }
    startAutostart(cmd, null, false);
  }

  // lets the user choose which program to start when several were loaded
  function choosePrograms(names) {
    const box = $('chooser');
    const title = $('chooser-title');
    const desc = $('chooser-desc');
    const list = $('chooser-list');
    if (title) title.textContent = 'Melyik programot indítsam?';
    if (desc) desc.textContent = (machine.type === 1 && tvcSlotOf(SLOT_CARD256) >= 0)
      ? 'Az összes fájl a TVC256k++ kártya PSRAM drive-jára kerül, így a program futás közben is betöltheti a többit.'
      : 'Az összes fájl a FILE: eszközre került, így a program futás közben is betöltheti a többit.';
    list.textContent = '';
    for (const n of names) {
      const b = document.createElement('button');
      b.textContent = n;
      b.onclick = () => { box.hidden = true; startProgram(n); canvas.focus({ preventScroll: true }); };
      list.appendChild(b);
    }
    showChooser(box);
  }

  // shows a chooser over the emulator screen, scrolled into view (the
  // program catalog below the screen may be scrolled away from it)
  function showChooser(box) {
    box.hidden = false;
    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const first = box.querySelector('button');
    if (first) first.focus({ preventScroll: true });
  }

  function chooseCasOrWav(casFiles, wavFiles, onChoose) {
    const box = $('chooser');
    const title = $('chooser-title');
    const desc = $('chooser-desc');
    const list = $('chooser-list');
    if (title) title.textContent = 'CAS vagy WAV formátum?';
    if (desc) desc.textContent = 'A betöltött ZIP archívumban CAS és WAV formátum is található. Melyiket szeretnéd elindítani?';
    list.textContent = '';

    for (const f of casFiles) {
      const b = document.createElement('button');
      b.textContent = '💾 CAS: ' + f.name;
      b.onclick = () => {
        box.hidden = true;
        onChoose('cas', f);
        canvas.focus({ preventScroll: true });
      };
      list.appendChild(b);
    }

    for (const f of wavFiles) {
      const b = document.createElement('button');
      b.textContent = '📼 WAV: ' + f.name;
      b.onclick = () => {
        box.hidden = true;
        onChoose('wav', f);
        canvas.focus({ preventScroll: true });
      };
      list.appendChild(b);
    }

    showChooser(box);
  }

  async function loadFiles(fileList) {
    resumeAudio();
    try {
      // read everything, expanding ZIP archives
      const files = [];
      for (const file of Array.from(fileList)) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (extOf(file.name) === 'zip') files.push(...await unzip(bytes));
        else files.push({ name: file.name, bytes });
      }
      const of = (kind) => files.filter((f) => fileKind(f) === kind);
      // ROMs first, so that a ROM package and a program can be dropped together
      for (const f of of('rom')) loadROMFile(f);
      for (const f of of('cardflash')) loadCardFlash(f);
      if (!files.some((f) => !['rom', 'cardflash'].includes(fileKind(f)))) return;
      if (!ready) {
        setMessage('Először a ROM-okat kell betölteni', true);
        return;
      }

      const casFiles = files.filter((f) => extOf(f.name) === 'cas');
      const wavFiles = files.filter((f) => extOf(f.name) === 'wav');

      if (casFiles.length > 0 && wavFiles.length > 0) {
        chooseCasOrWav(casFiles, wavFiles, (chosenType, chosenFile) => {
          let chosenFiles;
          if (chosenType === 'cas') {
            if (tapeName) {
              api.setTape('');
              tapeName = '';
              $('tape-name').textContent = 'nincs kazetta';
            }
            chosenFiles = files.filter((f) => extOf(f.name) !== 'wav');
          } else {
            chosenFiles = [chosenFile, ...files.filter((f) => extOf(f.name) !== 'cas' && f !== chosenFile)];
          }
          processLoadedFiles(chosenFiles);
        });
        return;
      }

      processLoadedFiles(files);
    } catch (e) {
      console.error(e);
      setMessage(String(e.message || e), true);
    }
    canvas.focus({ preventScroll: true });
  }

  function processLoadedFiles(files) {
    const of = (kind) => files.filter((f) => fileKind(f) === kind);
    const cartridges = of('cartridge');
    const snapshots = of('snapshot');
    const tapes = of('tape');
    const disks = of('disk');
    const progFiles = of('program');

    if (cartridges.length) {
      loadCartridgeFile(cartridges[0]);
      return;
    }

    // Only switch to Enterprise if explicit Enterprise program or Enterprise tape (.tap, .tzx, .cdt)
    if (machine.type === 1) {
      const isEpProg = progFiles.some((f) => {
        const ext = extOf(f.name);
        return ['com', 'prg', 'ep', 'exe', 'app'].includes(ext);
      });
      const isEpTape = tapes.some((f) => {
        const ext = extOf(f.name);
        return ['tap', 'tzx', 'cdt'].includes(ext);
      });
      if (isEpProg || isEpTape) {
        const ep = MACHINES.find((x) => x.id === 'ep128hu-exdos') || MACHINES.find((x) => x.id === 'ep128uk-exdos');
        if (ep) applyMachine(ep);
      }
    } else if (machine.type === 0) {
      const isTvcProg = progFiles.some((f) => extOf(f.name) === 'cas');
      const isTvcTape = tapes.some((f) => extOf(f.name) === 'wav');
      if (isTvcProg || isTvcTape) {
        const tvc = MACHINES.find((x) => x.id === DEFAULT_TVC) || MACHINES.find((x) => x.type === 1);
        if (tvc) applyMachine(tvc);
      }
    }

    // all other files go to the FILE: directory, so that programs which
    // load further files at run time find them there
    const startable = storeProgramFiles(progFiles);
    if (snapshots.length) {
      loadSnapshotFile(snapshots[0]);
    } else if (disks.length) {
      // with two disk images, the second one goes into drive B:
      if (disks.length > 1) loadDiskFileB(disks[1]);
      loadDiskFile(disks[0]);
    } else if (tapes.length) {
      loadTapeFile(tapes[0]);
    } else if (startable.length === 1) {
      startProgram(startable[0]);
    } else if (startable.length > 1) {
      choosePrograms(startable.sort());
    } else if (progFiles.length) {
      setMessage('Fájlok a FILE: eszközre másolva: ' + progFiles.map((f) => f.name).join(', '));
    }
  }

  // --------------------------------------------------------------------------
  // Screenshot, video and sound recording

  function stampName(ext) {
    return 'ep128-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext;
  }

  // the screen at 4:3 (the canvas has half the lines, the page stretches it)
  const recCanvas = document.createElement('canvas');
  const recCtx = recCanvas.getContext('2d', { alpha: false });
  function drawRecCanvas() {
    if (recCanvas.width !== canvas.width || recCanvas.height !== canvas.height * 2) {
      recCanvas.width = canvas.width;
      recCanvas.height = canvas.height * 2;
    }
    recCtx.imageSmoothingEnabled = false;
    recCtx.drawImage(canvas, 0, 0, recCanvas.width, recCanvas.height);
  }

  function saveScreenshot() {
    if (!ready) return;
    drawRecCanvas();
    recCanvas.toBlob((blob) => {
      if (blob) blob.arrayBuffer().then((b) => download(new Uint8Array(b), stampName('png')));
    }, 'image/png');
  }

  const recTime = (t0) => {
    const s = Math.floor((performance.now() - t0) / 1000);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };

  // 16 bit stereo WAV from the recorded float samples
  function wavFile(chunks, frames, rate) {
    const out = new DataView(new ArrayBuffer(44 + frames * 4));
    const str = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
    str(0, 'RIFF'); out.setUint32(4, 36 + frames * 4, true); str(8, 'WAVE');
    str(12, 'fmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true);
    out.setUint16(22, 2, true); out.setUint32(24, rate, true);
    out.setUint32(28, rate * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true);
    str(36, 'data'); out.setUint32(40, frames * 4, true);
    let o = 44;
    for (const c of chunks)
      for (let i = 0; i < c.length; i++, o += 2)
        out.setInt16(o, Math.round(Math.max(-1, Math.min(1, c[i])) * 32767), true);
    return new Uint8Array(out.buffer);
  }

  let audioRecTimer = 0;
  function toggleAudioRec() {
    const btn = $('btn-audio');
    if (audioRec) {
      const rec = audioRec;
      audioRec = null;
      clearInterval(audioRecTimer);
      btn.classList.remove('on');
      btn.textContent = '● Hang';
      if (rec.frames) download(wavFile(rec.chunks, rec.frames, sampleRate), stampName('wav'));
      return;
    }
    if (!ready) return;
    resumeAudio();
    audioRec = { chunks: [], frames: 0 };
    const t0 = performance.now();
    btn.classList.add('on');
    btn.textContent = '■ Hang 0:00';
    audioRecTimer = setInterval(() => { btn.textContent = '■ Hang ' + recTime(t0); }, 500);
  }

  // the recording types the browser supports: { mp4, webm }
  const VIDEO_TYPES = {
    // H.264 only: a VP9 MP4 does not play everywhere, WebM is better then
    mp4: ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1.42E01F,opus', 'video/mp4;codecs=avc1,opus'],
    webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
  };
  function videoFormats() {
    const r = {};
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return r;
    for (const k in VIDEO_TYPES) {
      const t = VIDEO_TYPES[k].find((x) => MediaRecorder.isTypeSupported(x));
      if (t) r[k] = t;
    }
    return r;
  }

  // the format selector: shown when the browser can record both, MP4 by default
  function setupVideoFormat() {
    const sel = $('video-fmt');
    const fmt = videoFormats();
    for (const o of Array.from(sel.options)) o.disabled = !fmt[o.value];
    let v = null;
    try { v = localStorage.getItem('ep128web.videoFmt'); } catch (e) { }
    sel.value = (v && fmt[v]) ? v : (fmt.mp4 ? 'mp4' : 'webm');
    sel.hidden = !(fmt.mp4 && fmt.webm);
    sel.onchange = () => {
      try { localStorage.setItem('ep128web.videoFmt', sel.value); } catch (e) { }
      canvas.focus({ preventScroll: true });
    };
  }

  let videoRec = null;
  let videoRecTimer = 0;
  function toggleVideoRec() {
    const btn = $('btn-video');
    if (videoRec) {
      videoRec.stop();
      return;
    }
    if (!ready) return;
    if (!canvas.captureStream || !window.MediaRecorder) {
      setMessage('Ez a böngésző nem tud videót felvenni', true);
      return;
    }
    resumeAudio();
    drawRecCanvas();
    const stream = recCanvas.captureStream(50);
    if (audioStreamDest)
      for (const t of audioStreamDest.stream.getAudioTracks()) stream.addTrack(t);
    const fmt = videoFormats();
    const type = fmt[$('video-fmt').value] || fmt.mp4 || fmt.webm || '';
    let rec;
    try {
      rec = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 8000000 } : {});
    } catch (e) {
      setMessage('A videófelvétel nem indult el: ' + (e.message || e), true);
      return;
    }
    const parts = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    rec.onstop = () => {
      videoRec = null;
      $('video-fmt').disabled = false;
      clearInterval(videoRecTimer);
      btn.classList.remove('on');
      btn.textContent = '● Videó';
      for (const t of stream.getVideoTracks()) t.stop();
      const mime = rec.mimeType || type || 'video/webm';
      const blob = new Blob(parts, { type: mime });
      blob.arrayBuffer().then((b) =>
        download(new Uint8Array(b), stampName(mime.includes('mp4') ? 'mp4' : 'webm')));
    };
    rec.start(1000);
    videoRec = rec;
    $('video-fmt').disabled = true;
    const t0 = performance.now();
    btn.classList.add('on');
    btn.textContent = '■ Videó 0:00';
    videoRecTimer = setInterval(() => { btn.textContent = '■ Videó ' + recTime(t0); }, 500);
    setMessage('Videófelvétel: a hangerő és a némítás a felvételre is hat');
  }

  // --------------------------------------------------------------------------
  // Touch controls: on-screen keyboard, joystick, text input

  // keys: [label, matrix code, shifted label, css class, width]
  const L = (chars, codes) => Array.from(chars).map((c, i) => [c.toUpperCase(), codes[i]]);
  const VKBD_LAYOUTS = [
    [   // Enterprise (UK)
      [['F1', 0x27, '', 'fn'], ['F2', 0x26, '', 'fn'], ['F3', 0x22, '', 'fn'],
       ['F4', 0x20, '', 'fn'], ['F5', 0x24, '', 'fn'], ['F6', 0x23, '', 'fn'],
       ['F7', 0x25, '', 'fn'], ['F8', 0x21, '', 'fn'], ['STOP', 0x38, '', 'fn'],
       ['HOLD', 0x3C, '', 'fn']],
      [['ESC', 0x1F, '', 'mod'], ['1', 0x19, '!'], ['2', 0x1E, '"'], ['3', 0x1D, '£'],
       ['4', 0x1B, '$'], ['5', 0x1C, '%'], ['6', 0x1A, '&'], ['7', 0x18, "'"],
       ['8', 0x28, '('], ['9', 0x2A, ')'], ['0', 0x2C, '_'], ['-', 0x2B, '='],
       ['^', 0x2D, '~'], ['ERASE', 0x2E, '', 'mod', 1.5]],
      [['TAB', 0x17, '', 'mod', 1.3]].concat(
        L('qwertyuiop', [0x11, 0x16, 0x15, 0x13, 0x14, 0x12, 0x10, 0x48, 0x4A, 0x4C]),
        [['@', 0x4B, '`'], ['[', 0x4D, '{'], ['DEL', 0x41, '', 'mod', 1.2]]),
      [['CTRL', 0x0F, '', 'mod sticky', 1.6]].concat(
        L('asdfghjkl', [0x0E, 0x0D, 0x0B, 0x0C, 0x0A, 0x08, 0x30, 0x32, 0x34]),
        [[';', 0x33, '+'], [':', 0x35, '*'], [']', 0x36, '}'],
         ['ENTER', 0x3E, '', 'mod', 1.7]]),
      [['SHIFT', 0x07, '', 'mod sticky', 1.7], ['\\', 0x01, '|']].concat(
        L('zxcvbnm', [0x06, 0x05, 0x03, 0x04, 0x02, 0x00, 0x40]),
        [[',', 0x42, '<'], ['.', 0x44, '>'], ['/', 0x43, '?'],
         ['SHIFT', 0x45, '', 'mod sticky', 1.7]]),
      [['LOCK', 0x09, '', 'mod', 1.2], ['ALT', 0x3F, '', 'mod sticky', 1.2],
       ['SPACE', 0x46, '', '', 5], ['INS', 0x47, '', 'mod'],
       ['←', 0x3D, '', 'mod'], ['↑', 0x3B, '', 'mod'], ['↓', 0x39, '', 'mod'],
       ['→', 0x3A, '', 'mod']]
    ],
    [   // Videoton TVC (Hungarian), as mapped by ep128emu
      [['0', 0x4B], ['1', 0x19, "'"], ['2', 0x1E, '"'], ['3', 0x1D, '+'],
       ['4', 0x1B, '!'], ['5', 0x1C, '%'], ['6', 0x1A, '/'], ['7', 0x18, '='],
       ['8', 0x28, '('], ['9', 0x2A, ')'], ['Ö', 0x2C], ['Ü', 0x2B], ['Ó', 0x2D],
       ['*', 0x24, '#'], ['^', 0x23, '~'], ['DEL', 0x2E, '', 'mod', 1.4]],
      [['ESC', 0x38, '', 'mod', 1.3]].concat(
        L('qwertzuiop', [0x11, 0x16, 0x15, 0x13, 0x14, 0x12, 0x10, 0x48, 0x4A, 0x4C]),
        [['Ő', 0x4D], ['Ú', 0x36], ['[', 0x25, '{'], [']', 0x21, '}']]),
      [['LOCK', 0x09, '', 'mod', 1.5]].concat(
        L('asdfghjkl', [0x0E, 0x0D, 0x0B, 0x0C, 0x0A, 0x08, 0x30, 0x32, 0x34]),
        [['É', 0x33], ['Á', 0x35], ['Ű', 0x01], ['RETURN', 0x3E, '', 'mod', 1.8]]),
      [['SHIFT', 0x07, '', 'mod sticky', 1.7], ['<', 0x22, '>']].concat(
        L('yxcvbnm', [0x06, 0x05, 0x03, 0x04, 0x02, 0x00, 0x40]),
        [[',', 0x42, '?'], ['.', 0x44, ':'], ['-', 0x43, '_'],
         ['SHIFT', 0x45, '', 'mod sticky', 1.7]]),
      [['CTRL', 0x0F, '', 'mod sticky', 1.2], ['ALT', 0x3F, '', 'mod sticky', 1.1],
       ['@', 0x27, '`'], [';', 0x17, '$'], ['\\', 0x20, '|'], ['SPACE', 0x46, '', '', 4.5],
       ['INS', 0x47, '', 'mod'], ['←', 0x3D, '', 'mod'], ['↑', 0x3B, '', 'mod'],
       ['↓', 0x39, '', 'mod'], ['→', 0x3A, '', 'mod']]
    ]
  ];

  const stickyMods = new Set();        // latched SHIFT / CTRL / ALT codes
  let vkbdType = -1;

  function vibrate() {
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) { }
  }

  function renderKeyboard() {
    const type = machine ? machine.type : 0;
    if (type === vkbdType) return;
    vkbdType = type;
    stickyMods.clear();
    const box = $('vkbd');
    box.textContent = '';
    for (const row of VKBD_LAYOUTS[type]) {
      const r = document.createElement('div');
      r.className = 'row';
      for (const [label, code, shifted, cls, width] of row) {
        const k = document.createElement('button');
        k.type = 'button';
        k.className = 'k' + (cls ? ' ' + cls : '');
        k.dataset.code = code;
        if (width) k.style.flexGrow = width;
        if (shifted) {
          const sm = document.createElement('small');
          sm.textContent = shifted;
          k.appendChild(sm);
        }
        k.appendChild(document.createTextNode(label));
        r.appendChild(k);
      }
      box.appendChild(r);
    }
  }

  function setupKeyboard() {
    const box = $('vkbd');
    const active = new Map();          // pointerId -> [element, code, mods]
    box.addEventListener('pointerdown', (e) => {
      const k = e.target.closest('.k');
      if (!k || !api) return;
      e.preventDefault();
      resumeAudio();
      vibrate();
      const code = Number(k.dataset.code);
      if (k.classList.contains('sticky')) {
        // SHIFT / CTRL / ALT: latch until the next key
        if (stickyMods.has(code)) stickyMods.delete(code);
        else stickyMods.add(code);
        for (const el of box.querySelectorAll('.sticky'))
          el.classList.toggle('on', stickyMods.has(Number(el.dataset.code)));
        return;
      }
      try { k.setPointerCapture(e.pointerId); } catch (er) { }
      const mods = Array.from(stickyMods);
      for (const m of mods) keyDown(m);
      keyDown(code);
      k.classList.add('down');
      active.set(e.pointerId, [k, code, mods]);
      if (mods.length) {
        stickyMods.clear();
        for (const el of box.querySelectorAll('.sticky.on')) el.classList.remove('on');
      }
    });
    const release = (e) => {
      const a = active.get(e.pointerId);
      if (!a) return;
      active.delete(e.pointerId);
      const [k, code, mods] = a;
      k.classList.remove('down');
      keyUp(code);
      for (const m of mods) keyUp(m);
    };
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);
    box.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // joystick: bits 0..4 = right, left, down, up, fire
  const JOY_CODES = {
    joy1: [0x70, 0x71, 0x72, 0x73, 0x74],
    cursor: [0x3A, 0x3D, 0x39, 0x3B, 0x46]
  };
  let vjoyMode = 'joy1';
  let vjoyState = 0;

  function setJoyState(state) {
    if (vjoyMode === 'joy1') {
      if (state !== vjoyState && (state & ~vjoyState)) vibrate();
      vjoyState = state;
      setJoySource('touch', state);
      return;
    }
    const codes = JOY_CODES[vjoyMode];
    for (let i = 0; i < 5; i++) {
      const bit = 1 << i;
      if ((state & bit) && !(vjoyState & bit)) keyDown(codes[i]);
      else if (!(state & bit) && (vjoyState & bit)) keyUp(codes[i]);
    }
    if (state !== vjoyState && (state & ~vjoyState)) vibrate();
    vjoyState = state;
  }

  function setupJoystick() {
    const pad = $('vjoy-pad');
    const knob = pad.querySelector('.knob');
    let padPointer = null;
    const update = (e) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const radius = r.width / 2;
      const dist = Math.hypot(dx, dy);
      let dirs = 0;
      if (dist > radius * 0.22) {
        if (dx > dist * 0.38) dirs |= 1;
        if (dx < -dist * 0.38) dirs |= 2;
        if (dy > dist * 0.38) dirs |= 4;
        if (dy < -dist * 0.38) dirs |= 8;
      }
      const k = Math.min(1, (radius * 0.6) / Math.max(dist, 1));
      knob.style.transform = 'translate(' + (dx * k) + 'px,' + (dy * k) + 'px)';
      setJoyState((vjoyState & 16) | dirs);
    };
    const end = (e) => {
      if (e.pointerId !== padPointer) return;
      padPointer = null;
      knob.style.transform = '';
      setJoyState(vjoyState & 16);
    };
    pad.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resumeAudio();
      padPointer = e.pointerId;
      try { pad.setPointerCapture(e.pointerId); } catch (er) { }
      update(e);
    });
    pad.addEventListener('pointermove', (e) => { if (e.pointerId === padPointer) update(e); });
    pad.addEventListener('pointerup', end);
    pad.addEventListener('pointercancel', end);

    const fire = $('vjoy-fire');
    let firePointer = null;
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      resumeAudio();
      firePointer = e.pointerId;
      try { fire.setPointerCapture(e.pointerId); } catch (er) { }
      fire.classList.add('down');
      setJoyState(vjoyState | 16);
    });
    const fireEnd = (e) => {
      if (e.pointerId !== firePointer) return;
      firePointer = null;
      fire.classList.remove('down');
      setJoyState(vjoyState & 15);
    };
    fire.addEventListener('pointerup', fireEnd);
    fire.addEventListener('pointercancel', fireEnd);
    for (const el of [pad, fire]) el.addEventListener('contextmenu', (e) => e.preventDefault());

    $('vjoy-mode').onchange = (e) => {
      setJoyState(0);
      vjoyMode = e.target.value;
      try { localStorage.setItem('ep128web.vjoyMode', vjoyMode); } catch (er) { }
    };
    try {
      const m = localStorage.getItem('ep128web.vjoyMode');
      if (m && JOY_CODES[m]) { vjoyMode = m; $('vjoy-mode').value = m; }
    } catch (e) { }
  }

  // types text on the emulated keyboard (Enter is added at the end)
  function typeText(text) {
    if (!ready || autoTask) return;
    releaseAllKeys();
    // the TVC swallows the first key after a reset: send an Enter first
    if (machine.type === 1 && !keyedSinceReset) text = '\n' + text;
    keyedSinceReset = true;
    autoTask = {
      phase: 'type', t: 0, phaseT: 0, command: '', onTyped: null, wait: 0,
      events: buildKeyEvents(text)
    };
  }

  function setupTouchControls() {
    renderKeyboard();
    setupKeyboard();
    setupJoystick();
    const panels = { 'tb-kbd': 'vkbd', 'tb-joy': 'vjoy', 'tb-text': 'typer' };
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    for (const [btn, panel] of Object.entries(panels)) {
      let on = coarse && btn !== 'tb-text';
      try {
        const v = localStorage.getItem('ep128web.' + panel);
        if (v !== null) on = (v === '1');
      } catch (e) { }
      const apply = () => {
        $(panel).hidden = !on;
        $(btn).setAttribute('aria-pressed', String(on));
      };
      apply();
      $(btn).onclick = () => {
        on = !on;
        apply();
        try { localStorage.setItem('ep128web.' + panel, on ? '1' : '0'); } catch (e) { }
        if (panel === 'typer' && on) $('typer-input').focus();
        if (panel === 'vjoy' && !on) setJoyState(0);
      };
    }
    // the text field types one line, or a whole pasted program line by line
    const inp = $('typer-input');
    const fit = () => { inp.rows = Math.min(12, Math.max(1, inp.value.split('\n').length)); };
    inp.addEventListener('input', fit);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        $('typer').requestSubmit();
      }
    });
    $('typer').addEventListener('submit', (e) => {
      e.preventDefault();
      if (autoTask) {
        if (autoTask.fromTyper) {       // the button stops a long typing
          autoTask = null;
          releaseAllKeys();
          setMessage('Beírás leállítva');
          $('typer-send').textContent = 'Beír + Enter';
        }
        return;
      }
      $('typer-send').textContent = 'Beír + Enter';
      const text = inp.value.replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(/\s+$/, '');
      if (!text) return;
      const map = charMap();
      const bad = new Set(Array.from(text).filter((ch) => ch !== '\n' && !map[ch]));
      typeText(text + '\n');
      if (!autoTask) return;
      autoTask.fromTyper = true;
      const lines = text.split('\n').length;
      if (lines > 1) {
        $('typer-send').textContent = 'Leállítás';
        autoTask.onTyped = () => { $('typer-send').textContent = 'Beír + Enter'; };
      }
      setMessage((lines > 1 ? lines + ' sor beírása…' : '') +
        (bad.size ? ' Nem gépelhető karakterek kimaradnak: ' + Array.from(bad).join(' ') : ''), bad.size > 0);
      inp.value = '';
      fit();
    });
    $('tb-full').onclick = () => { toggleFullscreen(); canvas.focus({ preventScroll: true }); };
  }

  function toggleFullscreen() {
    const el = $('play');
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  }

  // --------------------------------------------------------------------------
  // UI

  // TVC expansion slots: the selection only takes effect with the button,
  // which installs the cards and restarts the machine
  function setupTvcSlotsUI() {
    const selects = [0, 1, 2, 3].map((i) => $('tvc-slot' + i));
    if (selects.some((x) => !x)) return;
    const show = () => selects.forEach((sel, i) => { sel.value = String(tvcSlots[i]); });
    const pending = () => selects.map((sel) => Number(sel.value));
    const update = () => {
      const p = pending();
      const changed = p.some((c, i) => c !== tvcSlots[i]);
      $('tvc-slots-apply').classList.toggle('on', changed);
      $('tvc-slots-note').textContent = !validTvcSlots(p)
        ? (p.includes(SLOT_VTDOS) && p.includes(SLOT_UPM)
          ? 'Egyszerre csak egy lemezkártya (VT-DOS vagy UPM) működik.'
          : 'Egy kártya csak egy portban lehet.')
        : (changed ? 'Módosítva – a betöltés gombbal lép életbe.' : '');
    };
    for (const sel of selects) {
      for (const card of TVC_CARDS) {
        const o = document.createElement('option');
        o.value = String(card.id);
        o.textContent = card.name;
        sel.appendChild(o);
      }
      sel.onchange = update;
    }
    show();
    refreshTvcSlotsUI = () => { show(); update(); };
    $('tvc-slots-apply').onclick = () => {
      const p = pending();
      if (!validTvcSlots(p)) { update(); return; }
      tvcSlots = p;
      try { localStorage.setItem('ep128web.tvcSlots', JSON.stringify(tvcSlots)); } catch (e) { }
      update();
      if (fxOn && tvcSlotOf(SLOT_CARD256) >= 0) {
        fxOn = false;
        try { localStorage.setItem('ep128web.2dfx', '0'); } catch (e) { }
        setMessage('A 2dfx kártya kikapcsolva: a TVC256k++ mellett nem működik');
      }
      if (machine.type === 1) {
        autoTask = null;
        releaseAllKeys();
        applyMachine(machine);        // loads the card ROMs, cold reset
      }
      canvas.focus({ preventScroll: true });
    };
    $('tvc-slots-default').onclick = () => {
      selects.forEach((sel, i) => { sel.value = String(TVC_DEFAULT_SLOTS[i]); });
      update();
    };
    update();
  }

  let muted = false;
  try { muted = localStorage.getItem('ep128web.muted') === '1'; } catch (e) { }

  // the emulator's output volume goes down to 0.01 (-40 dB) only, so below
  // that (and when muted) the page scales the samples itself
  let outGain = 1;

  function applyVolume() {
    const v = muted ? 0 : Number($('volume').value) / 100;
    api.setVolume(v * v);
    outGain = Math.min(1, v * v / 0.01);
    const b = $('btn-mute');
    if (b) {
      b.textContent = muted ? '🔇' : '🔊';
      b.title = muted ? 'Hang bekapcsolása' : 'Némítás';
      b.setAttribute('aria-pressed', String(muted));
    }
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('ep128web.muted', muted ? '1' : '0'); } catch (e) { }
    applyVolume();
  }

  function reset(cold) {
    if (!ready) return;
    autoTask = null;
    releaseAllKeys();
    api.reset(cold ? 1 : 0);
    keyedSinceReset = false;
    resumeAudio();
    canvas.focus({ preventScroll: true });
  }

  function toggleTurbo() {
    turbo = !turbo;
    $('btn-turbo').classList.toggle('on', turbo);
  }

  // ========== CATALOG SECTION ==========
  const catalogState = {
    items: [],
    filtered: []
  };

  function normalizeCatalogMeta(item) {
    return {
      title: item.title || 'Program',
      description: item.description || '',
      image_url: item.image_url || '',
      download_url: item.download_url || item.url || '',
      file_name: item.file_name || (item.title || 'program') + '.zip',
      type: item.type || 'ismeretlen',
      date: item.date || ''
    };
  }

  function populateCatalogTypeFilter() {
    const sel = $('catalog-type');
    if (!sel) return;
    const types = [...new Set(catalogState.items.map((i) => i.type).filter(Boolean))].sort();
    const current = sel.value;
    sel.innerHTML = '<option value="">Minden típus</option>';
    // the machine / expansion categories, from the words in the titles
    const g = document.createElement('optgroup');
    g.label = 'Gép, bővítés';
    for (const t of CATALOG_TAGS) {
      const opt = document.createElement('option');
      opt.value = 'tag:' + t.id;
      const n = catalogState.items.filter((i) => catalogTags(i.title).includes(t.id)).length;
      opt.textContent = t.label + ' (' + n + ')';
      g.appendChild(opt);
    }
    sel.appendChild(g);
    const g2 = document.createElement('optgroup');
    g2.label = 'Típus';
    for (const t of types) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      g2.appendChild(opt);
    }
    sel.appendChild(g2);
    if (types.includes(current) || current.startsWith('tag:')) sel.value = current;
  }

  function populateCatalogYearFilter() {
    const sel = $('catalog-year');
    if (!sel) return;
    const years = [...new Set(catalogState.items.map((i) => (i.date ? i.date.slice(0, 4) : '')).filter(Boolean))].sort();
    const current = sel.value || '2000+';
    sel.innerHTML = '<option value="">Minden évjárat</option><option value="2000+">2000-től</option>';
    for (const y of years) {
      const opt = document.createElement('option');
      opt.value = y;
      opt.textContent = y;
      sel.appendChild(opt);
    }
    sel.value = current;
  }

  function renderCatalog(items) {
    const grid = $('catalog-grid');
    if (!grid) return;

    grid.textContent = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'catalog-empty';
      empty.textContent = 'Nincs a szűrőknek megfelelő program.';
      grid.appendChild(empty);
      return;
    }

    for (const item of items) {
      const entry = normalizeCatalogMeta(item);
      const card = document.createElement('article');
      card.className = 'catalog-card';

      const img = document.createElement('img');
      img.alt = entry.title;
      img.loading = 'lazy';

      if (entry.image_url) {
        img.src = entry.image_url;
        img.onerror = () => { img.remove(); };
      } else {
        img.remove();
      }

      const body = document.createElement('div');
      body.className = 'catalog-card-body';

      const title = document.createElement('h4');
      title.textContent = entry.title;

      const desc = document.createElement('p');
      desc.textContent = entry.description || 'TVC program';

      const meta = document.createElement('div');
      meta.className = 'catalog-meta';

      if (entry.type) {
        const type = document.createElement('span');
        type.textContent = entry.type;
        meta.appendChild(type);
      }

      if (entry.date) {
        const date = document.createElement('span');
        date.textContent = entry.date;
        meta.appendChild(date);
      }

      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Betöltés';
      button.onclick = async () => {
        // the program starts on the emulator screen: show it
        $('screen-wrap').scrollIntoView({ behavior: 'smooth', block: 'start' });
        await launchCatalogItem(entry);
      };

      body.appendChild(title);
      body.appendChild(desc);
      body.appendChild(meta);
      body.appendChild(button);

      card.appendChild(img);
      card.appendChild(body);
      grid.appendChild(card);
    }
  }

  function applyCatalogFilters() {
    const search = ($('catalog-search')?.value || '').trim().toLowerCase();
    const type = $('catalog-type')?.value || '';
    const year = $('catalog-year')?.value || '';

    const filtered = catalogState.items.filter((item) => {
      const entry = normalizeCatalogMeta(item);
      const haystack = `${entry.title} ${entry.description} ${entry.type}`.toLowerCase();
      const searchOk = !search || haystack.includes(search);
      const typeOk = !type || (type.startsWith('tag:')
        ? catalogTags(entry.title).includes(type.slice(4)) : entry.type === type);
      let yearOk = true;
      if (year === '2000+') {
        const y = parseInt(entry.date, 10);
        yearOk = !isNaN(y) && y >= 2000;
      } else if (year) {
        yearOk = entry.date && entry.date.startsWith(year);
      }

      return searchOk && typeOk && yearOk;
    });

    catalogState.filtered = filtered;
    renderCatalog(filtered);
    const status = $('catalog-status');
    if (status) {
      status.textContent = `${filtered.length} program megjelenítve`;
    }
  }

  // catalog programs with "DOS" or "UPM" in their title run with the VT-DOS
  // or UPM system cartridge, "64k+" ones on the TVC 64k+ with BASIC 2.2,
  // "256k++" ones with the TVC256k++ card, "2dfx" ones with the 2dfx card;
  // the others on the TVC the user chose (when the catalog had switched away
  // from it), else on the current one without a cartridge
  let userTvc = DEFAULT_TVC;        // the TVC without a cartridge the user chose
  let catalogSwitched = false;      // the catalog chose the current machine

  // categories from words in the program titles: "Sargon (DOS)", "Fred (64k+)"
  const CATALOG_TAGS = [
    { id: 'dos', label: 'DOS (VT-DOS)', re: /(^|[^a-z0-9])dos([^a-z0-9]|$)/i },
    { id: 'upm', label: 'UPM', re: /(^|[^a-z0-9])upm([^a-z0-9]|$)/i },
    { id: '256k++', label: '256k++', re: /256k\+\+/i },
    { id: '2dfx', label: '2dfx', re: /(^|[^a-z0-9])2dfx([^a-z0-9]|$)/i },
    { id: '64k+', label: '64k+ (BASIC 2.2)', re: /64k\+(?!\+)/i }
  ];
  function catalogTags(title) {
    return CATALOG_TAGS.filter((t) => t.re.test(title || '')).map((t) => t.id);
  }

  function catalogMachine(item) {
    const tags = catalogTags(item.title);
    if (tags.includes('dos')) return 'tvc64p-22-vtdoscart';
    if (tags.includes('upm')) return 'tvc64p-12-upm';
    if (tags.includes('64k+')) return 'tvc64p-22';
    if (catalogSwitched) return userTvc;
    return machine.cart ? plainTvc().id : machine.id;
  }

  // "256k++" programs need the TVC256k++ card, "2dfx" ones the 2dfx card
  // (the two do not work together); returns true if the slots changed
  function catalogCards(item) {
    const tags = catalogTags(item.title);
    let changed = false;
    if (tags.includes('256k++')) {
      if (fxOn) {
        fxOn = false;
        try { localStorage.setItem('ep128web.2dfx', '0'); } catch (e) { }
      }
      if (tvcSlotOf(SLOT_CARD256) < 0) {
        let slot = tvcSlots.indexOf(SLOT_EMPTY);
        if (slot < 0) slot = 3;
        tvcSlots = tvcSlots.slice();
        tvcSlots[slot] = SLOT_CARD256;
        changed = true;
      }
    } else if (tags.includes('2dfx')) {
      if (!fxOn) {
        fxOn = true;
        try { localStorage.setItem('ep128web.2dfx', '1'); } catch (e) { }
      }
      const slot = tvcSlotOf(SLOT_CARD256);
      if (slot >= 0) {
        tvcSlots = tvcSlots.slice();
        tvcSlots[slot] = SLOT_EMPTY;
        changed = true;
      }
    }
    if (changed) {
      try { localStorage.setItem('ep128web.tvcSlots', JSON.stringify(tvcSlots)); } catch (e) { }
      refreshTvcSlotsUI();
    }
    return changed;
  }

  async function launchCatalogItem(item) {
    const fileName = item.file_name || (item.title ? item.title + '.zip' : 'program.zip');
    // Use dl.php on homeserver which provides Access-Control-Allow-Origin: *
    const dlUrl = 'https://tvc.homeserver.hu/dl.php?file=' + encodeURIComponent(fileName);
    const url = item.download_url || dlUrl;

    try {
      setMessage('Program letöltése…');
      let res;
      try {
        res = await fetch(dlUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } catch (err1) {
        // Fallback to item.download_url if dlUrl failed
        res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) throw new Error('Letöltés HTTP ' + res.status);
      }

      const blob = await res.blob();
      const id = catalogMachine(item);
      const m = MACHINES.find((x) => x.id === id);
      const cardsChanged = catalogCards(item);
      if (m && (m !== machine || cardsChanged)) {
        autoTask = null;
        releaseAllKeys();
        applyMachine(m);              // with the cards, cold reset
      } else {
        apply2dfx();
      }
      catalogSwitched = machine.id !== userTvc;
      const file = new File([blob], fileName, {
        type: blob.type || 'application/octet-stream'
      });

      await loadFiles([file]);
      setMessage('Program betöltve: ' + (item.title || fileName));
    } catch (e) {
      console.error(e);
      setMessage('Hiba a program letöltésekor: ' + (e.message || e), true);
    }
  }

  async function loadCatalog() {
    const status = $('catalog-status');
    if (!status) return;

    try {
      let res = await fetch('catalog/programs.json', { cache: 'no-store' });
      if (!res.ok) {
        res = await fetch('catalog.json', { cache: 'no-store' });
      }
      if (!res.ok) throw new Error('catalog missing');

      const items = await res.json();
      catalogState.items = Array.isArray(items) ? items : [];
      populateCatalogTypeFilter();
      populateCatalogYearFilter();
      applyCatalogFilters();
      const count = catalogState.filtered.length;
      status.textContent = count ? `${count} program található` : 'Nincs megjeleníthető program';
    } catch (e) {
      console.error(e);
      status.textContent = 'A programkatalógus nem érhető el.';
    }
  }

  function setupCatalogUI() {
    const search = $('catalog-search');
    const type = $('catalog-type');
    const year = $('catalog-year');

    if (search) search.addEventListener('input', applyCatalogFilters);
    if (type) type.addEventListener('change', applyCatalogFilters);
    if (year) year.addEventListener('change', applyCatalogFilters);

    loadCatalog();
  }
  // ========== END CATALOG SECTION ==========

  function setupUI() {
    const sel = $('machine');
    ['Enterprise', 'Videoton TVC'].forEach((label, type) => {
      const g = document.createElement('optgroup');
      g.label = label;
      for (const m of MACHINES.filter((x) => x.type === type)) {
        const o = document.createElement('option');
        o.value = m.id;
        o.textContent = m.name;
        g.appendChild(o);
      }
      sel.appendChild(g);
    });
    sel.value = machine.id;
    sel.addEventListener('change', () => {
      const m = MACHINES.find((x) => x.id === sel.value);
      if (m.type === 1 && !m.cart) userTvc = m.id;
      catalogSwitched = false;
      autoTask = null;
      releaseAllKeys();
      applyMachine(m);
      canvas.focus({ preventScroll: true });
    });

    $('btn-reset').onclick = () => reset(false);
    $('btn-cold').onclick = () => reset(true);
    $('btn-pause').onclick = () => {
      paused = !paused;
      $('btn-pause').classList.toggle('on', paused);
      releaseAllKeys();
    };
    $('btn-turbo').onclick = toggleTurbo;
    $('btn-load').onclick = () => {
      if (machine.type === 1)
        setTvcRedirect(defaultTvcLoadRedirect());
      typeText('load"*"\n');
      canvas.focus({ preventScroll: true });
    };
    const btnRun = $('btn-run');
    if (btnRun) btnRun.onclick = () => {
      if (machine.type === 1)
        setTvcRedirect(defaultTvcLoadRedirect());
      typeText('run\n');
      canvas.focus({ preventScroll: true });
    };
    setupMouse();
    setupUsbUI();
    $('btn-snap').onclick = () => {
      if (!ready) return;
      check(api.saveSnapshot('/tmp/save.ep128s'), 'mentés');
      download(M.FS.readFile('/tmp/save.ep128s'), 'ep128-' +
               new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.ep128s');
    };
    $('btn-shot').onclick = () => { saveScreenshot(); canvas.focus({ preventScroll: true }); };
    $('btn-video').onclick = () => { toggleVideoRec(); canvas.focus({ preventScroll: true }); };
    setupVideoFormat();
    $('btn-audio').onclick = () => { toggleAudioRec(); canvas.focus({ preventScroll: true }); };
    $('btn-mute').onclick = () => { toggleMute(); canvas.focus({ preventScroll: true }); };
    $('volume').oninput = (e) => {
      applyVolume();
      try { localStorage.setItem('ep128web.volume', e.target.value); } catch (er) { }
    };
    try {
      const v = localStorage.getItem('ep128web.volume');
      if (v !== null) $('volume').value = v;
    } catch (e) { }
    $('volume').oninput({ target: $('volume') });

    setupTouchControls();
    $('chooser-cancel').onclick = () => { $('chooser').hidden = true; canvas.focus({ preventScroll: true }); };
    $('file-any').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    const fileGames = $('file-games');
    if (fileGames) fileGames.onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    $('file-roms').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };

    $('tape-play').onclick = () => {
      if (tapeName) {
        if (machine.type === 1) writeMemory(2821, 5);
        api.tapeCommand(1);
      }
      canvas.focus({ preventScroll: true });
    };
    $('tape-stop').onclick = () => { if (tapeName) api.tapeCommand(0); canvas.focus({ preventScroll: true }); };
    $('tape-rew').onclick = () => { if (tapeName) api.tapeCommand(2); canvas.focus({ preventScroll: true }); };
    $('tape-rec').onclick = () => { if (tapeName) api.tapeCommand(3); canvas.focus({ preventScroll: true }); };
    $('tape-new').onclick = () => {
      tapeName = 'tape-' + Date.now().toString(36) + '.tap';
      check(api.setTape('/tape/' + tapeName), 'kazetta');
      $('tape-name').textContent = tapeName + ' (üres)';
      canvas.focus({ preventScroll: true });
    };
    $('tape-save').onclick = () => {
      if (!tapeName) return;
      api.setTape('');                  // flush and close the tape file
      download(M.FS.readFile('/tape/' + tapeName), tapeName);
      check(api.setTape('/tape/' + tapeName), 'kazetta');
    };
    renderDrives();
    setInterval(checkDiskActivity, 300);
    window.addEventListener('pagehide', persistDrives);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') persistDrives();
    });
    // Betöltés… of FILE:: the files (ZIPs expanded) are only copied there,
    // a program is started by clicking its name
    $('files-file').onchange = async (e) => {
      const fileList = Array.from(e.target.files);
      e.target.value = '';
      if (!fileList.length) return;
      if (!ready) { setMessage('Először a ROM-okat kell betölteni', true); return; }
      try {
        const files = [];
        for (const file of fileList) {
          const bytes = new Uint8Array(await file.arrayBuffer());
          if (extOf(file.name) === 'zip') files.push(...await unzip(bytes));
          else files.push({ name: file.name, bytes });
        }
        const startable = storeProgramFiles(files);
        setMessage('FILE: eszközre másolva: ' + files.map((f) => f.name).join(', ') +
          (startable.length ? ' (indítás: kattints a nevére)' : ''));
      } catch (err) {
        setMessage(String(err.message || err), true);
      }
      canvas.focus({ preventScroll: true });
    };
    $('files-clear').onclick = () => {
      for (const n of M.FS.readdir('/files'))
        if (n !== '.' && n !== '..') M.FS.unlink('/files/' + n);
      listFiles();
    };
    const cartEject = $('cart-eject');
    if (cartEject) cartEject.onclick = ejectCartridge;
    $('tape-fast').onchange = (e) => { tapeFast = e.target.checked; canvas.focus({ preventScroll: true }); };
    renderJoyMap();
    setupTvcSlotsUI();
    setup2dfx();
    setupDebugger();

    const wrap = $('screen-wrap');
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drag'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      wrap.classList.remove('drag');
      if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });
    canvas.addEventListener('pointerdown', () => { resumeAudio(); canvas.focus({ preventScroll: true }); });
    document.addEventListener('pointerdown', resumeAudio, { once: true });
    setupCatalogUI();
  }

  // --------------------------------------------------------------------------
  // Debugger: registers, disassembly, memory, breakpoints and watchpoints
  // (with conditions), monitor, history, profiler, I/O log, machine and
  // card views, symbols and a JavaScript API (window.ep).
  // The emulator stops at instruction boundaries (web/src/webdebug.cpp);
  // while it is stopped, the main loop does not run it.

  const hex = (v, n) => (v >>> 0).toString(16).toUpperCase().padStart(n, '0');
  const DBG_REGS = ['PC', 'AF', 'BC', 'DE', 'HL', 'IX', 'IY', 'SP',
                    "AF'", "BC'", "DE'", "HL'", 'I', 'R', 'IM', 'IFF1', 'IFF2'];
  const DBG_REASONS = ['', 'Töréspont', 'Lépés kész', 'Megállítva',
                       'Memória olvasás', 'Memória írás', 'Port olvasás (IN)', 'Port írás (OUT)'];
  const DBG_MEM_NAMES = ['CPU', 'szegmens', '2dfx RAM', 'PSRAM'];
  let dbgOpen = false;
  let dbgStopped = false;
  let dbgCursor = -1;                 // selected disassembly line (run to cursor)
  let dbgDisStart = -1;               // start address when not following the PC
  let dbgMemAddr = 0, dbgMemSrc = 0;
  let dbgPrevRegs = null, dbgPrevMem = null;
  let dbgTab = 'mon';
  let dbgOnBreakFn = null;            // script callback: true = continue
  // { type: 'x' | 'r' | 'w' | 'rw' | 'ior' | 'iow' | 'iorw', addr, cond, on, hits }
  let dbgBps = [];
  try { dbgBps = JSON.parse(localStorage.getItem('ep128web.dbgBps')) || []; } catch (e) { }
  if (!Array.isArray(dbgBps)) dbgBps = [];
  dbgBps.forEach((b) => { b.hits = 0; if (b.on === undefined) b.on = true; });

  // --- symbols ---
  let dbgSyms = new Map();            // address -> name
  let dbgSymAddr = new Map();         // NAME -> address
  function dbgLoadSymbols(text) {
    const syms = new Map(), byName = new Map();
    const num = (t) => {
      let m = /^(?:0x|\$|#|&)([0-9a-f]+)$/i.exec(t) || /^([0-9][0-9a-f]*)h$/i.exec(t) || /^([0-9a-f]{4,6})$/i.exec(t);
      if (m) return parseInt(m[1], 16);
      if (/^[0-9]+$/.test(t)) return parseInt(t, 10);
      return NaN;
    };
    for (let line of String(text).split(/\r?\n/)) {
      line = line.replace(/;.*$/, '').trim();
      if (!line) continue;
      let name = null, val = NaN, m;
      if ((m = /^([A-Za-z_.@?][\w.@?$]*):?\s*(?:equ|=|defl|:=)\s*([^\s,]+)/i.exec(line))) {
        name = m[1]; val = num(m[2]);
      } else if ((m = /^(?:0x|\$)?([0-9A-Fa-f]{4,6})h?\s+([A-Za-z_.@?][\w.@?$]*):?$/.exec(line))) {
        val = parseInt(m[1], 16); name = m[2];
      } else if ((m = /^([A-Za-z_.@?][\w.@?$]*):?\s+(?:0x|\$)?([0-9A-Fa-f]{4,6})h?$/.exec(line))) {
        name = m[1]; val = parseInt(m[2], 16);
      }
      if (!name || isNaN(val) || val < 0 || val > 0xFFFF) continue;
      if (!syms.has(val) || syms.get(val).startsWith('.')) syms.set(val, name);
      byName.set(name.toUpperCase(), val);
    }
    dbgSyms = syms;
    dbgSymAddr = byName;
    return byName.size;
  }
  try { const t = localStorage.getItem('ep128web.dbgSyms'); if (t) dbgLoadSymbols(t); } catch (e) { }
  const dbgLabel = (a) => dbgSyms.get(a & 0xFFFF);

  function dbgApplyBps() {
    if (!api || !api.dbgClearBps) return;
    api.dbgClearBps();
    api.dbgWatchClear();
    for (const b of dbgBps) {
      if (!b.on) continue;
      if (b.type === 'x') api.dbgSetBp(b.addr, 1);
      else {
        const io = b.type.startsWith('io') ? 1 : 0;
        const t = io ? b.type.slice(2) : b.type;
        api.dbgWatchAdd(io, b.addr, t.includes('r') ? 1 : 0, t.includes('w') ? 1 : 0);
      }
    }
    try {
      localStorage.setItem('ep128web.dbgBps', JSON.stringify(dbgBps.map((b) => ({ type: b.type, addr: b.addr, cond: b.cond || '', on: b.on }))));
    } catch (e) { }
  }

  function dbgToggleExecBp(addr) {
    const i = dbgBps.findIndex((b) => b.type === 'x' && b.addr === addr);
    if (i >= 0) dbgBps.splice(i, 1);
    else dbgBps.push({ type: 'x', addr, cond: '', on: true, hits: 0 });
    dbgApplyBps();
    dbgRenderBps();
    dbgRenderDis();
  }

  function dbgRegs() {
    return api.dbgRegs().split(' ').map(Number);
  }

  // the registers as an object (also for conditions and scripts)
  function dbgRegObj(r) {
    r = r || dbgRegs();
    const o = { PC: r[0], AF: r[1], BC: r[2], DE: r[3], HL: r[4], IX: r[5], IY: r[6], SP: r[7],
                AF_: r[8], BC_: r[9], DE_: r[10], HL_: r[11], I: r[12], R: r[13], IM: r[14],
                IFF1: r[15], IFF2: r[16], pages: r.slice(17, 21) };
    o.A = o.AF >> 8; o.F = o.AF & 255; o.B = o.BC >> 8; o.C = o.BC & 255;
    o.D = o.DE >> 8; o.E = o.DE & 255; o.H = o.HL >> 8; o.L = o.HL & 255;
    return o;
  }

  function dbgPeek(a, src) {
    const p = api.dbgMem(a, 1, src || 0);
    return M.HEAPU8[p];
  }

  // parses a hex number, "seg:offset" (physical) or a symbol; null if invalid
  function dbgParseAddr(text) {
    const t = String(text).trim();
    let m = /^([0-9a-f]{1,2}):([0-9a-f]{1,4})$/i.exec(t);
    if (m) return { addr: parseInt(m[1], 16) * 16384 + (parseInt(m[2], 16) & 0x3FFF), phys: true };
    m = /^(?:0x|\$|&|#)?([0-9a-f]{1,7})h?$/i.exec(t);
    if (m) return { addr: parseInt(m[1], 16), phys: false };
    if (dbgSymAddr.has(t.toUpperCase())) return { addr: dbgSymAddr.get(t.toUpperCase()), phys: false };
    m = /^([A-Za-z_.@?][\w.@?$]*)\s*([+-])\s*(?:0x|\$)?([0-9a-f]+)h?$/i.exec(t);
    if (m && dbgSymAddr.has(m[1].toUpperCase())) {
      const base = dbgSymAddr.get(m[1].toUpperCase()), d = parseInt(m[3], 16);
      return { addr: (m[2] === '+' ? base + d : base - d) & 0xFFFF, phys: false };
    }
    return null;
  }

  function dbgRenderRegs() {
    const r = dbgRegs();
    const box = $('dbg-regs');
    if (!box.firstChild) {
      DBG_REGS.forEach((name, i) => {
        const l = document.createElement('label');
        const n = document.createElement('span');
        n.textContent = name;
        const inp = document.createElement('input');
        inp.dataset.reg = i;
        inp.spellcheck = false;
        inp.title = 'Hex érték, Enter: beállítás (csak megállítva)';
        inp.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter') return;
          const v = parseInt(inp.value, 16);
          if (dbgStopped && !isNaN(v)) api.dbgSetReg(i, v);
          dbgRefresh();
        });
        l.append(n, inp);
        box.append(l);
      });
    }
    const inputs = box.querySelectorAll('input');
    inputs.forEach((inp, i) => {
      const w = i < 12 ? 4 : (i < 14 ? 2 : 1);
      if (document.activeElement !== inp) inp.value = hex(r[i], w);
      inp.readOnly = !dbgStopped;
      inp.classList.toggle('chg', !!dbgPrevRegs && dbgPrevRegs[i] !== r[i]);
    });
    const f = r[1] & 0xFF;
    $('dbg-flags').innerHTML = 'SZ-H-PNC'.split('').map((ch, i) =>
      (f & (0x80 >> i)) ? '<b>' + ch + '</b>' : (ch === '-' ? '-' : ch.toLowerCase())).join('') +
      '  (' + hex(f, 2) + ')';
    $('dbg-pages').textContent = 'Lapok: ' + [0, 1, 2, 3].map((i) => dbgSegText(r[17 + i])).join(' · ');
    const sp = r[7], p = api.dbgMem(sp, 16, 0);
    let st = 'Verem:';
    for (let i = 0; i < 8; i++) {
      const w = M.HEAPU8[p + 2 * i] | (M.HEAPU8[p + 2 * i + 1] << 8);
      st += (i % 4 ? ' ' : '\n') + hex(w, 4);
    }
    $('dbg-stack').textContent = st;
    return r;
  }

  // the TVC has no EXOS: RST 30h + code is written as in its documentation
  const dbgFixText = (t) => (machine && machine.type === 1) ? t.replace(/EXOS  ([0-9A-F]{2})$/, 'RST   30: $1') : t;

  // disassembly lines from 'start': [{ addr, text }]
  function dbgDisasm(start, count) {
    return api.dbgDisasm(start & 0xFFFF, count).split('\n').filter((l) => l.trim())
      .map((text) => ({ addr: parseInt(text.trim().slice(0, 4), 16), text: dbgFixText(text.replace(/\s+$/, '')) }));
  }

  // operand addresses replaced by their symbols
  function dbgSymText(text) {
    if (!dbgSyms.size) return text;
    let first = true;
    return text.replace(/\b[0-9A-F]{4}\b/g, (h) => {
      if (first) { first = false; return h; }
      const l = dbgLabel(parseInt(h, 16));
      return l || h;
    });
  }

  // --- built-in names: segments, I/O ports, EXOS calls, system variables ---
  const EXOS_FN = {
    0: 'Rendszer-visszaállítás', 1: 'Csatorna megnyitása', 2: 'Csatorna létrehozása',
    3: 'Csatorna lezárása', 4: 'Csatorna megszüntetése', 5: 'Karakter olvasása',
    6: 'Blokk olvasása', 7: 'Karakter írása', 8: 'Blokk írása',
    9: 'Csatornaállapot olvasása', 10: 'Csatornaállapot beállítása', 11: 'Speciális funkció',
    16: 'EXOS változó', 17: 'Elfogás (capture)', 18: 'Átirányítás',
    19: 'Alapértelmezett eszköz', 20: 'Rendszerállapot', 21: 'Eszköz beláncolása',
    22: 'EXOS határ olvasása', 23: 'Felhasználói határ beállítása', 24: 'Szegmens foglalása',
    25: 'Szegmens felszabadítása', 26: 'Rendszerbővítők keresése', 27: 'Csatornapuffer foglalása',
    28: 'Hibakód magyarázata', 29: 'Modul betöltése', 30: 'Áthelyezhető modul betöltése',
    31: 'Idő beállítása', 32: 'Idő olvasása', 33: 'Dátum beállítása', 34: 'Dátum olvasása'
  };
  // EXOS system segment (FF) variables, at their page 2 addresses
  const EP_SYSVARS = { 0xBFF4: 'LP_POINTER (LPT címe)', 0xBFF6: 'ST_POINTER (állapotsor)',
                       0xBFFC: 'USR_P0', 0xBFFD: 'USR_P1', 0xBFFE: 'USR_P2', 0xBFFF: 'USR_P3' };
  // TVC system calls (RST 30h + code), from "TV-Computer Operációs rendszer"
  // (tvcdoc): bit 7 = input, bits 6..4 = class, bits 3..0 = function
  const TVC_FN = {
    0x01: 'VID_CHOUT karakter kiírás', 0x02: 'VID_BKOUT szövegblokk kiírás',
    0x03: 'BTEXT sugár a karakterpozícióba', 0x04: 'VMODE grafikus mód', 0x05: 'CLS képernyőtörlés',
    0x06: 'BABS sugár abszolút', 0x07: 'BREL sugár relatív', 0x08: 'BON sugár be',
    0x09: 'BOFF sugár ki', 0x0A: 'FILL kitöltés', 0x0B: 'DEFC karakterdefiníció',
    0x0C: 'PAL paletta', 0x91: 'KBD_CHIN billentyű olvasás', 0x93: 'KBD_STATUS billentyűzet állapot',
    0x20: 'ED_INT', 0xA0: 'ED_INT', 0xA1: 'ED_CHIN karakter beolvasás', 0x21: 'ED_CHOUT karakter kiírás',
    0xA2: 'ED_BKIN szövegblokk beolvasás', 0x22: 'ED_BKOUT szövegblokk kiírás',
    0x23: 'CPOS kurzor pozíció', 0xA3: 'CPOS kurzor pozíció', 0x24: 'CFIX kurzor megjegyzés',
    0xA4: 'CFIX kurzor megjegyzés', 0x33: 'TONE_SET hang',
    0x41: 'PAR_CHOUT nyomtató karakter', 0x42: 'PAR_BKOUT nyomtató blokk',
    0xD1: 'CAS_CHIN kazetta karakter be', 0x51: 'CAS_CHOUT kazetta karakter ki',
    0xD2: 'CAS_BKIN kazetta blokk be', 0x52: 'CAS_BKOUT kazetta blokk ki',
    0xD3: 'CAS_OPEN file megnyitás', 0x53: 'CAS_CRTE file létrehozás',
    0xD4: 'CAS_CLOSE olvasott file lezárás', 0x54: 'CAS_CLOSE írt file lezárás',
    0xD5: 'CAS_VERIFY összehasonlítás',
    0x61: 'SER_CHOUT soros karakter ki', 0xE1: 'SER_CHIN soros karakter be',
    0x62: 'SER_BKOUT soros blokk ki', 0xE2: 'SER_BKIN soros blokk be',
    0x63: 'RS232_SET', 0xE3: 'RS232_SET', 0x64: 'RS232_CLOSE', 0xE4: 'RS232_CLOSE',
    0x71: 'HI_MEM_SET memóriafoglalás', 0xF1: 'HI_MEM_SET memóriafoglalás',
    0x72: 'EXP_DIRECT kártya kijelölés', 0xF2: 'EXP_DIRECT kártya kijelölés',
    0x73: 'I/O_DIRECT I/O hozzárendelés', 0xF3: 'I/O_DIRECT I/O hozzárendelés',
    0x74: 'SLOT_NUM kártya pozíció', 0xF4: 'SLOT_NUM kártya pozíció',
    // floppy (VT-DOS), from the TVCinf table
    0xD6: 'floppy: fájlmutató a fájl elejéhez képest', 0xD7: 'floppy: fájlmutató az aktuálishoz képest',
    0xD8: 'floppy: fájlmutató a fájl végéhez képest', 0xD9: 'floppy: CLI puffer megadása',
    0xDA: 'floppy: CLI parancs végrehajtása', 0xDB: 'floppy: FISH funkció'
  };
  const TVC_CLASS = ['video', 'billentyűzet', 'editor', 'hang', 'nyomtató', 'kazetta', 'csatolókártya', 'kernel'];
  function dbgTvcFnName(c) {
    if (TVC_FN[c]) return TVC_FN[c];
    const f = c & 15;
    return TVC_CLASS[c >> 4 & 7] + ' osztály ' + (c & 0x80 ? 'input ' : 'output ') +
           (f === 0 ? 'IT' : f === 1 ? 'karakter' : f === 2 ? 'blokk' : f + '. funkció');
  }
  // what the registers mean at a TVC call
  function dbgTvcFnArgs(c, o) {
    const ch = (v) => hex(v, 2) + (v >= 32 && v < 127 ? " '" + String.fromCharCode(v) + "'" : '');
    const f = c & 15;
    if (c === 0x33) return 'B=' + o.B + ' (×20 ms), C=' + o.C + ', DE=' + hex(o.DE, 4);
    if (c === 0x03 || c === 0x23 || c === 0xA3) return 'oszlop ' + o.B + ', sor ' + o.C;
    if (c === 0x04) return 'C=' + o.C + ' (GRAPHICS ' + ([2, 4, 16][o.C] || '?') + ')';
    if (c === 0x06 || c === 0x07) return 'X=' + hex(o.BC, 4) + ', Y=' + hex(o.DE, 4);
    if (c === 0x0B) return 'C=' + ch(o.C) + ', DE=' + hex(o.DE, 4);
    if (c === 0x0C) return 'DE=' + hex(o.DE, 4);
    if (c === 0xD3 || c === 0x53) return 'név: ' + dbgExosName(o.DE);
    if (c >= 0xD6 && c <= 0xD8) return 'BCDE=' + hex(o.BC, 4) + hex(o.DE, 4);
    if (c === 0xDA) return 'parancs: ' + dbgExosName(o.DE);
    if ((c & 0x70) === 0x70) return 'DE=' + hex(o.DE, 4) + ', BC=' + hex(o.BC, 4);
    if (f === 1 && !(c & 0x80)) return 'C=' + ch(o.C);
    if (f === 2) return 'DE=' + hex(o.DE, 4) + ', BC=' + hex(o.BC, 4) + ' bájt';
    return '';
  }
  // error codes returned in A (TVC)
  const TVC_ERR = {
    0xFF: 'nem létező funkció', 0xFE: 'I/O hozzárendelési hiba', 0xFD: 'nem létező kártya',
    0xFC: 'hibás blokk I/O paraméter (LAP3)', 0xFB: 'nincs elég memória',
    0xFA: 'hibás blokk I/O paraméter (HI_MEM)', 0xF9: 'nem létező sugárpozíció',
    0xF8: 'nem definiálható karakter', 0xF7: 'nem létező grafikus mód',
    0xF6: 'nem létező kurzorpozíció', 0xF5: 'STOP (CTRL+ESC)', 0xF4: 'paritáshiba',
    0xF3: 'kerethiba', 0xF2: 'túlfutás', 0xEC: 'file vége', 0xEB: 'a file már nyitva van',
    0xEA: 'CRC hiba', 0xE9: 'nincs nyitott file', 0xE8: 'ellenőrzési hiba',
    0xE7: 'belső hiba', 0xE6: 'védelem megsértése', 0xE5: 'rossz blokksorszám'
  };
  // TVC system variables and work areas in U0: [address, length, name, description]
  // ("TV-Computer Operációs rendszer" and the TVCinf table by KKS)
  const TVC_VARS = [
    [0x0000, 3, '', 'nem használt (3 byte)'],
    [0x0003, 1, 'P_SAVE', 'memórialapozás [765432]'],
    [0x0008, 1, 'RST 08', 'hibagenerálás;hibakód=(SP) (POP HL;LD A,(HL);OR A;PUSH HL)'],
    [0x0010, 1, 'RST 10', 'hibagenerálás, ha Z=0;hibakód=A (RET Z;JP FD5C)'],
    [0x0015, 1, '', 'aritmetikai rutin hívása, címállítás a ROM-ból'],
    [0x0018, 1, 'RST 18', 'aritmetikai rutinok kezelése (JP FB82)'],
    [0x001B, 1, '', 'az OS rutinjainak (RST 30) hívása;kód=A (LD (001F),A;RST 30;DEFB n)'],
    [0x0020, 1, 'RST 20', 'nem használt (RET)'],
    [0x0021, 14, 'USRTAB', 'EXT rutinok címeit tartalmazó táblázat (7*2 byte)'],
    [0x002C, 1, '', 'SOUND használja VOLUME értékének tárolására'],
    [0x002D, 1, '', 'SOUND használja DURATOIN értékének tárolására'],
    [0x0030, 8, 'OS_ENTRY', 'az OS rutinjainak hívása;rutinkód=(SP)(JP 0B23)'],
    [0x0038, 8, 'IT_ENTRY', 'megszakításkezelés (IRQ) (PUSH AF;LD A,70;OUT (02),A;JP C412)'],
    [0x0040, 192, '', 'A csatolókártyák azonosítói (192 byte; 40-6F, 70-9F, A0-CF, D0-FF)'],
    [0x0100, 1600, '', 'a képernyő ASCII-kód tárolója (24*64 byte=1600)'],
    [0x0700, 64, '', '32k és 64k gépeken nem használt (64 byte) ; (64k+ gépeken BASIC és I/O rutinok használhatják)'],
    [0x0740, 960, '', 'az átdefiniálható karakterek tárolója (96*10 byte=960)'],
    [0x0B00, 8, 'IN_TABLE', 'OS hozzárendelési táblázat'],
    [0x0B08, 8, 'OUT_TABLE', 'OS hozzárendelési táblázat'],
    [0x0B10, 1, 'INT_DES', 'mutató a megszakítás számára [3210];amelyik bit 0,azt a megszakítást végrehajtja: 0.bit-képernyő,1.bit-billentyűzet,2.bit-editor,3.bit-hanggenerátor'],
    [0x0B11, 1, 'PORT03', 'bővítő kártya kiválasztás [76],billentyűzetmátrix kiválasztás [3210]'],
    [0x0B12, 1, 'PORT05', 'hangmagasság felső byte [3210]'],
    [0x0B13, 1, 'PORT06', 'hangerő [5432],video felbontás [10]'],
    [0x0B14, 1, 'SND_ACTIVE', 'FF=van futó hang'],
    [0x0B15, 1, 'SND_IRQ', 'FF=van hangkitartás SOUND-nál'],
    [0x0B16, 1, 'STOP_FLAG', 'CTRL-ESC mutató'],
    [0x0B17, 2, 'ST_LIMIT', 'az SP legkisebb értéke,alapállapotban 0F10 (2 byte)'],
    [0x0B19, 2, 'HI_MEM', 'a BASIC számára elérhető legmagasabb memória-cím 2 byte'],
    [0x0B1B, 1, 'P3RAM', 'a 3.RAM állapotát mutatja (00=jó,FF=rossz)'],
    [0x0B1C, 1, 'EX_DEF', 'Bővítőkártya alaphozzárendelés'],
    [0x0B1D, 2, 'INTINC', 'számláló,értéke 20 ms-omként eggyel nő'],
    [0x0B1F, 1, 'IRQ_STAT', 'IRQ-STAT, az IT források engedélyezése'],
    [0x0B20, 1, 'INT_FLAG', 'FF=megszakítás-végrehajtás'],
    [0x0B21, 1, 'WARM_FLAG', '00=WARM RESET,FF=COLD RESET'],
    [0x0B22, 1, 'COLD_FLAG', 'ugyanaz mint 0B21'],
    [0x0B23, 30, 'INFUNC', 'RST 30 kezelés 30 byte'],
    [0x0B37, 10, 'OUTFUNC', 'funkcióhívás befejező rész'],
    [0x0B41, 8, 'INT_EXIT', 'RST 38 (megszakítás) visszatérés 8 byte'],
    [0x0B49, 2, 'STACKT', 'SP ideiglenes'],
    [0x0B4B, 1, 'L_MODE', 'grafikus pont felülírási módja'],
    [0x0B4C, 1, 'L_STYLE', 'vonaltípus'],
    [0x0B4D, 1, 'INK', 'tintaszín'],
    [0x0B4E, 1, 'PAPER', 'papírszín'],
    [0x0B4F, 1, 'BORDER', 'keretszín;értéke a palettaszín kétszerese'],
    [0x0B50, 1, 'V_FLAG', 'karakterfelülírási flag'],
    [0x0B51, 10, 'PICTURE', 'a billentyűzetmátrix utoljára leolvasott értéke (10 byte)'],
    [0x0B5B, 10, 'OLDPICT', 'a billentyűzetmátrix előzőleg leolvasott értéke (10 byte)'],
    [0x0B65, 1, 'DELAY_KEY', 'auto-repeat késleltetés (*20ms)'],
    [0x0B66, 1, 'LOCK_KEY', 'a kurzor állapotát mutatja;01=CAPS LOCK,02=SHIFT LOCK,08=ALT LOCK'],
    [0x0B67, 1, 'RATE_KEY', 'auto-repeat késleltetés (*20ms)'],
    [0x0B68, 1, 'HOLD_DIS', 'mutatja CTRL-P-vel felfüggeszthető-e a rendszer müködése (FF=nem,00=igen)'],
    [0x0B69, 2, 'BAUD', 'BAUD, a soros vonal sebessége 2 byte'],
    [0x0B6A, 1, 'FORMAT', 'USART mód'],
    [0x0B6B, 1, 'BUFFER', 'mutató kimentéshez;FF=bufferelt,00=nem bufferelt'],
    [0x0B6C, 1, 'REMRED', 'konstans (80h)'],
    [0x0B6D, 1, 'PROTECT', 'a kazetta-OUT nullázza'],
    [0x0B6E, 1, 'EOF', 'filevég mutató;00=nincs file vége,FF=file vége'],
    [0x0B6F, 3, 'MUDDLE', 'MUDDLE, CRC kezdőérték 3 byte'],
    [0x0B71, 1, 'SER_OK', 'soros órajel jó'],
    [0x0B72, 1, '', 'nem használt'],
    [0x0B73, 1, '', 'a grafikus felbontást mutatja (0,1 vagy 2)'],
    [0x0B74, 1, '', 'sugár-mutató;FF=vonalhúzás,00=pontrajzolás'],
    [0x0B75, 1, '', 'a koordináták és a felbontás alapján képzett érték'],
    [0x0B76, 2, '', 'a koordináták alapján számolt képernyőcím 2 byte'],
    [0x0B78, 2, '', 'valós x koordináta;(0;0) a bal felső sarok (2 byte)'],
    [0x0B7A, 2, '', 'valós y koordináta;(0;0) a bal felső sarok (2 byte)'],
    [0x0B7C, 2, '', 'logikai x koordináta;(0;0) a bal alsó sarok(2 byte)'],
    [0x0B7E, 2, '', 'logikai y koordináta;(0;0) a bal alsó sarok(2 byte)'],
    [0x0B80, 2, '', 'nem használt (2 byte)'],
    [0x0B82, 1, '', '???'],
    [0x0B83, 1, '', 'a STYLE alapján képzett érték'],
    [0x0B84, 2, '', 'vonalhúzásnál az x-et változtató rutin címe(2 byte)'],
    [0x0B86, 2, '', 'vonalhúzásnál az y-t változtató rutin címe (2 byte)'],
    [0x0B88, 2, '', 'PAINT használja SP értékének tárolására (2 byte)'],
    [0x0B8A, 1, '', 'PAINT használja;a pillanatnyi képernyőbyte értéke'],
    [0x0B8B, 8, '', 'terület a PAINT változóinak (8 byte)'],
    [0x0B93, 1, '', 'a papírszín és a felbontás alapján képzett érték'],
    [0x0B94, 1, '', 'a tintaszín és a felbontás alapján képzett érték'],
    [0x0B95, 80, '', 'nem használt 80 byte'],
    [0x0BE5, 1, '', 'KEYBOARD STATUS - 00=nincs beolvasható karakter, FF=van beolvasható karakter'],
    [0x0BE6, 1, '', 'ha értéke FF,billentyü lenyomásig felfüggeszti a KEYBOARD IRQ és a rendszer működését'],
    [0x0BE7, 1, '', 'FF=kurzorváltás tiltás (a KEYBOARD IRQ nullázza)'],
    [0x0BE8, 1, '', 'segédbillentyű-flag:00=nincs, 02=CTRL, 04=SHIFT, 08=ALT'],
    [0x0BE9, 1, '', 'az utoljára lenyomott billentyű ASCII kódja'],
    [0x0BEA, 1, '', 'a KEYBOARD IRQ tárolja DELAY értékét'],
    [0x0BEB, 1, '', 'a KEYBOARD IRQ tárolja RATE értékét'],
    [0x0BEC, 2, '', 'a billentyűzetmátrix melyik byte-ja tartalmazza a lenyomott billentyűt (2 byte)'],
    [0x0BEE, 1, '', 'a 0BEC által mutatott byte melyik bitje 1'],
    [0x0BEF, 1, '', 'hanghossz a SOUND IRQ-hoz'],
    [0x0BF0, 1, '', 'LOAD-SAVE közben a képernyő színkódja'],
    [0x0BF1, 1, '', 'VERIFY funkció jelzése'],
    [0x0BF2, 1, '', 'PEEK(38h) tárolása,mert a magnókezelés tiltja a megszakítás-kezelést'],
    [0x0BF3, 1, '', 'FF=LOAD tiltás:System error 230.'],
    [0x0BF4, 17, '', 'filenév (keresett) - LOAD-hoz (17 byte)'],
    [0x0C05, 2, '', 'a beolvasott fejléc;formátum:névhossz+név+00+típus-byte+hossz(2 byte)+auto-run-mutató (256 byte)'],
    [0x0D05, 2, '', 'A szalagról beolvasott byte-ok száma 2 byte'],
    [0x0D07, 2, '', 'a fejléc következő eleme (LOAD) (2 byte)'],
    [0x0D09, 2, '', 'pillanatnyi filehossz 2 byte'],
    [0x0D0B, 1, '', 'hibakód'],
    [0x0D0C, 1, '', 'FF=SAVE tiltás:System error 230.'],
    [0x0D0D, 256, '', 'a betöltött 256 byte-os blokkok száma'],
    [0x0D0E, 1, '', 'EOF - lásd 0B6E'],
    [0x0D0F, 1, '', 'Tömbtípus'],
    [0x0D10, 2, '', 'a következő bemenő adat címe (2 byte)'],
    [0x0D12, 1, '', 'nem használt'],
    [0x0D13, 1, '', 'File megnyitása olvasásra'],
    [0x0D14, 1, '', 'ha FF,- SAVE esetén CTRL-ESC-re System error 235.nincs LOAD végrehajtás és 0E2A is FF,SAVE esetén System error 235.'],
    [0x0D15, 17, '', 'filenév - SAVE-hez (17 byte)'],
    [0x0D26, 2, '', 'a kimenő fejléc;formátum:névhossz+név+00+típusbyte+hossz(2 byte)+auto-run-mutató (256 byte)'],
    [0x0E26, 2, '', 'pillanatnyi filehossz (2 byte)'],
    [0x0E28, 2, '', 'a fejléc következő eleme (SAVE) (2 byte)'],
    [0x0E2A, 1, '', 'lásd 0D14'],
    [0x0E2B, 1, '', 'SAVE FF-re állítja'],
    [0x0E2C, 2, '', 'a kimenő byte címe (2 byte)'],
    [0x0E2E, 1, '', 'A tárolandó byte'],
    [0x0E2F, 1, '', 'A tárolandó file típusa'],
    [0x0E30, 1, '', 'lásd 0B6D'],
    [0x0E31, 256, '', 'a kimentett 256 byte-os blokkok száma'],
    [0x0E33, 2, '', 'az SP értékét tárolja (2 byte)'],
    [0x0E35, 19, '', 'nem használt 19 byte'],
    [0x0E48, 1, '', 'számláló a kurzor villogtatásához'],
    [0x0E49, 1, '', 'kurzorpozíció:sor (y koordináta)'],
    [0x0E4A, 1, '', 'kurzorpozíció:oszlop (x koordináta)'],
    [0x0E4B, 2, '', 'a kurzor címe az ASCII tárolóban(0100-06FF)(2 byte)'],
    [0x0E4D, 1, '', 'RETURN tiltás [7]'],
    [0x0E4E, 2, '', 'kurzorpozíció tárolás az EDITOR IRQ-nak (2 byte)'],
    [0x0E50, 24, '', 'sorhossz mutató;ha a logikai sor átnyúlik a következő sorba,a 7.bit 1 (24 byte)'],
    [0x0E68, 1, '', 'egy karakter kiírása;GRAPHICS 2 - JP D3AD,GRAPHICS 4 - JP D3BC,GRAPHICS16 - JP D3D9'],
    [0x0E6B, 1, '', 'a képernyő oszlopszáma (64,32 vagy 16)'],
    [0x0E6C, 1, '', 'egy karakter vízszintes byte-jainak száma (1,2,4)'],
    [0x0E6D, 40, '', 'az EDITOR IRQ használja a kurzor alatt lévő karakter tárolására (40 byte)'],
    [0x0E95, 1, '', 'a tintaszín és a felbontás alapján képzett érték'],
    [0x0E96, 1, '', 'a papírszín és a felbontás alapján képzett érték'],
    [0x0E97, 93, '', '32k és 64k gépeken: nem használt (93 byte)'],
    [0x0E98, 20, 'PROGID', "v1.3, PROGID; Programazonosító 20 byte az 1.3 verziótól kezdve. A BASIC a következőt írja bele: \"TV COMPUTER BASIC\". A szöveget 00h kóddal kell zárni. Korábban az editor számára volt fenntartva, de nem volt kihasználva."],
    [0x0EAC, 2, '', '64k+, belső használatra (2 byte)'],
    [0x0EB2, 1, '', '64k+, BLINK; A billentyűzet input alatti kurzorvillogást vezérli. Ha értéke nulla, akkor nincs kurzorvillogás, egyéb értékek esetén villog a kurzor. Az editor input mindig törli.'],
    [0x0EB3, 1, '', '64k+, RESTART; Alkalmazói programok reset választásához. Ha nem nulla, akkor a szokásos meleg reset történik, ha nulla, akkor az operációs rendszer meleg resetje után az alkalmazói program hideg resetje hajtódik végre.'],
    [0x0EB4, 1, '', '64k+, MOPS_WARM; Jelzi az alkalmazói programoknak, hogy az operációs rendszer milyen resetet hajtott végre. Akkor van szerepe, ha az alkalmazói program hideg resetet kap.'],
    [0x0EB5, 1, '', '64k+, CENBLE; Programmodul engedélyező. Nulla értékkel engedélyezi, egyéb értékkel letiltja a programmodul indítását a BASIC helyett.'],
    [0x0EB6, 1, '', '64k+, BASFLG; A BASIC indítást vezérli. bit 0 : átlépi a V-alakban kiírt \'VIDEOTON\' képernyő kiírását\nbit 1 : átlépi a \'COPYRIGHT\' üzenet kiírását\nbit 2 : nem hajt végre kezdéskor \'NEW\' utasítást\nbit 3 : automatikusan végrehajt egy \'RUN\' utasítást'],
    [0x0EB7, 1, '', '64k+, VERSION; Változatszám. A felső 4 bit a fő-, az alsó 4 bit pedig az alváltozatszámot adja. Pl. a 2.0 változatnál értéke 20h. A korábbi változatoknál az értéke 00h.'],
    [0x0EF4, 1, '', 'PAINT esetén az SP legkisebb értéke'],
    [0x0F10, 1, '', 'az SP előre definiált legkisebb értéke (lásd 0B17)'],
    [0x16AC, 1, '', 'az SP előre definiált legnagyobb értéke'],
    [0x16AD, 83, '', 'nem használt (83 byte)'],
    [0x1700, 1, '', 'BASIC üzemmód-mutató 0.bit:1=TRACE ON,0=TRACE OFF, 1.bit:1=\'ok\' kiírás tiltás, 2.bit:1=program,0=parancs, 3.bit:1=OPEN volt,0=nem volt'],
    [0x1701, 1, '', 'változókezelés-mutató 0.bit 1=tömbváltozó,0=nem, 1.bit 1=numerikus,0=string, 7.bit 1=új változó,0=nem új'],
    [0x1702, 1, '', 'FF=ON GOTO-GOSUB-nál van ELSE ág'],
    [0x1703, 1, 'NEW', 'FF=parancs üzemmódban automatikus NEW'],
    [0x1704, 1, '', 'RST 18 használja A tárolására'],
    [0x1705, 1, '', 'OUTPUT mutató;alapállapotban 20h (=EDITOR)'],
    [0x1706, 1, '', 'TRACE esetén OUTPUT mutató'],
    [0x1707, 1, 'AUTO', 'AUTO-RUN mutató'],
    [0x1708, 1, 'TYPE', 'a szimbólumtábla aktuális elemének típusa'],
    [0x1709, 3, '', 'RND mag (3 byte)'],
    [0x170C, 2, 'START', 'az aktuális BASIC sor címe(2 byte)'],
    [0x170E, 2, '', 'STOP tárolja 170C értékét CONTINUE számára (2 byte)'],
    [0x1710, 2, '', 'mutató a program következő elemére (=HL\')(2 byte)'],
    [0x1712, 2, '', 'az aktuális DATA sor címe a programban (2 byte)'],
    [0x1714, 2, '', 'a következő adat címe a programban(2 byte)'],
    [0x1716, 2, '', 'az utolsó byte címe a pufferben -INPUT-hoz (2 byte)'],
    [0x1718, 2, '', 'RST 18 tárolja a visszatérési címet (2 byte)'],
    [0x171A, 2, '', 'a BASIC munkaterület utolsó byte-ja (=IY)(2 byte)'],
    [0x171C, 2, '', 'a munkaterület következő szabad byte-ja (2 byte)'],
    [0x171E, 2, '', 'RST 18 használja HL tárolására(2 byte)'],
    [0x1720, 2, 'VLOMEM', 'a BASIC terület kezdete(2 byte)'],
    [0x1722, 2, 'TEXT', 'a BASIC program kezdőcíme(2 byte)'],
    [0x1724, 2, 'CHAIN', 'a szimbólumtábla utolsó elemének címe(2 byte)'],
    [0x1726, 2, 'TOP', 'a szimbólumtábla következő szabad byte-jának címe (2 byte)'],
    [0x1728, 2, '', 'a program következő elemére mutat(kifejezés értékének kiszámítása közben)(2 byte)'],
    [0x172A, 1, '', 'SOUND használja a hangmagasság értékének tárolására'],
    [0x172C, 2, '', 'nem használt (2 byte)'],
    [0x172E, 2, '', 'a PRINT USING pillanatnyi byte-jának címe (2 byte)'],
    [0x1730, 2, '', 'a PRINT USING utolsó byte-jának címe (2 byte)'],
    [0x1732, 255, 'COMMAND', 'az aktuális BASIC utasítássort tartalmazó, puffer;formátum:00+hossz+sor(tokenizált)+FF'],
    [0x1831, 255, 'BUFFER', 'input puffer a klaviatúra számára; formátum:hossz+sor(karakteres)+FF'],
    [0x1930, 1, '', 'PRINT puffer a számok karakterré alakításához'],
    [0x193F, 2, '', '??? (2 byte)'],
    [0x1941, 1, '', 'a SET utasítás paramétereinek tárolója'],
    [0x19C0, 7, 'X', 'X aritmetikai regiszter (BCD számábrázolás)'],
    [0x19C7, 7, 'Y', 'Y aritmetikai regiszter (BCD számábrázolás)'],
    [0x19CE, 17, 'FILENAME', 'LOAD esetén,ha nincs filenév,innen veszi'],
    [0x19DF, 2, '', 'fejléc a BASIC LOAD-SAVE-nél;formátum:00+típusbyte+hossz(2 byte)+auto-run-mutató'],
    [0x19EF, 1, '', 'a BASIC program előre definiált kezdete']
  ];
  const TVC_VAR_AT = new Map();
  for (const v of TVC_VARS) {
    for (let i = 0; i < v[1]; i++) TVC_VAR_AT.set(v[0] + i, { v, i });
  }
  // the name of a TVC variable byte; 'full': the whole description
  function dbgTvcVarText(a, full) {
    const { v: [base, , name, desc], i } = TVC_VAR_AT.get(a);
    let d = desc;
    if (!full && d.length > 44) d = d.slice(0, 42).replace(/[\s;,(]+\S*$/, '') + '…';
    const off = i ? '+' + i + (full ? ' (' + hex(base, 4) + '-tól)' : '') : '';
    return (name ? name + off + ' – ' : (off ? off + ' ' : '')) + d;
  }
  const TVC_SEGS = { 0x00: 'SYS', 0x01: 'CART', 0x02: 'EXT', 0x07: 'SDEXT',
                     0xF8: 'U0', 0xF9: 'U1', 0xFA: 'U2', 0xFB: 'U3',
                     0xFC: 'VID0', 0xFD: 'VID1', 0xFE: 'VID2', 0xFF: 'VID3' };

  // short name of a segment of the current machine ('' if unknown)
  function dbgSegName(seg) {
    if (!machine) return '';
    if (machine.type === 1) return TVC_SEGS[seg] || '';
    if (seg === 0xFF) return 'SYS';
    if (seg >= 0xFC) return 'VID';
    for (const [file, segs] of machine.roms) {
      const i = segs.indexOf(seg);
      if (i < 0) continue;
      let n = (/^[a-z]+/.exec(file) || [''])[0].toUpperCase();
      if (n === 'EPFILEIO') n = 'FILEIO';
      return n + (segs.length > 1 ? i : '');
    }
    return seg >= 0x100 - (machine.ram || 128) / 16 ? 'RAM' : '';
  }
  const dbgSegText = (seg) => hex(seg, 2) + (dbgSegName(seg) ? ' ' + dbgSegName(seg) : '');

  function dbgTvcSlotName(n) {
    const c = TVC_CARDS.find((c) => c.id === tvcSlots[n]);
    return 'bővítő ' + n + (c && c.id !== SLOT_EMPTY ? ' (' + c.name.replace(/ \(.*$/, '') + ')' : '');
  }

  // name of an I/O port of the current machine ('' if unknown)
  function dbgPortName(port, isWrite) {
    port &= 0xFF;
    if (port === 0xF8 || port === 0xF9) return '2dfx ' + (port & 1 ? 'adat' : 'parancs/állapot');
    if (machine && machine.type === 1) {
      const p = port & 0x7F;
      if (p >= 0x10 && p < 0x50) return dbgTvcSlotName((p >> 4) - 1);
      if (p >= 0x50 && p < 0x58) return isWrite === false ? '' : 'magnó kimenet váltás';
      if (p >= 0x58 && p < 0x60) {
        if (isWrite) return 'bővítő ' + (p & 3) + ' IRQ törlés';
        return ['billentyűzet oszlopok', 'IRQ állapot', 'bővítőkártya azonosító', 'hanggenerátor törlés'][p & 3] +
               (isWrite === undefined ? ' / bővítő ' + (p & 3) + ' IRQ' : '');
      }
      if (p >= 0x60 && p < 0x70) return 'paletta ' + (p & 3);
      if (p >= 0x70) return 'CRTC ' + (p & 1 ? 'adat' : 'regiszter cím');
      return ['keret szín', 'nyomtató adat', 'lapozás (P0–P3)', 'IOMEM lap / billentyűsor',
              'hangfrekvencia alsó', 'hangfrekvencia felső / magnó motor', 'videó mód / hangerő',
              'hang / kurzor IRQ törlés', '', '', '', '', 'VID lapozás', 'VID lapozás', 'VID lapozás',
              'VID lapozás'][p] || '';
    }
    if (port >= 0x80 && port < 0x90) return 'NICK ' + ['FIXBIAS', 'BORDER', 'LPT cím alsó', 'LPT cím felső / vezérlés'][port & 3];
    if (port >= 0xA0 && port <= 0xA5) return 'DAVE ' + (port >> 1 & 3) + '. csatorna ' + (port & 1 ? 'felső' : 'alsó');
    if (port >= 0xA8 && port <= 0xAF) return 'DAVE ' + (port < 0xAC ? 'bal' : 'jobb') + ' hangerő ' + ['0', '1', '2', 'zaj'][port & 3];
    if (port >= 0xB0 && port <= 0xB3) return 'lapregiszter P' + (port & 3);
    if (port >= 0x10 && port <= 0x13) return 'EXDOS WD1770 ' + ['parancs/állapot', 'sáv', 'szektor', 'adat'][port & 3];
    if (port >= 0x40 && port <= 0x44) return 'Spectrum emulátor';
    if (port >= 0xF0 && port <= 0xF3) return 'DAC';
    if (port >= 0xEC && port <= 0xEF) return 'IDE';
    return ({ 0xA6: 'DAVE zaj', 0xA7: 'DAVE vezérlés', 0xB4: 'megszakítás vezérlés/állapot',
              0xB5: isWrite === false ? 'billentyűzet oszlopok' : 'billentyűsor / nyomtató',
              0xB6: isWrite === false ? 'joystick / nyomtató' : 'nyomtató adat',
              0xB7: 'soros / magnó', 0xBF: 'rendszer konfiguráció', 0x18: 'EXDOS vezérlés',
              0x7E: 'CMOS óra cím', 0x7F: 'CMOS óra adat', 0x0E: 'SID', 0x0F: 'SID',
              0xF6: 'MIDI', 0xF7: 'MIDI' })[port] || '';
  }

  // TVC colour: bits 0 B, 2 R, 4 G, 6 I (palette); the border uses bits 1, 3, 5, 7
  function dbgTvcColour(v) {
    const n = ['fekete', 'kék', 'piros', 'bíbor', 'zöld', 'cián', 'sárga', 'fehér'][(v & 1) | (v >> 1 & 2) | (v >> 2 & 4)];
    if (n === 'fekete' && (v & 0x40)) return 'szürke';
    return (v & 0x40 ? 'világos ' : (v & 0x15 ? 'sötét ' : '')) + n;
  }
  const CRTC_REGS = ['vízszintes teljes', 'vízszintes látható', 'HSYNC pozíció', 'szinkron szélességek',
                     'függőleges teljes', 'függőleges finom', 'függőleges látható', 'VSYNC pozíció',
                     'interlace', 'max. raszter cím', 'kurzor kezdet', 'kurzor vég', 'kezdőcím felső',
                     'kezdőcím alsó', 'kurzor cím felső', 'kurzor cím alsó', 'fénytoll felső', 'fénytoll alsó'];

  // what writing 'v' to 'port' does (paging, video mode, colours decoded)
  function dbgPortWriteNote(port, v) {
    port &= 0xFF;
    if (machine && machine.type === 1) {
      const p = port & 0x7F;
      if (p >= 0x60 && p < 0x70) return dbgTvcColour(v);
      if (p >= 0x70 && !(p & 1)) return 'R' + (v & 31) + (CRTC_REGS[v & 31] ? ' ' + CRTC_REGS[v & 31] : '');
      switch (p) {
        case 0x00: return dbgTvcColour(v >> 1);
        case 0x05: return 'frekvencia felső ' + (v & 15) + ', hang ' + (v & 0x10 ? 'be' : 'ki') + ', hang IT ' + (v & 0x20 ? 'be' : 'ki') +
                          ', motor ' + (v & 0xC0 ? 'be' : 'ki');
        case 0x02: {
          const p0 = ['SYS', 'CART', 'U0', 'U3'][v >> 3 & 3];
          const p1 = v & 0x04 ? 'VID' : 'U1';
          const p2 = v & 0x20 ? 'U2' : 'VID';
          const p3 = ['CART', 'SYS', 'U3', 'EXT'][v >> 6];
          return 'P0=' + p0 + ' P1=' + p1 + ' P2=' + p2 + ' P3=' + p3;
        }
        case 0x03: return 'IOMEM: bővítő ' + (v >> 6) + ', billentyűsor ' + (v & 15);
        case 0x06: return 'GRAPHICS ' + [2, 4, 16, 16][v & 3] + ', hangerő ' + (v >> 2 & 15);
        case 0x0C: case 0x0D: case 0x0E: case 0x0F:
          return 'VID lap: P1→VID' + (v & 3) + ' P2→VID' + (v >> 2 & 3) + ', kijelzés VID' + (v >> 4 & 3);
      }
      return '';
    }
    if (port >= 0xB0 && port <= 0xB3) return dbgSegName(v);
    if ((port & 0xF3) === 0x81) return 'szín ' + epColour(v);
    if (port === 0xB5) return 'billentyűsor ' + (v & 15);
    return '';
  }

  // name of a known address with the current paging (CPU address)
  function dbgAddrNote(a, pages, full) {
    a &= 0xFFFF;
    const seg = pages[a >> 14];
    const sv = EP_SYSVARS[(a & 0x3FFF) | 0x8000];
    if (machine && machine.type === 0 && seg === 0xFF && sv) return sv;
    if (machine && machine.type === 1 && seg === 0xF8 && TVC_VAR_AT.has(a)) return dbgTvcVarText(a, full);
    let n = 'P' + (a >> 14) + ' ' + dbgSegText(seg);
    if (machine && machine.type === 1 && seg === 0x02 && a < 0xE000) n = 'P3 IOMEM';
    return n;
  }

  // a length prefixed string (EXOS device / file name) at 'a'
  function dbgExosName(a) {
    const p = api.dbgMem(a, 64, 0);
    const n = Math.min(M.HEAPU8[p], 63);
    let s = '';
    for (let i = 1; i <= n; i++) s += String.fromCharCode(M.HEAPU8[p + i]);
    return JSON.stringify(s);
  }

  // comment for a disassembly line; 'r': the registers, used for the
  // values at the PC when 'atPC' is set (the paging is the current one)
  function dbgNote(text, r, atPC) {
    const m = /^\s*[0-9A-F]{4}\s+(?:[0-9A-F]{2} )*[0-9A-F]{2}\s+(\S+)\s*(.*)$/.exec(text);
    if (!m) return '';
    const mn = m[1], ops = m[2];
    const o = dbgRegObj(r);
    const reg8 = { A: o.A, B: o.B, C: o.C, D: o.D, E: o.E, H: o.H, L: o.L };
    const notes = [];
    let k;
    if ((mn === 'EXOS' && (k = /^([0-9A-F]{2})/.exec(ops))) || (mn === 'RST' && (k = /^30: ([0-9A-F]{2})/.exec(ops)))) {
      const fn = parseInt(k[1], 16);
      if (machine && machine.type === 1) {
        notes.push(dbgTvcFnName(fn));
        if (atPC) {
          const a = dbgTvcFnArgs(fn, o);
          if (a) notes.push(a);
        }
      } else {
        notes.push('EXOS ' + fn + ': ' + (EXOS_FN[fn] || '?'));
        if (atPC) {
          if (fn === 1 || fn === 2) notes.push('A=' + hex(o.A, 2) + ' ' + dbgExosName(o.DE));
          else if (fn >= 3 && fn <= 11) notes.push('csatorna ' + hex(o.A, 2) + (fn === 7 ? ', B=' + hex(o.B, 2) : ''));
          else if (fn === 16) notes.push(['olvasás', 'írás', 'váltás'][o.B] + ' ' + o.C + '. változó' + (o.B === 1 ? ' = ' + hex(o.D, 2) : ''));
        }
      }
      return notes.join(', ');
    }
    if (mn === 'OUT' || mn === 'IN') {
      const isOut = mn === 'OUT';
      let port = -1, val = -1;
      if ((k = /\(([0-9A-F]{2})\)/.exec(ops))) {
        port = parseInt(k[1], 16);
        if (atPC && isOut) val = o.A;
      } else if (/\(C\)/.test(ops) && atPC) {
        port = o.C;
        const rn = isOut ? ops.split(',')[1].trim() : '';
        if (isOut) val = rn === '0' ? 0 : (reg8[rn] ?? -1);
      }
      if (port >= 0) {
        notes.push('port ' + hex(port, 2) + ': ' + (dbgPortName(port, isOut) || '?'));
        if (val >= 0) {
          const w = dbgPortWriteNote(port, val);
          notes.push('← ' + hex(val, 2) + (w ? ' (' + w + ')' : ''));
        }
      }
      return notes.join(' ');
    }
    if (/^(OUT|OT|IN)[ID]R?$/.test(mn) && atPC) {
      const port = o.C;
      const n = dbgPortName(port, mn.startsWith('O'));
      return 'port ' + hex(port, 2) + (n ? ': ' + n : '');
    }
    const pages = o.pages;
    if ((k = /\(([0-9A-F]{4})\)/.exec(ops))) {
      notes.push(hex(parseInt(k[1], 16), 4) + ': ' + dbgAddrNote(parseInt(k[1], 16), pages));
    } else if (mn === 'LD' && machine && machine.type === 1 && (k = /^(BC|DE|HL|SP|IX|IY), ([0-9A-F]{4})$/.exec(ops))) {
      const a = parseInt(k[2], 16);
      if (pages[0] === 0xF8 && TVC_VARS.some((v) => v[0] === a)) notes.push(dbgAddrNote(a, pages));
    } else if (/^(CALL|JP)$/.test(mn) && (k = /\b([0-9A-F]{4})$/.exec(ops))) {
      const pc = parseInt(text.trim().slice(0, 4), 16), t = parseInt(k[1], 16);
      if (pages[t >> 14] !== pages[pc >> 14]) notes.push('→ ' + dbgAddrNote(t, pages));
    }
    return notes.join(', ');
  }
  // a disassembly line with its comment
  function dbgNoted(text, r, atPC) {
    const n = dbgNote(text, r, atPC);
    return dbgSymText(text) + (n ? '   ; ' + n : '');
  }

  // lines around the PC, starting at an address whose decoding reaches it
  function dbgDisasmAround(pc, before, count) {
    for (let k = 3 * before; k >= 0; k--) {
      const lines = dbgDisasm(pc - k, count + before + 4);
      const i = lines.findIndex((l) => l.addr === (pc & 0xFFFF));
      if (i >= before || (i >= 0 && k <= before)) return lines.slice(Math.max(0, i - before), Math.max(0, i - before) + count);
    }
    return dbgDisasm(pc, count);
  }

  function dbgRenderDis(regs) {
    const r = regs || dbgRegs();
    const pc = r[0];
    const lines = ($('dbg-follow').checked || dbgDisStart < 0) ? dbgDisasmAround(pc, 6, 24) : dbgDisasm(dbgDisStart, 24);
    const box = $('dbg-dis');
    box.textContent = '';
    for (const l of lines) {
      const lbl = dbgLabel(l.addr);
      if (lbl) {
        const d = document.createElement('div');
        d.className = 'lbl';
        d.textContent = lbl + ':';
        box.append(d);
      }
      const d = document.createElement('div');
      const note = dbgNote(l.text, r, l.addr === pc && dbgStopped);
      d.textContent = dbgSymText(l.text);
      if (note) {
        const c = document.createElement('span');
        c.className = 'cm';
        c.textContent = '   ; ' + note;
        d.append(c);
      }
      if (l.addr === pc) d.classList.add('pc');
      if (l.addr === dbgCursor) d.classList.add('cur');
      if (dbgBps.some((b) => b.on && b.type === 'x' && b.addr === l.addr)) d.classList.add('bp');
      d.onclick = (e) => {
        if (e.offsetX < 14) dbgToggleExecBp(l.addr);
        else {
          dbgCursor = l.addr;
          dbgRenderDis();
        }
      };
      box.append(d);
    }
  }

  function dbgMemValid() {
    return dbgMemSrc < 2 || !!api.dbgMemValid(dbgMemSrc);
  }

  function dbgRenderMem() {
    const len = 256;
    const box = $('dbg-mem');
    box.textContent = '';
    if (!dbgMemValid()) {
      box.textContent = dbgMemSrc === 2 ? 'A 2dfx kártya nincs bekapcsolva.' : 'A TVC256k++ kártya nincs bent.';
      return;
    }
    const p = api.dbgMem(dbgMemAddr, len, dbgMemSrc);
    const bytes = M.HEAPU8.slice(p, p + len);
    const aw = dbgMemSrc === 0 ? 4 : 6;
    const pages = dbgMemSrc === 0 ? dbgRegObj().pages : null;
    for (let row = 0; row < len; row += 16) {
      const a = dbgMemAddr + row;
      const line = document.createElement('div');
      line.append(dbgMemSrc === 1 ? hex(a >> 14, 2) + ':' + hex(a & 0x3FFF, 4) : hex(dbgMemSrc === 0 ? a & 0xFFFF : a, aw));
      let ascii = '';
      for (let i = 0; i < 16; i++) {
        const v = bytes[row + i];
        const b = document.createElement('span');
        b.className = 'b';
        if (dbgPrevMem && dbgPrevMem.addr === dbgMemAddr && dbgPrevMem.src === dbgMemSrc &&
            dbgPrevMem.bytes[row + i] !== v) b.classList.add('chg');
        b.textContent = (i === 8 ? '  ' : ' ') + hex(v, 2);
        if (pages) {
          // the name of a known address; the label of a symbol
          const ca = (a + i) & 0xFFFF, note = dbgAddrNote(ca, pages, true), lbl = dbgLabel(ca);
          b.title = hex(ca, 4) + (lbl ? ' ' + lbl : '') + ': ' + note + ' = ' + hex(v, 2) + ' (' + v + ')';
          if (lbl || !/^P\d /.test(note)) b.classList.add('kn');
        }
        b.ondblclick = () => {
          if (dbgMemSrc === 2) { setMessage('A 2dfx RAM csak a kártya portjain át írható', true); return; }
          const t = window.prompt('Új érték (hex): ' + hex(a + i, aw), hex(v, 2));
          if (t === null) return;
          const nv = parseInt(t, 16);
          if (!isNaN(nv)) api.dbgPoke(a + i, nv & 0xFF, dbgMemSrc);
          dbgRenderMem();
        };
        line.append(b);
        ascii += (v >= 32 && v < 127) ? String.fromCharCode(v) : '.';
      }
      line.append('  ' + ascii);
      box.append(line);
    }
    dbgPrevMem = { addr: dbgMemAddr, src: dbgMemSrc, bytes };
  }

  const DBG_BP_NAMES = { x: 'végrehajtás', r: 'mem. olvasás', w: 'mem. írás', rw: 'mem. olv./írás',
                         ior: 'port IN', iow: 'port OUT', iorw: 'port IN/OUT' };
  function dbgRenderBps() {
    const ul = $('dbg-bp-list');
    ul.textContent = '';
    if (!dbgBps.length) {
      const li = document.createElement('li');
      li.className = 'small';
      li.textContent = 'nincs';
      ul.append(li);
    }
    dbgBps.forEach((b, i) => {
      const li = document.createElement('li');
      const on = document.createElement('input');
      on.type = 'checkbox';
      on.checked = b.on;
      on.title = 'Bekapcsolva';
      on.onchange = () => { b.on = on.checked; dbgApplyBps(); dbgRenderDis(); };
      const x = document.createElement('button');
      x.textContent = '✕';
      x.title = 'Törlés';
      x.onclick = () => { dbgBps.splice(i, 1); dbgApplyBps(); dbgRenderBps(); dbgRenderDis(); };
      const a = b.type.startsWith('io') ? hex(b.addr, 2) : hex(b.addr, 4);
      const lbl = b.type.startsWith('io') ? '' : dbgLabel(b.addr);
      const t = document.createElement('span');
      t.textContent = a + (lbl ? ' ' + lbl : '') + '  ' + DBG_BP_NAMES[b.type] +
        (b.cond ? '  ha ' + b.cond : '') + (b.hits ? '  (' + b.hits + '×)' : '');
      li.append(on, x, t);
      ul.append(li);
    });
  }

  function dbgInfo() {
    const [why, pc, addr, value] = api.dbgInfo().split(' ').map(Number);
    return { why, pc, addr, value };
  }

  function dbgStatus() {
    const st = $('dbg-status');
    if (!dbgStopped) {
      st.textContent = 'fut';
      st.classList.remove('stopped');
      return;
    }
    const { why, pc, addr, value } = dbgInfo();
    const lbl = dbgLabel(pc);
    let t = (dbgSteppedBack && why === 3 ? 'Visszalépve' : DBG_REASONS[why]) + ' – PC: ' + hex(pc, 4) + (lbl ? ' (' + lbl + ')' : '');
    if (dbgCallRet && why === 2 && pc === dbgCallRet.ret) {
      const a = dbgRegs()[1] >> 8;
      t += ', a hívás eredménye: A=' + hex(a, 2) + (a === 0 ? ' (rendben)' :
           (machine.type === 1 && TVC_ERR[a] ? ' (' + TVC_ERR[a] + ')' : ''));
    }
    if (why >= 4 && why <= 5) {
      t += ', cím: ' + hex(addr, 4) + ' [' + dbgAddrNote(addr, dbgRegObj().pages) + '] = ' + hex(value, 2) + ' (a hozzáférő utasítás után)';
    }
    if (why >= 6) {
      const pn = dbgPortName(addr, why === 7), wn = why === 7 ? dbgPortWriteNote(addr, value) : '';
      t += ', port: ' + hex(addr & 0xFF, 2) + (pn ? ' [' + pn + ']' : '') + ' = ' + hex(value, 2) + (wn ? ' (' + wn + ')' : '') + ' (az utasítás után)';
    }
    st.textContent = t;
    st.classList.add('stopped');
  }

  function dbgRefresh() {
    if (!dbgOpen || !ready) return;
    const r = dbgRenderRegs();
    dbgRenderDis(r);
    dbgRenderMem();
    dbgStatus();
    for (const id of ['dbg-step', 'dbg-over', 'dbg-out', 'dbg-cursor', 'dbg-run', 'dbg-frame']) $(id).disabled = !dbgStopped;
    $('dbg-back').disabled = !dbgStopped || !dbgUndo.length;
    $('dbg-back').title = 'Visszalépés (' + dbgUndo.length + ' állapot): az előző debugger-lépés előtti állapot (pillanatképből; a lemez- és kártyaállapot nem lép vissza)';
    $('dbg-pause').disabled = dbgStopped;
    $('dbg-machine').textContent = machine ? '– ' + machine.name : '';
    // machine specific tabs
    for (const b of $('dbg-tabs').querySelectorAll('button')) {
      b.hidden = (b.dataset.ep && machine.type !== 0) || (b.dataset.tvc && machine.type !== 1);
      if (b.hidden && b.dataset.tab === dbgTab) dbgSelectTab('mon');
    }
    dbgRenderTab();
    dbgPrevRegs = r;
  }

  // --- stops: conditions, hit counts and the script callback decide whether
  // the page shows the stop or the machine continues at once ---
  const dbgCondCache = new Map();
  function dbgEvalCond(cond, info, hits) {
    let f = dbgCondCache.get(cond);
    if (!f) {
      try {
        f = new Function('R', 'mem', 'mem16', 'VALUE', 'ADDR', 'HITS',
          'const {A,F,B,C,D,E,H,L,AF,BC,DE,HL,IX,IY,SP,PC,I,IM} = R; return (' + cond + ');');
      } catch (e) {
        f = () => { throw e; };
      }
      dbgCondCache.set(cond, f);
    }
    try {
      return !!f(dbgRegObj(), (a) => dbgPeek(a & 0xFFFF), (a) => dbgPeek(a & 0xFFFF) | (dbgPeek((a + 1) & 0xFFFF) << 8),
                 info.value, info.addr, hits);
    } catch (e) {
      setMessage('Hibás feltétel (' + cond + '): ' + e.message, true);
      return true;
    }
  }

  function dbgShouldStop() {
    const info = dbgInfo();
    if (info.why === 1 || info.why >= 4) {
      const types = info.why === 1 ? ['x'] : info.why === 4 ? ['r', 'rw'] : info.why === 5 ? ['w', 'rw'] :
                    info.why === 6 ? ['ior', 'iorw'] : ['iow', 'iorw'];
      const at = info.why === 1 ? info.pc : (info.why >= 6 ? info.addr & 0xFF : info.addr);
      const hit = dbgBps.filter((b) => b.on && types.includes(b.type) && b.addr === at);
      let stop = !hit.length;
      for (const b of hit) {
        b.hits = (b.hits || 0) + 1;
        if (!b.cond || dbgEvalCond(b.cond, info, b.hits)) stop = true;
      }
      if (!stop) return false;
    }
    if (dbgOnBreakFn && info.why !== 3) {
      try {
        if (dbgOnBreakFn(Object.assign(info, { reason: DBG_REASONS[info.why] })) === true) return false;
      } catch (e) {
        dbgScriptLog('onBreak hiba: ' + e.message);
      }
    }
    return true;
  }

  // after running: handles a stop (shows it, or continues the machine if
  // the condition / script says so)
  function dbgHandleStops() {
    let guard = 0;
    while (api.dbgState() && !dbgStopped) {
      if (dbgShouldStop()) {
        dbgOnStop();
        return;
      }
      api.dbgContinue();
      check(api.run(0), 'emuláció');      // the rest of the time slice
      if (++guard > 5000) return;          // the next frame continues
    }
  }

  // called when the machine has stopped and the stop is to be shown
  function dbgOnStop() {
    dbgStopped = true;
    releaseAllKeys();
    if (!dbgOpen) dbgShow(true);
    dbgCursor = -1;
    dbgRenderBps();
    dbgRefresh();
  }

  // step back: a snapshot of the machine before each resume from a stop
  const DBG_UNDO_MAX = 40;
  let dbgUndo = [];                   // [{ file, machine, pic }]
  let dbgUndoSeq = 0;
  let dbgSteppedBack = false;
  let dbgCallRet = null;              // stepping over a system call: { ret, fn }
  function dbgSaveUndo() {
    const file = '/tmp/dbgundo-' + (dbgUndoSeq++);
    if (api.saveSnapshot(file) !== 0) return;
    // the picture shown, as the snapshot does not hold the finished frame
    const u = { file, machine: machine.id, pic: null };
    try { canvas.toBlob((b) => { u.pic = b; }); } catch (e) { }
    dbgUndo.push(u);
    while (dbgUndo.length > DBG_UNDO_MAX) {
      try { M.FS.unlink(dbgUndo.shift().file); } catch (e) { }
    }
  }
  // reset, new machine or loaded snapshot: no stepping back past them
  function dbgUndoClear() {
    for (const u of dbgUndo) {
      try { M.FS.unlink(u.file); } catch (e) { }
    }
    dbgUndo = [];
  }
  function dbgStepBack() {
    if (!dbgStopped) return;
    const u = dbgUndo.pop();
    if (!u) return;
    try {
      if (u.machine !== machine.id) throw new Error('másik gép');
      check(api.loadSnapshotKeepUndo(u.file), 'visszalépés');
    } catch (e) {
      setMessage('A visszalépés nem sikerült: ' + (e.message || e), true);
      return;
    } finally {
      try { M.FS.unlink(u.file); } catch (e) { }
    }
    // stop the restored machine before its first instruction, right now (a
    // Run pressed before the next frame would otherwise be lost)
    api.dbgPause();
    check(api.run(1), 'visszalépés');
    api.audioClear();
    dbgSteppedBack = true;
    if (api.dbgState()) {
      dbgStopped = true;
      dbgRenderBps();
      dbgRefresh();
    } else {
      dbgStopped = false;
    }
    // and show the picture of that moment
    if (u.pic) {
      createImageBitmap(u.pic).then((bm) => {
        ctx.drawImage(bm, 0, 0);
        if (videoRec) drawRecCanvas();
      }, () => { });
    }
  }

  function dbgResume(fn) {
    if (!dbgStopped) return;
    dbgCallRet = null;
    dbgSaveUndo();
    dbgPrevRegs = dbgRegs();
    dbgStopped = false;
    fn();
    dbgStatus();
    for (const id of ['dbg-step', 'dbg-over', 'dbg-out', 'dbg-cursor', 'dbg-run', 'dbg-frame', 'dbg-back']) $(id).disabled = true;
    $('dbg-pause').disabled = false;
    dbgSteppedBack = false;
  }

  // runs one frame (20 ms of emulated time), then stops
  let dbgFrameUs = -1;
  function dbgFrameStep() {
    dbgResume(() => { api.dbgContinue(); dbgFrameUs = 20000; });
  }
  // called by the main loop with the emulated time just run
  function dbgFrameTick(us) {
    if (dbgFrameUs < 0) return;
    dbgFrameUs -= us;
    if (dbgFrameUs <= 0) {
      dbgFrameUs = -1;
      if (!dbgStopped) api.dbgPause();
    }
  }

  // --- memory value finder ---
  let dbgFindPrev = null, dbgFindCand = null;
  function dbgReadAll() {
    const out = new Uint8Array(65536);
    for (let a = 0; a < 65536; a += 4096) {
      const p = api.dbgMem(a, 4096, 0);
      out.set(M.HEAPU8.subarray(p, p + 4096), a);
    }
    return out;
  }
  function dbgFindRender() {
    const box = $('dbg-find');
    box.textContent = '';
    if (!dbgFindCand) { $('dbg-find-count').textContent = ''; return; }
    $('dbg-find-count').textContent = dbgFindCand.length + ' jelölt';
    const cur = dbgReadAll();
    for (const a of dbgFindCand.slice(0, 100)) {
      const d = document.createElement('div');
      d.textContent = hex(a, 4) + '  ' + hex(dbgFindPrev[a], 2) + ' → ' + hex(cur[a], 2) + (dbgLabel(a) ? '   ' + dbgLabel(a) : '');
      d.style.cursor = 'pointer';
      d.title = 'Írásfigyelés erre a címre';
      d.onclick = () => {
        if (!dbgBps.some((b) => b.type === 'w' && b.addr === a)) dbgBps.push({ type: 'w', addr: a, cond: '', on: true, hits: 0 });
        dbgApplyBps(); dbgRenderBps();
        setMessage('Írásfigyelés: ' + hex(a, 4));
      };
      box.append(d);
    }
    if (dbgFindCand.length > 100) box.append('… (' + (dbgFindCand.length - 100) + ' további)');
  }
  function dbgFindNew() {
    dbgFindPrev = dbgReadAll();
    dbgFindCand = Array.from({ length: 65536 }, (_, i) => i);
    const v = parseInt($('dbg-find-val').value, 16);
    if ($('dbg-find-op').value === 'eq' && !isNaN(v)) dbgFindCand = dbgFindCand.filter((a) => dbgFindPrev[a] === v);
    dbgFindRender();
  }
  function dbgFindFilter() {
    if (!dbgFindPrev) { dbgFindNew(); return; }
    const cur = dbgReadAll();
    const op = $('dbg-find-op').value;
    const v = parseInt($('dbg-find-val').value, 16);
    if ((op === 'eq' || op === 'ne') && isNaN(v)) { setMessage('Adj meg egy értéket (hex)', true); return; }
    const test = {
      eq: (o, n) => n === v, ne: (o, n) => n !== v, chg: (o, n) => n !== o, same: (o, n) => n === o,
      inc: (o, n) => n > o, dec: (o, n) => n < o, inc1: (o, n) => n === ((o + 1) & 255), dec1: (o, n) => n === ((o - 1) & 255)
    }[op];
    dbgFindCand = dbgFindCand.filter((a) => test(dbgFindPrev[a], cur[a]));
    dbgFindPrev = cur;
    dbgFindRender();
  }

  // step over: CALL, RST (EXOS / TVC system call with its parameter byte),
  // DJNZ, LDIR & co. and HALT run as one step
  function dbgStepOver() {
    const pc = dbgRegs()[0];
    const p = api.dbgMem(pc, 2, 0);
    const b0 = M.HEAPU8[p], b1 = M.HEAPU8[p + 1];
    let len = 0;
    if (b0 === 0xCD || (b0 & 0xC7) === 0xC4) len = 3;           // CALL
    else if (b0 === 0xF7) len = 2;                              // RST 30h + parameter
    else if ((b0 & 0xC7) === 0xC7) len = 1;                     // RST
    else if (b0 === 0x10) len = 2;                              // DJNZ
    else if (b0 === 0x76) len = 1;                              // HALT
    else if (b0 === 0xED && (b1 & 0xF4) === 0xB0) len = 2;      // LDIR, LDDR, CPIR...
    if (len) dbgResume(() => api.dbgRunTo((pc + len) & 0xFFFF));
    else dbgResume(() => api.dbgStep());
    if (b0 === 0xF7) dbgCallRet = { ret: (pc + 2) & 0xFFFF, fn: b1 };
  }

  // step out: runs to the return address on the top of the stack
  function dbgStepOut() {
    const sp = dbgRegs()[7];
    const ret = dbgPeek(sp) | (dbgPeek((sp + 1) & 0xFFFF) << 8);
    dbgResume(() => api.dbgRunTo(ret));
  }

  // --- tabs ---
  function dbgSelectTab(t) {
    dbgTab = t;
    for (const b of $('dbg-tabs').querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === t);
    for (const p of document.querySelectorAll('#debugger .dbg-tab')) p.hidden = p.dataset.pane !== t;
    try { localStorage.setItem('ep128web.dbgTab', t); } catch (e) { }
    dbgRenderTab();
    if (t === 'mon') $('dbg-mon-in').focus({ preventScroll: true });
  }

  function dbgDisLine(a) {
    const l = dbgDisasm(a, 1)[0];
    return l ? dbgNoted(l.text, dbgRegs(), false) : hex(a, 4);
  }

  function dbgRenderTab() {
    if (!dbgOpen) return;
    switch (dbgTab) {
      case 'hist': {
        $('dbg-hist-on').checked = dbgHistOn;
        const pcs = api.dbgHistory(64).trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16));
        $('dbg-hist').textContent = pcs.length ? pcs.map((a) => {
          const l = dbgLabel(a);
          return (l ? l + ':\n' : '') + dbgDisLine(a);
        }).join('\n') : (dbgHistOn ? 'még nincs adat' : 'kapcsold be az előzmények gyűjtését');
        break;
      }
      case 'prof': {
        $('dbg-prof-on').checked = dbgProfOn;
        const p = api.dbgProfile() >> 2;
        const counts = M.HEAPU32.subarray(p, p + 65536);
        let total = 0;
        const top = [];
        for (let a = 0; a < 65536; a++) {
          const c = counts[a];
          if (!c) continue;
          total += c;
          if (top.length < 40 || c > top[top.length - 1][1]) {
            top.push([a, c]);
            top.sort((x, y) => y[1] - x[1]);
            if (top.length > 40) top.pop();
          }
        }
        $('dbg-prof').textContent = total ? 'Összesen: ' + total + ' utasítás\n' + top.map(([a, c]) =>
          String(c).padStart(10) + '  ' + (100 * c / total).toFixed(2).padStart(6) + '%  ' + dbgDisLine(a) +
          (dbgLabel(a) ? '   ; ' + dbgLabel(a) : '')).join('\n') : (dbgProfOn ? 'még nincs adat' : 'kapcsold be a profilert');
        break;
      }
      case 'iolog': {
        $('dbg-iolog-on').checked = dbgIoLogOn;
        const f = $('dbg-iolog-filter').value.split(/[\s,]+/).filter(Boolean).map((h) => parseInt(h, 16) & 0xFF);
        let lines = api.dbgIoLog(4096).trim().split('\n').filter(Boolean).map((l) => l.split(' '));
        if (f.length) lines = lines.filter((l) => f.includes(parseInt(l[1], 16)));
        lines = lines.slice(-200).reverse();
        $('dbg-iolog').textContent = lines.length ? 'PC    irány port érték\n' + lines.map(([pc, port, v, w]) => {
          const l = dbgLabel(parseInt(pc, 16));
          const pn = dbgPortName(parseInt(port, 16), w === '1');
          const wn = w === '1' ? dbgPortWriteNote(parseInt(port, 16), parseInt(v, 16)) : '';
          const c = [l, pn, wn].filter(Boolean).join(', ');
          return pc + '  ' + (w === '1' ? 'OUT ' : 'IN  ') + '  ' + port + '   ' + v + (c ? '   ; ' + c : '');
        }).join('\n') : (dbgIoLogOn ? 'még nincs adat' : 'kapcsold be az I/O naplót');
        break;
      }
      case 'ioregs': $('dbg-ioregs').textContent = api.dbgIoRegs(); break;
      case 'lpt': dbgRenderLpt(); break;
      case 'sound': $('dbg-sound').textContent = api.dbgSound(); break;
      case 'basic': dbgRenderBasic(); break;
      case 'gfx': dbgRenderGfx(); break;
      case 'fx': $('dbg-fx').textContent = api.dbg2dfx(); break;
      case 'c256': {
        const t = api.dbgCard256();
        $('dbg-c256').textContent = t + (t.startsWith('A TVC256k++') ? '' :
          '\nB0/B1: P2/P3 lap  B2-B5: 8 MB-os lapok  B6: PSRAM MB  B7: ROM lap  C3/C4: firmware\n' +
          'C5: meghajtó  C8-CA: PSRAM / flash / DSK érvényes  D0: USB  D4/D5: egér  E0-FF: vSID');
        break;
      }
      case 'find': if (dbgFindCand) $('dbg-find-count').textContent = dbgFindCand.length + ' jelölt'; break;
      case 'sym': {
        const flt = $('dbg-sym-filter').value.trim().toUpperCase();
        const all = [...dbgSymAddr.entries()].filter(([n]) => !flt || n.includes(flt)).sort((x, y) => x[1] - y[1]);
        $('dbg-sym-count').textContent = dbgSymAddr.size + ' címke';
        $('dbg-sym').textContent = all.slice(0, 1000).map(([n, a]) => hex(a, 4) + '  ' + n).join('\n') +
          (all.length > 1000 ? '\n… (' + (all.length - 1000) + ' további)' : '');
        break;
      }
    }
  }
  let dbgHistOn = false, dbgProfOn = false, dbgIoLogOn = false;

  // EP: NICK line parameter table (LPT) from the video RAM
  const NICK_MODES = ['VSYNC', 'PIXEL', 'ATTRIB', 'CH256', 'CH128', 'CH64', 'érvénytelen', 'LPIXEL'];
  const NICK_COLS = ['2', '4', '16', '256'];
  function epColour(c) {
    const r = ((c & 1) << 2 | (c & 8) >> 2 | (c & 64) >> 6) * 255 / 7;
    const g = ((c & 2) << 1 | (c & 16) >> 3 | (c & 128) >> 7) * 255 / 7;
    const b = ((c & 4) >> 1 | (c & 32) >> 5) * 255 / 3;
    return 'rgb(' + Math.round(r) + ',' + Math.round(g) + ',' + Math.round(b) + ')';
  }
  // --- graphics view: memory drawn as a bitmap ---
  // TVC colour byte (bits 0 B, 2 R, 4 G, 6 I) -> CSS
  function tvcColour(c) {
    const i = c & 0x40, f = (b) => (c & b) ? (i ? 255 : 170) : (i ? 85 : 0);
    return [f(4), f(16), f(1)];
  }
  function epRgb(c) {
    return [((c & 1) << 2 | (c & 8) >> 2 | (c & 64) >> 6) * 255 / 7,
            ((c & 2) << 1 | (c & 16) >> 3 | (c & 128) >> 7) * 255 / 7,
            ((c & 4) >> 1 | (c & 32) >> 5) * 255 / 3].map(Math.round);
  }
  const dbgGfx = { addr: null, bytes: 64, lines: 240, bpp: 1, zoom: 2, pal: null, fixbias: 0 };
  // the displayed screen of the machine as the starting point
  function dbgGfxScreen() {
    const io = api.dbgIoRegs();
    if (machine.type === 1) {
      const mode = +((/Mode:\s*(\d)/.exec(io) || [0, 0])[1]);
      const pal = ((/Palette:\s*([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(io)) || [0, '00', '01', '04', '54']).slice(1, 5).map((h) => parseInt(h, 16));
      const vram = parseInt((/VRAM:\s*([0-9A-F]{2})/.exec(io) || [0, '00'])[1], 16);
      Object.assign(dbgGfx, { addr: (0xFC + (vram >> 4 & 3)) * 16384, bytes: 64, lines: 240, bpp: [1, 2, 4, 4][mode & 3], pal, sys: 'tvc' });
      return;
    }
    // Enterprise: the biggest pixel graphics (PIXEL mode, VRES) entry of the LPT
    const m = /Nick\s+80:\s*([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(io);
    if (!m) return;
    // (IS-BASIC uses an entry per character row: consecutive entries that
    // continue each other in the video RAM are joined)
    let a = (parseInt(m[3], 16) << 4) | ((parseInt(m[4], 16) & 0x0F) << 12), best = null, run = null;
    for (let n = 0; n < 64; n++) {
      const p = api.dbgMem(0x3F0000 + a, 16, 1);
      const b = M.HEAPU8.slice(p, p + 16);
      const nl = 256 - b[0] || 256, bytes = ((b[3] & 63) - (b[2] & 63)) * 2, ld1 = b[4] | b[5] << 8;
      const bpp = [1, 2, 4, 8][(b[1] >> 5) & 3];
      if (((b[1] >> 1) & 7) === 1 && (b[1] & 16) && bytes > 0) {
        if (run && run.bytes === bytes && run.bpp === bpp && ((run.addr + run.bytes * run.lines) & 0xFFFF) === ld1) {
          run.lines += nl;
        } else {
          run = { addr: ld1, bytes, lines: nl, bpp, pal: [...b.slice(8, 16)], fixbias: parseInt(m[1], 16), sys: 'ep' };
        }
        if (!best || run.lines * run.bytes > best.lines * best.bytes) best = run;
      } else run = null;
      if (b[1] & 1) break;
      a = (a + 16) & 0xFFFF;
    }
    if (best) best = Object.assign({}, best, { addr: 0x3F0000 + best.addr });
    if (best) Object.assign(dbgGfx, best);
  }
  function dbgRenderGfx() {
    if (dbgGfx.addr === null || dbgGfx.sys !== (machine.type === 1 ? 'tvc' : 'ep')) {
      dbgGfx.addr = null;
      dbgGfxScreen();
      if (dbgGfx.addr === null) Object.assign(dbgGfx, { addr: 0, sys: machine.type === 1 ? 'tvc' : 'ep' });
      $('dbg-gfx-addr').value = hex(dbgGfx.addr >> 14, 2) + ':' + hex(dbgGfx.addr & 0x3FFF, 4);
      $('dbg-gfx-bytes').value = dbgGfx.bytes;
      $('dbg-gfx-lines').value = dbgGfx.lines;
      $('dbg-gfx-bpp').value = dbgGfx.bpp;
    }
    const { addr, bytes, lines, bpp, zoom } = dbgGfx;
    const ppb = 8 / bpp, w = bytes * ppb, h = lines;
    const cv = $('dbg-gfx-canvas');
    cv.width = w;
    cv.height = h;
    cv.style.width = (bytes * 8 * zoom / 2) + 'px';     // a byte is 8 screen pixels wide on both machines
    cv.style.height = (h * zoom) + 'px';
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(w, h);
    const data = ep.read(addr, bytes * lines, 1);
    const tvc = machine.type === 1;
    const gray = $('dbg-gfx-gray').checked || !dbgGfx.pal;
    const pal = dbgGfx.pal || [];
    // colour of palette index k (2 / 4 colour modes, EP 16 colour)
    const idx = (k, n) => {
      if (gray) return [k * 255 / (n - 1), k * 255 / (n - 1), k * 255 / (n - 1)].map(Math.round);
      if (tvc) return tvcColour(pal[k] || 0);
      return epRgb(k < 8 ? pal[k] || 0 : ((dbgGfx.fixbias & 0x1F) << 3) | (k - 8));
    };
    let o = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < bytes; x++) {
        const v = data[y * bytes + x];
        for (let j = 0; j < ppb; j++) {
          let rgb;
          if (bpp === 1) rgb = idx(v >> (7 - j) & 1, 2);
          else if (bpp === 2) rgb = idx((v >> (7 - j) & 1) | (v >> (3 - j) & 1) << 1, 4);
          else if (bpp === 4) {
            const b = j ? v : v >> 1;          // pixel 0: bits 7 5 3 1, pixel 1: bits 6 4 2 0
            if (tvc && !gray) rgb = tvcColour((b & 2 ? 1 : 0) | (b & 8 ? 4 : 0) | (b & 32 ? 16 : 0) | (b & 128 ? 64 : 0));
            else rgb = idx((b >> 7 & 1) | (b >> 3 & 1) << 1 | (b >> 5 & 1) << 2 | (b >> 1 & 1) << 3, 16);
          } else rgb = gray ? [v, v, v] : epRgb(v);
          img.data[o++] = rgb[0]; img.data[o++] = rgb[1]; img.data[o++] = rgb[2]; img.data[o++] = 255;
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    $('dbg-gfx-info').textContent = (addr >> 14).toString(16).toUpperCase().padStart(2, '0') + ':' + hex(addr & 0x3FFF, 4) +
      (dbgSegName(addr >> 14) ? ' (' + dbgSegName(addr >> 14) + ')' : '') + ', ' + bytes + ' bájt × ' + lines + ' sor, ' +
      (1 << bpp) + ' szín – az egér alatt a bájt címe';
  }
  function setupGfx() {
    const upd = () => {
      const a = dbgParseAddr($('dbg-gfx-addr').value);
      // a CPU address: its physical address with the current paging
      if (a) dbgGfx.addr = a.phys ? a.addr : dbgRegObj().pages[a.addr >> 14 & 3] * 16384 + (a.addr & 0x3FFF);
      dbgGfx.bytes = Math.max(1, Math.min(256, +$('dbg-gfx-bytes').value || 64));
      dbgGfx.lines = Math.max(1, Math.min(512, +$('dbg-gfx-lines').value || 240));
      dbgGfx.bpp = +$('dbg-gfx-bpp').value;
      dbgGfx.zoom = +$('dbg-gfx-zoom').value;
      dbgRenderGfx();
    };
    for (const id of ['dbg-gfx-addr', 'dbg-gfx-bytes', 'dbg-gfx-lines']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') upd(); });
    for (const id of ['dbg-gfx-bpp', 'dbg-gfx-zoom', 'dbg-gfx-gray']) $(id).onchange = upd;
    $('dbg-gfx-screen').onclick = () => { dbgGfx.addr = null; dbgRenderGfx(); };
    // step through memory: a line / a page
    $('dbg-gfx-prev').onclick = () => { dbgGfx.addr = Math.max(0, dbgGfx.addr - dbgGfx.bytes * dbgGfx.lines); $('dbg-gfx-addr').value = hex(dbgGfx.addr >> 14, 2) + ':' + hex(dbgGfx.addr & 0x3FFF, 4); dbgRenderGfx(); };
    $('dbg-gfx-next').onclick = () => { dbgGfx.addr += dbgGfx.bytes * dbgGfx.lines; $('dbg-gfx-addr').value = hex(dbgGfx.addr >> 14, 2) + ':' + hex(dbgGfx.addr & 0x3FFF, 4); dbgRenderGfx(); };
    $('dbg-gfx-canvas').onmousemove = (e) => {
      const cv = e.target, r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * dbgGfx.bytes), y = Math.floor((e.clientY - r.top) / r.height * dbgGfx.lines);
      const a = dbgGfx.addr + y * dbgGfx.bytes + x;
      cv.title = hex(a >> 14, 2) + ':' + hex(a & 0x3FFF, 4) + '  (sor ' + y + ', bájt ' + x + ')';
    };
    $('dbg-gfx-canvas').onclick = (e) => {
      // the clicked byte in the memory view (physical address)
      const cv = e.target, r = cv.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * dbgGfx.bytes), y = Math.floor((e.clientY - r.top) / r.height * dbgGfx.lines);
      const a = dbgGfx.addr + y * dbgGfx.bytes + x;
      dbgMemSrc = 1; $('dbg-mem-src').value = '1'; dbgMemAddr = a & ~15;
      $('dbg-mem-addr').value = hex(a >> 14, 2) + ':' + hex(a & 0x3FF0, 4);
      dbgRenderMem();
    };
  }

  // --- TVC BASIC program listing ---
  // a CPU address in the BASIC RAM (U0..U3), whatever the current paging is
  function dbgTvcRam(a, n) {
    const out = [];
    for (let i = 0; i < n; i++) {
      const ca = (a + i) & 0xFFFF;
      out.push(dbgPeekPhys((0xF8 + (ca >> 14)) * 16384 + (ca & 0x3FFF)));
    }
    return out;
  }
  function dbgPeekPhys(pa) {
    return M.HEAPU8[api.dbgMem(pa, 1, 1)];
  }
  // the keyword table of the SYS ROM, found by the code of its lister
  // (CPL / LD HL,table / BIT 7,(HL) / INC HL / JR Z,-5)
  let dbgBasicKw = null;
  function dbgTvcKeywords() {
    if (dbgBasicKw && dbgBasicKw.id === machine.id) return dbgBasicKw.words;
    const rom = ep.read(0, 16384, 1);
    let table = -1;
    for (let i = 0; i < rom.length - 9 && table < 0; i++) {
      if (rom[i] === 0x2F && rom[i + 1] === 0x21 && rom[i + 4] === 0xCB && rom[i + 5] === 0x7E &&
          rom[i + 6] === 0x23 && rom[i + 7] === 0x28 && rom[i + 8] === 0xFB) table = (rom[i + 2] | rom[i + 3] << 8) - 0xC000;
    }
    const words = [];
    if (table >= 0 && table < 16384) {
      // as the ROM does it: token t is the (~t)th entry after the first end mark
      let p = table;
      for (let n = 1; n <= 127; n++) {
        while (p < 16383 && !(rom[p++] & 0x80)) { }
        let w = '', k = p;
        while (k < 16384) {
          const c = rom[k++];
          w += String.fromCharCode(c & 0x7F);
          if (c & 0x80) break;
        }
        words[n] = w;
      }
    }
    dbgBasicKw = { id: machine.id, words };
    return words;
  }
  const TVC_HU = { 0x80: 'Á', 0x81: 'É', 0x82: 'Í', 0x83: 'Ó', 0x84: 'Ö', 0x85: 'Ő', 0x86: 'Ú', 0x87: 'Ü', 0x88: 'Ű',
                   0x90: 'á', 0x91: 'é', 0x92: 'í', 0x93: 'ó', 0x94: 'ö', 0x95: 'ő', 0x96: 'ú', 0x97: 'ü', 0x98: 'ű' };
  // the program as text lines: [{ addr, num, text }]
  function dbgTvcBasic(maxLines) {
    const kw = dbgTvcKeywords();
    const lines = [];
    let a = dbgTvcRam(0x1722, 2), p = a[0] | a[1] << 8;
    while (lines.length < maxLines) {
      const [len, lo, hi] = dbgTvcRam(p, 3);
      if (!len) break;
      const b = dbgTvcRam(p + 3, len - 3);
      let t = '';
      for (const c of b) {
        if (c === 0xFF) break;
        if (c >= 0x80) t += kw[(~c) & 0xFF] !== undefined ? kw[(~c) & 0xFF] : '{' + hex(c, 2) + '}';
        else if (c < 0x20) t += TVC_HU[c + 0x80] || '{' + hex(c + 0x80, 2) + '}';
        else t += String.fromCharCode(c);
      }
      lines.push({ addr: p, num: lo | hi << 8, text: t });
      p = (p + len) & 0xFFFF;
    }
    return lines;
  }
  function dbgRenderBasic() {
    const box = $('dbg-basic');
    const lines = dbgTvcBasic(3000);
    if (!dbgTvcKeywords().length) {
      box.textContent = 'A BASIC kulcsszótábla nem található ebben a ROM-ban.';
      return;
    }
    const cur = dbgTvcRam(0x170C, 2), curAddr = cur[0] | cur[1] << 8;
    const running = (dbgTvcRam(0x1700, 1)[0] & 4) !== 0;
    box.textContent = '';
    const head = document.createElement('div');
    head.className = 'small';
    head.textContent = lines.length + ' sor' + (running ? ', fut – az aktuális sor kiemelve' : '') +
      ' (kattintás: a sor címe a memórianézetben)';
    box.append(head);
    for (const l of lines) {
      const d = document.createElement('div');
      d.textContent = String(l.num).padStart(5) + ' ' + l.text;
      d.title = 'Cím: ' + hex(l.addr, 4);
      if (running && l.addr === curAddr) d.className = 'pc';
      d.onclick = () => { dbgMemSrc = 0; $('dbg-mem-src').value = '0'; dbgMemAddr = l.addr; $('dbg-mem-addr').value = hex(l.addr, 4); dbgRenderMem(); };
      box.append(d);
    }
  }

  function dbgRenderLpt() {
    const io = api.dbgIoRegs();
    const m = /Nick\s+80:\s*([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2}) ([0-9A-F]{2})/.exec(io);
    const cur = /Nick\s+LPB:\s*([0-9A-F]{4})/.exec(io);
    if (!m) { $('dbg-lpt').textContent = 'Csak Enterprise-on.'; return; }
    const p82 = parseInt(m[3], 16), p83 = parseInt(m[4], 16);
    const base = (p82 << 4) | ((p83 & 0x0F) << 12);
    const curLpb = cur ? parseInt(cur[1], 16) & 0xFFF0 : -1;
    let html = '<div>Border: ' + m[2] + '  LPT: ' + hex(base, 4) + '  (83h: ' + m[4] + ')</div>' +
      '<table><tr><th>#</th><th>cím</th><th>sor</th><th>mód</th><th>szín</th><th>VRES</th><th>IRQ</th>' +
      '<th>margó</th><th>LD1</th><th>LD2</th><th>paletta</th></tr>';
    let a = base, lines = 0;
    for (let n = 0; n < 64; n++) {
      const p = api.dbgMem(0x3F0000 + a, 16, 1);
      const b = M.HEAPU8.slice(p, p + 16);
      const nl = 256 - b[0] || 256;
      const mode = (b[1] >> 1) & 7;
      html += '<tr' + (a === curLpb ? ' class="cur"' : '') + '><td>' + n + '</td><td>' + hex(a, 4) + '</td><td>' + nl +
        '</td><td>' + NICK_MODES[mode] + '</td><td>' + NICK_COLS[(b[1] >> 5) & 3] + '</td><td>' + ((b[1] & 16) ? 'igen' : '') +
        '</td><td>' + ((b[1] & 128) ? 'igen' : '') + '</td><td>' + hex(b[2] & 63, 2) + '-' + hex(b[3] & 63, 2) +
        '</td><td>' + hex(b[4] | b[5] << 8, 4) + '</td><td>' + hex(b[6] | b[7] << 8, 4) + '</td><td>' +
        [...b.slice(8, 16)].map((c) => '<i title="' + hex(c, 2) + '" style="background:' + epColour(c) + '"></i>').join('') + '</td></tr>';
      lines += nl;
      if (b[1] & 1) break;                  // reload: the end of the LPT
      a = (a + 16) & 0xFFFF;
    }
    html += '</table><div>Összesen ' + lines + ' sor</div>';
    $('dbg-lpt').innerHTML = html;
  }

  // --- monitor (the commands of ep128emu's monitor) ---
  let monNextD = -1, monNextM = -1;
  const monHist = [];
  let monHistPos = 0;
  function monPrint(t) {
    const out = $('dbg-mon-out');
    out.textContent += t + '\n';
    if (out.textContent.length > 60000) out.textContent = out.textContent.slice(-50000);
    out.scrollTop = out.scrollHeight;
  }
  function monAddr(t, what) {
    const a = dbgParseAddr(t);
    if (!a) throw new Error('hibás ' + (what || 'cím') + ': ' + t);
    return a;
  }
  function monBytes(args) {
    const out = [];
    for (const t of args) {
      const m = /^"(.*)"$/.exec(t);
      if (m) { for (const ch of m[1]) out.push(ch.charCodeAt(0) & 0xFF); continue; }
      const v = parseInt(t.replace(/^(0x|\$|#)/i, ''), 16);
      if (isNaN(v) || v > 255) throw new Error('hibás bájt: ' + t);
      out.push(v);
    }
    return out;
  }
  function monTokens(line) {
    return (line.match(/"[^"]*"|[^\s,]+/g) || []);
  }
  // read / write by address object (CPU or physical)
  const monRead = (a, i) => dbgPeek(a.addr + i, a.phys ? 1 : 0);
  const monWrite = (a, i, v) => api.dbgPoke(a.addr + i, v, a.phys ? 1 : 0);
  function monFmt(a, i) {
    const x = a.addr + i;
    return a.phys ? hex(x >> 14, 2) + ':' + hex(x & 0x3FFF, 4) : hex(x & 0xFFFF, 4);
  }

  const MON_HELP = [
    '.  A <cím> <utasítás>   assembler (pl. A 4000 LD A,5); utána a következő cím jön',
    'D [kezdet [vég]] ["fájl"]  disassembly (fájlba is)',
    'M [kezdet [vég]] ["fájl"]  memória dump (fájlba is)',
    '> <cím> <bájtok…>       memória írása (hex vagy "szöveg")',
    'F <kezdet> <vég> <minta…>  feltöltés mintával',
    'C <kezdet> <vég> <cél>  összehasonlítás',
    'H <kezdet> <vég> <minta…>  keresés (hex vagy "szöveg")',
    'SR <kezdet> <vég> <minta…> , <csere…>  keresés és csere',
    'T <kezdet> <vég> <cél>  másolás',
    'R                       regiszterek',
    '; <pc> [af [bc [de [hl [sp [ix [iy]]]]]]]   regiszterek beállítása',
    ';; <af\'> [bc\' [de\' [hl\' [im [i [r]]]]]]',
    'G [cím]                 folytatás (cím: onnan)',
    'X / Z / Y               folytatás / lépés / átlépés',
    'IO                      I/O regiszterek',
    'O <port> <érték>        port írása',
    'L <cím>                 fájl betöltése a címre (fájlválasztó)',
    'S <kezdet> <vég> [név]  memória mentése fájlba (letöltés)',
    'V <cím>                 összehasonlítás egy fájllal (fájlválasztó)',
    'I                       beállítások, állapot',
    'CLS                     a kimenet törlése',
    'Címek: hex (C000), szegmens:offset (FC:0000), címke, címke+10'
  ];

  function monExec(line) {
    line = line.trim();
    if (!line) return;
    monPrint('> ' + line);
    let m;
    if ((m = /^(;;|;|>|\.)(.*)$/.exec(line))) line = m[1] + ' ' + m[2];
    const tok = monTokens(line);
    const cmd = tok[0].toUpperCase();
    const args = tok.slice(1);
    const stopped = () => { if (!dbgStopped) throw new Error('előbb állítsd meg a gépet'); };
    switch (cmd) {
      case '?': case 'HELP': MON_HELP.forEach(monPrint); break;
      case 'CLS': $('dbg-mon-out').textContent = ''; break;
      case 'A': case '.': {
        if (!args.length) throw new Error('A <cím> <utasítás>');
        const a = monAddr(args[0]);
        if (a.phys) throw new Error('az assembler CPU címet vár');
        if (args.length < 2) { $('dbg-mon-in').value = 'A ' + hex(a.addr, 4) + ' '; return; }
        // symbols in the operands -> hex
        const src = line.replace(/^\S+\s+\S+\s*/, '').replace(/[A-Za-z_.@?][\w.@?$]*/g, (w) => {
          const v = dbgSymAddr.get(w.toUpperCase());
          return v === undefined ? w : hex(v, 4);
        });
        const next = api.dbgAssemble('A ' + hex(a.addr, 4) + ' ' + src.toUpperCase());
        if (next < 0) throw new Error(lastError() || 'szintaxis hiba');
        monPrint(dbgDisLine(a.addr));
        $('dbg-mon-in').value = 'A ' + hex(next, 4) + ' ';
        dbgRefresh();
        return 'keep';
      }
      case 'D': {
        const file = args.length && /^".*"$/.test(args[args.length - 1]) ? args.pop().slice(1, -1) : null;
        const lines = [];
        const print = file ? (t) => lines.push(t) : monPrint;
        const regs = dbgRegs();
        let a = args.length ? monAddr(args[0]).addr : (monNextD >= 0 ? monNextD : regs[0]);
        const end = args.length > 1 ? monAddr(args[1]).addr : -1;
        let n = end >= 0 ? 4096 : 20;
        while (n-- > 0) {
          const l = dbgDisasm(a, 1)[0];
          const lbl = dbgLabel(a);
          if (lbl) print(lbl + ':');
          print(dbgNoted(l.text, regs, false));
          const nx = dbgDisasm(a, 2)[1].addr;
          if (end >= 0 && (a >= end || nx > end || nx < a)) { a = nx; break; }
          a = nx;
        }
        monNextD = a;
        if (file) {
          download(new TextEncoder().encode(lines.join('\n') + '\n'), file || 'disasm.txt');
          monPrint(lines.length + ' sor: ' + file);
        }
        break;
      }
      case 'M': {
        const file = args.length && /^".*"$/.test(args[args.length - 1]) ? args.pop().slice(1, -1) : null;
        const lines = [];
        const print = file ? (t) => lines.push(t) : monPrint;
        let a = args.length ? monAddr(args[0]) : { addr: monNextM >= 0 ? monNextM : 0, phys: false };
        let len = args.length > 1 ? monAddr(args[1]).addr - a.addr + 1 : 128;
        if (len <= 0 || len > 65536) throw new Error('hibás tartomány');
        for (let i = 0; i < len; i += 16) {
          let s = monFmt(a, i) + ' ', asc = '';
          for (let j = 0; j < 16 && i + j < len; j++) {
            const v = monRead(a, i + j);
            s += ' ' + hex(v, 2);
            asc += (v >= 32 && v < 127) ? String.fromCharCode(v) : '.';
          }
          print(s.padEnd(a.phys ? 56 : 54) + '  ' + asc);
        }
        monNextM = a.addr + len;
        if (file) {
          download(new TextEncoder().encode(lines.join('\n') + '\n'), file);
          monPrint(lines.length + ' sor: ' + file);
        }
        break;
      }
      case '>': {
        const a = monAddr(args[0]);
        monBytes(args.slice(1)).forEach((v, i) => monWrite(a, i, v));
        dbgRefresh();
        break;
      }
      case 'F': {
        const a = monAddr(args[0]), e = monAddr(args[1]).addr, pat = monBytes(args.slice(2));
        if (!pat.length) throw new Error('nincs minta');
        for (let i = 0; a.addr + i <= e; i++) monWrite(a, i, pat[i % pat.length]);
        dbgRefresh();
        break;
      }
      case 'T': {
        const a = monAddr(args[0]), e = monAddr(args[1]).addr, d = monAddr(args[2]);
        const buf = [];
        for (let i = 0; a.addr + i <= e; i++) buf.push(monRead(a, i));
        buf.forEach((v, i) => monWrite(d, i, v));
        monPrint(buf.length + ' bájt másolva');
        dbgRefresh();
        break;
      }
      case 'C': {
        const a = monAddr(args[0]), e = monAddr(args[1]).addr, d = monAddr(args[2]);
        let n = 0;
        for (let i = 0; a.addr + i <= e; i++) {
          const x = monRead(a, i), y = monRead(d, i);
          if (x !== y && n++ < 200) monPrint(monFmt(a, i) + ' ' + hex(x, 2) + '  ' + monFmt(d, i) + ' ' + hex(y, 2));
        }
        monPrint(n ? n + ' eltérés' : 'egyezik');
        break;
      }
      case 'H': case 'SR': {
        // SR: the replacement follows a comma
        const parts = line.split(',');
        const lt = monTokens(parts[0]).slice(1);
        if (lt.length < 3) throw new Error(cmd + ' <kezdet> <vég> <minta…>' + (cmd === 'SR' ? ' , <csere…>' : ''));
        const a = monAddr(lt[0]), e = monAddr(lt[1]).addr;
        const pat = monBytes(lt.slice(2));
        const rep = cmd === 'SR' ? monBytes(monTokens(parts.slice(1).join(','))) : null;
        if (cmd === 'SR' && !rep.length) throw new Error('SR <kezdet> <vég> <minta…> , <csere…>');
        let n = 0;
        for (let i = 0; a.addr + i + pat.length - 1 <= e; i++) {
          if (pat.every((v, k) => monRead(a, i + k) === v)) {
            n++;
            if (n <= 200) monPrint(monFmt(a, i) + (dbgLabel(a.addr + i) && !a.phys ? '  ' + dbgLabel(a.addr + i) : ''));
            if (rep) rep.forEach((v, k) => monWrite(a, i + k, v));
          }
        }
        monPrint(n + (rep ? ' csere' : ' találat'));
        if (rep) dbgRefresh();
        break;
      }
      case 'R': {
        const r = dbgRegObj();
        monPrint('  PC   AF   BC   DE   HL   SP   IX   IY');
        monPrint('; ' + [r.PC, r.AF, r.BC, r.DE, r.HL, r.SP, r.IX, r.IY].map((v) => hex(v, 4)).join(' '));
        monPrint("       AF'  BC'  DE'  HL'  IM   I    R");
        monPrint(';; ' + [r.AF_, r.BC_, r.DE_, r.HL_].map((v) => hex(v, 4)).join(' ') + '  ' + hex(r.IM, 2) + '   ' + hex(r.I, 2) + '   ' + hex(r.R, 2));
        break;
      }
      case ';': case ';;': {
        stopped();
        const order = cmd === ';' ? [0, 1, 2, 3, 4, 7, 5, 6] : [8, 9, 10, 11, 14, 12, 13];
        args.forEach((t, i) => {
          if (i >= order.length) return;
          const v = parseInt(t, 16);
          if (isNaN(v)) throw new Error('hibás érték: ' + t);
          api.dbgSetReg(order[i], v);
        });
        dbgRefresh();
        break;
      }
      case 'G': {
        stopped();
        if (args.length) api.dbgSetReg(0, monAddr(args[0]).addr);
        dbgResume(() => api.dbgContinue());
        break;
      }
      case 'X': stopped(); dbgResume(() => api.dbgContinue()); break;
      case 'Z': stopped(); dbgResume(() => api.dbgStep()); break;
      case 'Y': stopped(); dbgStepOver(); break;
      case 'IO': api.dbgIoRegs().split('\n').forEach(monPrint); break;
      case 'O': {
        const p = parseInt(args[0], 16), v = parseInt(args[1], 16);
        if (isNaN(p) || isNaN(v)) throw new Error('O <port> <érték>');
        api.dbgOut(p, v);
        break;
      }
      case 'L': case 'V': {
        const a = monAddr(args[0]);
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.onchange = async () => {
          const f = inp.files[0];
          if (!f) return;
          const b = new Uint8Array(await f.arrayBuffer());
          if (cmd === 'L') {
            b.forEach((v, i) => monWrite(a, i, v));
            monPrint(f.name + ': ' + b.length + ' bájt betöltve ' + monFmt(a, 0) + '-' + monFmt(a, b.length - 1));
            dbgRefresh();
          } else {
            let n = 0;
            b.forEach((v, i) => { const x = monRead(a, i); if (x !== v && n++ < 200) monPrint(monFmt(a, i) + ' ' + hex(x, 2) + '  fájl: ' + hex(v, 2)); });
            monPrint(n ? n + ' eltérés' : 'egyezik (' + b.length + ' bájt)');
          }
        };
        inp.click();
        break;
      }
      case 'S': {
        const a = monAddr(args[0]), e = monAddr(args[1]).addr;
        const name = (args[2] || '').replace(/"/g, '') || ('mem-' + monFmt(a, 0).replace(':', '') + '.bin');
        const buf = new Uint8Array(Math.max(0, e - a.addr + 1));
        for (let i = 0; i < buf.length; i++) buf[i] = monRead(a, i);
        download(buf, name);
        monPrint(buf.length + ' bájt: ' + name);
        break;
      }
      case 'I': {
        monPrint('Gép: ' + machine.name + (dbgStopped ? ' (megállítva)' : ' (fut)'));
        monPrint('Címkék: ' + dbgSymAddr.size + '  Töréspontok: ' + dbgBps.length);
        monPrint('Előzmények: ' + (dbgHistOn ? 'be' : 'ki') + '  Profiler: ' + (dbgProfOn ? 'be' : 'ki') + '  I/O napló: ' + (dbgIoLogOn ? 'be' : 'ki'));
        break;
      }
      default: throw new Error('ismeretlen parancs: ' + tok[0] + ' (? = súgó)');
    }
  }

  // --- script API ---
  function dbgScriptLog(t) {
    const out = $('dbg-script-out');
    out.textContent += t + '\n';
    if (out.textContent.length > 40000) out.textContent = out.textContent.slice(-30000);
  }
  const ep = {
    hex,
    regs: () => dbgRegObj(),
    setReg: (name, v) => {
      const i = DBG_REGS.indexOf(String(name).toUpperCase().replace('_', "'"));
      if (i < 0) throw new Error('ismeretlen regiszter: ' + name);
      api.dbgSetReg(i, v);
    },
    peek: (a) => dbgPeek(a & 0xFFFF),
    peek16: (a) => dbgPeek(a & 0xFFFF) | (dbgPeek((a + 1) & 0xFFFF) << 8),
    poke: (a, v) => api.dbgPoke(a & 0xFFFF, v & 0xFF, 0),
    read: (a, n, src) => {
      const out = [];
      for (let o = 0; o < n; o += 4096) {
        const k = Math.min(4096, n - o), p = api.dbgMem(src ? a + o : (a + o) & 0xFFFF, k, src || 0);
        for (let i = 0; i < k; i++) out.push(M.HEAPU8[p + i]);
      }
      return out;
    },
    out: (port, v) => api.dbgOut(port, v),
    disasm: (a, n) => dbgDisasm(a, n || 1).map((l) => dbgSymText(l.text)),
    assemble: (a, text) => api.dbgAssemble('A ' + hex(a, 4) + ' ' + String(text).toUpperCase()),
    bp: (a, cond) => { dbgBps.push({ type: 'x', addr: a & 0xFFFF, cond: cond || '', on: true, hits: 0 }); dbgApplyBps(); dbgRenderBps(); },
    watch: (type, a, cond) => {
      if (!DBG_BP_NAMES[type]) throw new Error('típus: r w rw ior iow iorw');
      dbgBps.push({ type, addr: type.startsWith('io') ? a & 0xFF : a & 0xFFFF, cond: cond || '', on: true, hits: 0 });
      dbgApplyBps(); dbgRenderBps();
    },
    clearBps: () => { dbgBps = []; dbgApplyBps(); dbgRenderBps(); },
    onBreak: (fn) => { dbgOnBreakFn = typeof fn === 'function' ? fn : null; },
    pause: () => api.dbgPause(),
    cont: () => dbgResume(() => api.dbgContinue()),
    step: () => dbgResume(() => api.dbgStep()),
    stepOver: () => dbgStepOver(),
    runTo: (a) => dbgResume(() => api.dbgRunTo(a & 0xFFFF)),
    stopped: () => dbgStopped,
    info: () => dbgInfo(),
    ioRegs: () => api.dbgIoRegs(),
    sym: (name) => dbgSymAddr.get(String(name).toUpperCase()),
    label: (a) => dbgLabel(a),
    history: (n) => api.dbgHistory(n || 64).trim().split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)),
    monitor: (cmd) => monExec(cmd),
    log: (...a) => dbgScriptLog(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')),
    // names: a system call code, a known address (with the current paging), an I/O port
    callName: (code) => machine.type === 1 ? dbgTvcFnName(code & 255) : 'EXOS ' + (code & 255) + ': ' + (EXOS_FN[code & 255] || '?'),
    addrName: (a) => dbgAddrNote(a, dbgRegObj().pages),
    portName: (port) => dbgPortName(port),
    // called after each display frame while the machine runs: fn(emulated µs)
    onFrame: (fn) => { dbgOnFrameFn = typeof fn === 'function' ? fn : null; },
    // types on the emulated keyboard ('\n' = Enter); resolves when typed
    type: async (text) => {
      await ep.until(() => !autoTask);          // after an earlier typing / autostart
      typeText(String(text));
      return ep.until(() => !autoTask);
    },
    // resolves after 'ms' milliseconds of emulated time
    wait: (ms) => new Promise((resolve) => dbgWaits.push({ at: emulatedUs + ms * 1000, resolve })),
    // resolves at the first frame where fn() is true
    until: (fn) => new Promise((resolve) => dbgWaits.push({ fn, resolve })),
    reset: (cold) => reset(!!cold),
    time: () => emulatedUs / 1000
  };
  window.ep = ep;

  // script hooks run by the main loop after each frame
  let dbgOnFrameFn = null;
  let dbgWaits = [];
  function dbgScriptFrame(us) {
    dbgLuaPoll();
    if (dbgOnFrameFn) {
      try {
        dbgOnFrameFn(us);
      } catch (e) {
        dbgScriptLog('onFrame hiba: ' + e.message);
        dbgOnFrameFn = null;
      }
    }
    if (!dbgWaits.length) return;
    const left = [];
    for (const w of dbgWaits) {
      let done = false;
      try {
        done = w.fn ? !!w.fn() : emulatedUs >= w.at;
      } catch (e) {
        dbgScriptLog('until hiba: ' + e.message);
        done = true;
      }
      if (done) w.resolve();
      else left.push(w);
    }
    dbgWaits = left;
  }
  // the text printed by the Lua script (mprint, errors)
  function dbgLuaPoll() {
    if (!api || !api.luaOutput) return;
    const t = api.luaOutput();
    if (t) dbgScriptLog(t.replace(/\n$/, ''));
  }
  let dbgScriptLang = 'js';
  try { if (localStorage.getItem('ep128web.dbgScriptLang') === 'lua') dbgScriptLang = 'lua'; } catch (e) { }
  function dbgScriptLangUi() {
    const lua = dbgScriptLang === 'lua';
    $('dbg-script-lang').value = dbgScriptLang;
    for (const o of $('dbg-script-example').options) o.hidden = !!o.value && (o.dataset.lua === '1') !== lua;
    $('dbg-script').placeholder = lua ? DBG_LUA_PLACEHOLDER : DBG_JS_PLACEHOLDER;
  }
  function dbgScriptStop() {
    if (api && api.luaStop) api.luaStop();
    dbgOnBreakFn = null;
    dbgOnFrameFn = null;
    dbgWaits = [];
    dbgScriptLog('szkript leállítva (onBreak, onFrame, várakozások)');
  }

  const DBG_JS_PLACEHOLDER = `// JavaScript az ep objektummal, pl.:
// ep.onBreak(info => { ep.log(ep.hex(ep.regs().HL, 4)); return true; })  // true: fut tovább
// ep.bp(0x0038)   ep.watch('w', 0xBFF0)   ep.poke(0x4000, 0xC9)   ep.step()
// await ep.type('LIST\\n');  await ep.wait(1000);  ep.onFrame(() => ep.poke(0x1234, 5))`;
  const DBG_LUA_PLACEHOLDER = `-- Lua, az ep128emu szkript API-jával (a desktop emulátor README-je szerint):
-- breakPointCallback(t, a, v), setBreakPoint(típus, cím, prioritás), clearBreakPoints(),
-- readMemory/writeMemory, readMemoryRaw, getPC(), getA() … setA(n) …, readIOPort,
-- getMemoryPage(n), getNextOpcodeAddr(a), mprint(...)`;
  const DBG_SCRIPT_EXAMPLES = {
    luaexos: `-- Az ep128emu README példája (Enterprise): megáll, amikor a 102-es
-- csatornát megnyitják, és kiírja a nevet
mprint("Running Lua script example...")
clearBreakPoints()
setBreakPoint(4, 0x0040, 2)   -- break on reading Z80 opcode at 0x0040
function breakPointCallback(t, a, v)
  if t == 3 then              -- allow stepping
    return true
  end
  -- check for EXOS 1 call with A=102
  if getPC() ~= 0x0040 or getA() ~= 1 or readMemory(0x005A) ~= 102 then
    return false
  end
  -- read name parameter from memory
  s = ""
  n = readMemory(getDE())
  for i = 1, n do
    s = s..string.char(readMemory(getDE() + i))
  end
  mprint("Channel #102 is opened with name '", s, "'")
  return true
end
mprint("done.")`,
    luatvc: `-- TVC: minden rendszerhívás (RST 30h) naplózása megállás nélkül
clearBreakPoints()
setBreakPoint(4, 0x0030, 2)
function breakPointCallback(t, a, v)
  if t ~= 0 or a ~= 0x0030 then return true end
  local ret = readWord(getSP())          -- a hívás utáni bájt: a funkciókód
  mprint(string.format("%04X  RST 30: %02X", ret - 1, readMemory(ret)))
  return false                           -- false: fut tovább
end`,
    luawatch: `-- Memóriaírás figyelése: kiírja, ki írt a címre, és csak 00 értéknél áll meg
clearBreakPoints()
local ADDR = 0x0B4F                      -- TVC: BORDER
setBreakPoint(2, ADDR, 2)
function breakPointCallback(t, a, v)
  if t ~= 2 then return true end
  mprint(string.format("%04X: (%04X) = %02X", getPC(), a, v))
  return v == 0
end`,
    calls: `// Minden rendszerhívás (RST 30h) naplózása, a gép közben fut tovább
ep.clearBps();
ep.bp(0x0030);
ep.onBreak((info) => {
  if (info.why !== 1 || info.pc !== 0x0030) return false;   // más megállás: maradjon
  const r = ep.regs();
  const ret = ep.peek16(r.SP);                // a hívás utáni cím: a funkciókód
  ep.log(ep.hex(ret - 1, 4), ep.hex(ep.peek(ret), 2), ep.callName(ep.peek(ret)));
  return true;                                // fut tovább
});`,
    type: `// Gépelés, várakozás, majd a képernyő utáni állapot
await ep.type('PRINT 6*7\\n');
await ep.wait(500);                           // 0,5 s emulált idő
ep.log('kész, PC =', ep.hex(ep.regs().PC, 4));`,
    watch: `// Egy memóriacím írásainak naplózása (cím, érték, ki írta)
const ADDR = 0x0B4F;                          // TVC: BORDER
ep.clearBps();
ep.watch('w', ADDR);
ep.onBreak((info) => {
  if (info.why !== 5) return false;
  ep.log(ep.hex(info.pc, 4), '→', ep.hex(info.addr, 4), '=', ep.hex(info.value, 2), ep.addrName(info.addr));
  return true;
});`,
    cheat: `// "Végtelen élet": képkockánként visszaírja az értéket
// (a címet a Kereső füllel lehet megtalálni)
const ADDR = 0x1234, VALUE = 5;
ep.onFrame(() => ep.poke(ADDR, VALUE));`,
    until: `// Futás addig, amíg egy feltétel teljesül, utána megállás
await ep.until(() => ep.peek(0x0B16) === 0xFF);   // TVC: STOP_FLAG (CTRL+ESC)
ep.pause();
ep.log('CTRL+ESC megnyomva');`
  };

  let dbgTimer = 0;
  function dbgShow(on) {
    dbgOpen = on;
    $('debugger').hidden = !on;
    $('btn-debug').classList.toggle('on', on);
    try { localStorage.setItem('ep128web.debugger', on ? '1' : '0'); } catch (e) { }
    clearInterval(dbgTimer);
    if (on) {
      // while running, the views follow the machine a few times a second
      dbgTimer = setInterval(() => { if (!dbgStopped) dbgRefresh(); }, 400);
      dbgRenderBps();
      dbgRefresh();
    }
  }

  function setupDebugger() {
    $('btn-debug').onclick = () => dbgShow(!dbgOpen);
    $('dbg-run').onclick = () => dbgResume(() => api.dbgContinue());
    $('dbg-pause').onclick = () => { if (!dbgStopped) api.dbgPause(); };
    $('dbg-step').onclick = () => dbgResume(() => api.dbgStep());
    $('dbg-over').onclick = dbgStepOver;
    $('dbg-out').onclick = dbgStepOut;
    $('dbg-frame').onclick = dbgFrameStep;
    $('dbg-back').onclick = dbgStepBack;
    $('dbg-find-new').onclick = dbgFindNew;
    $('dbg-find-go').onclick = dbgFindFilter;
    $('dbg-cursor').onclick = () => { if (dbgCursor >= 0) dbgResume(() => api.dbgRunTo(dbgCursor)); };
    $('dbg-follow').onchange = () => dbgRefresh();
    $('dbg-dis-addr').addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const a = dbgParseAddr(e.target.value);
      if (!a || a.phys) return;
      dbgDisStart = a.addr & 0xFFFF;
      $('dbg-follow').checked = false;
      dbgRefresh();
    });
    const setMem = () => {
      dbgMemSrc = Number($('dbg-mem-src').value);
      const a = dbgParseAddr($('dbg-mem-addr').value);
      if (!a) return;
      dbgMemAddr = a.addr;
      if (a.phys && dbgMemSrc !== 1) { dbgMemSrc = 1; $('dbg-mem-src').value = '1'; }
      dbgPrevMem = null;
      dbgRefresh();
    };
    $('dbg-mem-addr').addEventListener('keydown', (e) => { if (e.key === 'Enter') setMem(); });
    $('dbg-mem-src').onchange = setMem;
    $('dbg-bp-add').onclick = () => {
      const type = $('dbg-bp-type').value;
      const a = dbgParseAddr($('dbg-bp-addr').value);
      if (!a || a.phys) { setMessage('A töréspont címe hexadecimális CPU cím (pl. C000) vagy címke', true); return; }
      const addr = type.startsWith('io') ? a.addr & 0xFF : a.addr & 0xFFFF;
      const cond = $('dbg-bp-cond').value.trim();
      if (cond) {
        try { new Function('return (' + cond + ');'); } catch (e) { setMessage('Hibás feltétel: ' + e.message, true); return; }
      }
      dbgBps.push({ type, addr, cond, on: true, hits: 0 });
      dbgApplyBps();
      dbgRenderBps();
      dbgRenderDis();
    };
    for (const b of $('dbg-tabs').querySelectorAll('button')) b.onclick = () => dbgSelectTab(b.dataset.tab);
    $('dbg-hist-on').onchange = (e) => { dbgHistOn = e.target.checked; api.dbgHistoryEnable(dbgHistOn ? 1 : 0); dbgRenderTab(); };
    $('dbg-prof-on').onchange = (e) => { dbgProfOn = e.target.checked; api.dbgProfileEnable(dbgProfOn ? 1 : 0); dbgRenderTab(); };
    $('dbg-prof-clear').onclick = () => { api.dbgProfileClear(); dbgRenderTab(); };
    $('dbg-iolog-on').onchange = (e) => { dbgIoLogOn = e.target.checked; api.dbgIoLogEnable(dbgIoLogOn ? 1 : 0); dbgRenderTab(); };
    $('dbg-iolog-filter').oninput = () => dbgRenderTab();
    $('dbg-sym-filter').oninput = () => dbgRenderTab();
    $('dbg-sym-file').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (!f) return;
      const text = await f.text();
      const n = dbgLoadSymbols(text);
      try { localStorage.setItem('ep128web.dbgSyms', text.length < 2000000 ? text : ''); } catch (er) { }
      setMessage(f.name + ': ' + n + ' címke');
      dbgRefresh();
    };
    $('dbg-sym-clear').onclick = () => {
      dbgLoadSymbols('');
      try { localStorage.removeItem('ep128web.dbgSyms'); } catch (e) { }
      dbgRefresh();
    };
    const monIn = $('dbg-mon-in');
    monIn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        monHistPos = Math.max(0, Math.min(monHist.length, monHistPos + (e.key === 'ArrowUp' ? -1 : 1)));
        monIn.value = monHist[monHistPos] || '';
        return;
      }
      if (e.key !== 'Enter') return;
      const line = monIn.value;
      if (line.trim()) { monHist.push(line); if (monHist.length > 100) monHist.shift(); }
      monHistPos = monHist.length;
      monIn.value = '';
      try {
        if (monExec(line) === 'keep') return;
      } catch (er) {
        monPrint('Hiba: ' + er.message);
      }
    });
    $('dbg-script-lang').onchange = (e) => {
      dbgScriptLang = e.target.value;
      try {
        localStorage.setItem('ep128web.dbgScriptLang', dbgScriptLang);
        $('dbg-script').value = localStorage.getItem('ep128web.dbgScript' + (dbgScriptLang === 'lua' ? 'Lua' : '')) || '';
      } catch (er) { }
      dbgScriptLangUi();
    };
    $('dbg-script-run').onclick = () => {
      const code = $('dbg-script').value;
      try { localStorage.setItem('ep128web.dbgScript' + (dbgScriptLang === 'lua' ? 'Lua' : ''), code); } catch (e) { }
      if (dbgScriptLang === 'lua') {
        // the Lua scripting of ep128emu: runs the script, its
        // breakPointCallback stays active until Stop
        const r = api.luaRun(code);
        dbgLuaPoll();
        dbgScriptLog(r === 1 ? '(breakPointCallback aktív)' : r === 0 ? '(kész)' : 'Hiba: ' + lastError());
        dbgRenderBps();
        dbgRefresh();
        return;
      }
      // an async function: the script can 'await' ep.wait / ep.until / ep.type
      const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
      let run;
      try {
        run = new AsyncFunction('ep', code);
      } catch (e) {
        dbgScriptLog('Hiba: ' + e.message);
        return;
      }
      run(ep).then((r) => {
        if (r !== undefined) dbgScriptLog(String(r));
        dbgRefresh();
      }, (e) => dbgScriptLog('Hiba: ' + (e && e.message || e)));
      dbgRefresh();
    };
    $('dbg-script-stop').onclick = dbgScriptStop;
    setupGfx();
    $('dbg-script-example').onchange = (e) => {
      const t = DBG_SCRIPT_EXAMPLES[e.target.value];
      e.target.value = '';
      if (!t) return;
      const box = $('dbg-script');
      if (box.value.trim() && !confirm('Lecseréled a szkriptet a példára?')) return;
      box.value = t;
    };
    $('dbg-script-save').onclick = () => {
      const blob = new Blob([$('dbg-script').value], { type: 'text/javascript' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'ep128web-szkript.' + (dbgScriptLang === 'lua' ? 'lua' : 'js');
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $('dbg-script-load').onclick = () => $('dbg-script-file').click();
    $('dbg-script-file').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) $('dbg-script').value = await f.text();
    };
    try { $('dbg-script').value = localStorage.getItem('ep128web.dbgScript' + (dbgScriptLang === 'lua' ? 'Lua' : '')) || ''; } catch (e) { }
    dbgScriptLangUi();
    // shortcuts while the focus is in the debugger
    $('debugger').addEventListener('keydown', (e) => {
      if (isTextInput(e.target)) return;
      const k = { F5: 'dbg-run', F10: 'dbg-over', F11: 'dbg-step', F4: 'dbg-cursor' }[e.code];
      if (k) {
        e.preventDefault();
        e.stopPropagation();
        $(k).click();
      } else if (e.code === 'F9' && dbgCursor >= 0) {
        e.preventDefault();
        e.stopPropagation();
        dbgToggleExecBp(dbgCursor);
      }
    });
    dbgApplyBps();
    let t = 'mon';
    try { t = localStorage.getItem('ep128web.dbgTab') || 'mon'; } catch (e) { }
    dbgSelectTab(t);
    monPrint('ep128emu monitor – ? = súgó');
    let on = false;
    try { on = localStorage.getItem('ep128web.debugger') === '1'; } catch (e) { }
    if (on) dbgShow(true);
  }

  // --------------------------------------------------------------------------
  // Main loop

  let lastTime = 0;
  let lastTapePos = -1;
  let tapeFast = true;
  let speedAccUs = 0, speedAccMs = 0;
  let audioLevelSmooth = -1;      // seconds of audio buffered, smoothed

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = lastTime ? now - lastTime : 16.7;
    lastTime = now;
    if (dt > 100) dt = 100;             // tab was in the background
    if (!ready || paused) return;
    if (dbgStopped) {
      // stopped in the debugger, until it continues (or a reset / new
      // machine / snapshot starts the machine again)
      if (api.dbgState()) return;
      dbgStopped = false;
      dbgRefresh();
    } else if (api.dbgState()) {
      dbgHandleStops();                 // a stop left from the last frame
      if (dbgStopped) return;
    }
    pollGamepads();

    let us = dt * 1000;
    if (audioRunning && !turbo) {
      // keep about 60 ms of audio buffered. The speed is only nudged (at most
      // 0.5 %, from a smoothed buffer level): bigger steps change the pitch
      // audibly, like a dragging tape. Only an almost empty buffer (e.g.
      // after the tab was in the background) gets a faster catch-up.
      const buffered = audioLevel / sampleRate;
      audioLevelSmooth = audioLevelSmooth < 0 ? buffered : audioLevelSmooth * 0.95 + buffered * 0.05;
      if (buffered < 0.01) us *= 1.03;
      else us *= 1 + Math.max(-0.005, Math.min(0.005, (0.06 - audioLevelSmooth) * 0.1));
    }
    us = Math.round(us);

    // fast tape loading: run at full speed while the tape is moving
    let tapeMoving = false;
    if (tapeName && tapeFast) {
      const pos = api.tapePosition();
      tapeMoving = (pos !== lastTapePos);
      lastTapePos = pos;
    }

    try {
      if (turbo || autoTask || tapeMoving) {
        // run as fast as possible within a fixed time budget per frame
        const t0 = performance.now();
        us = 0;
        do {
          const done = autoTask ? runAutoTask(20000) : 0;
          if (done < 20000) check(api.run(20000 - done), 'emuláció');
          api.audioClear();
          us += 20000;
        } while (performance.now() - t0 < 14 && !api.dbgState());
      } else {
        check(api.run(us), 'emuláció');
      }
    } catch (e) {
      // a WebAssembly error stops the emulator for good: say so
      console.error(e);
      paused = true;
      ready = false;
      $('btn-pause').classList.add('on');
      setMessage('Az emulátor hibára futott (' + String(e.message || e).slice(0, 80) +
                 ') – töltsd újra az oldalt. A pendrive tartalma megmarad.', true);
      return;
    }
    emulatedUs += us;
    dbgFrameTick(us);
    dbgHandleStops();
    if (!dbgStopped) dbgScriptFrame(us);
    // ep128emu runs the floppy drives' motor-off timer (and writes the
    // buffered track to the image) when it is asked for the LED state, once
    // per 2 ms timeslice, like its own VM thread does
    ledAccUs += us;
    for (let k = 0; ledAccUs >= 2000 && k < 1000; k++) {
      ledAccUs -= 2000;
      ledState = api.ledState();
    }
    processKeyQueue();
    speedAccUs += us;
    speedAccMs += dt;

    // audio
    const nFrames = api.audioFrames();
    if (nFrames > 0 && audioRec) {
      // the full emulated sound, whatever the volume, mute or turbo
      const p = api.audioBuffer() >> 2;
      audioRec.chunks.push(M.HEAPF32.slice(p, p + nFrames * 2));
      audioRec.frames += nFrames;
    }
    if (nFrames > 0) {
      if (audioRunning && !turbo && !autoTask && !tapeMoving && audioNode) {
        const p = api.audioBuffer() >> 2;
        const samples = M.HEAPF32.slice(p, p + nFrames * 2);
        if (outGain < 1) for (let i = 0; i < samples.length; i++) samples[i] *= outGain;
        audioNode.port.postMessage(samples);
      }
      api.audioClear();
    }

    // video
    const fc = api.frameCount();
    if (fc !== lastFrameCount) {
      lastFrameCount = fc;
      const p = api.frameBuffer();
      imageData.data.set(M.HEAPU8.subarray(p, p + imageData.data.length));
      ctx.putImageData(imageData, -cropX, 0);
      if (videoRec) drawRecCanvas();
    }

    if (speedAccMs >= 500) {
      $('st-speed').textContent = 'Sebesség: ' + Math.round(speedAccUs / speedAccMs / 10) + '%';
      speedAccUs = 0;
      speedAccMs = 0;
      updateStatus();
    }
  }

  function updateStatus() {
    if (tapeName) {
      const pos = api.tapePosition(), len = api.tapeLength();
      const fmt = (t) => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
      $('st-tape').textContent = 'Magnó: ' + fmt(pos) + ' / ' + fmt(len);
    } else {
      $('st-tape').textContent = '';
    }
  }

  // --------------------------------------------------------------------------

  async function main() {
    // the build id makes the browser fetch the new .wasm after an update
    const buildMeta = document.querySelector('meta[name="build"]');
    const buildV = buildMeta && !buildMeta.content.startsWith('__') ? buildMeta.content : '';
    M = await createEp128Module({
      locateFile: (path, prefix) => prefix + path + (buildV ? '?v=' + buildV : ''),
      print: (s) => console.log(s),
      printErr: (s) => console.warn(s)
    });
    const c = (name, ret, args) => M.cwrap(name, ret, args);
    // a new program / machine state: the debugger cannot step back past it
    const newState = (f) => (...a) => { dbgUndoClear(); return f(...a); };
    api = {
      lastError: c('ep_last_error', 'number', []),
      init: c('ep_init', 'number', ['number']),
      setMachineType: newState(c('ep_set_machine_type', 'number', ['number'])),
      fileMachineType: c('ep_file_machine_type', 'number', ['string']),
      resetMemory: c('ep_reset_memory', 'number', ['number']),
      loadRom: c('ep_load_rom', 'number', ['number', 'string', 'number']),
      reset: newState(c('ep_reset', 'number', ['number'])),
      run: c('ep_run', 'number', ['number']),
      setKey: c('ep_set_key', null, ['number', 'number']),
      frameBuffer: c('ep_frame_buffer', 'number', []),
      frameCount: c('ep_frame_count', 'number', []),
      frameWidth: c('ep_frame_width', 'number', []),
      frameHeight: c('ep_frame_height', 'number', []),
      audioBuffer: c('ep_audio_buffer', 'number', []),
      audioFrames: c('ep_audio_frames', 'number', []),
      audioClear: c('ep_audio_clear', null, []),
      setVolume: c('ep_set_volume', null, ['number']),
      loadSnapshot: newState(c('ep_load_snapshot', 'number', ['string'])),
      loadSnapshotKeepUndo: c('ep_load_snapshot', 'number', ['string']),
      saveSnapshot: c('ep_save_snapshot', 'number', ['string']),
      setDisk: c('ep_set_disk', 'number', ['number', 'string']),
      setTape: c('ep_set_tape', 'number', ['string']),
      tapeCommand: c('ep_tape_command', 'number', ['number']),
      tapePosition: c('ep_tape_position', 'number', []),
      tapeLength: c('ep_tape_length', 'number', []),
      ledState: c('ep_led_state', 'number', []),
      readMemory: c('ep_read_memory', 'number', ['number']),
      writeMemory: c('ep_write_memory', null, ['number', 'number']),
      unpackRoms: c('ep_unpack_rom_package', 'number', ['string', 'string']),
      setTvcSlot: c('ep_set_tvc_slot', null, ['number', 'number']),
      loadTvcCardFlash: c('ep_load_tvc_card_flash', 'number', ['string']),
      cardPutFile: c('ep_tvc_card_put_file', 'number', ['string', 'string']),
      setMouse: c('ep_set_mouse', null, ['number', 'number', 'number', 'number']),
      cardUsb: c('ep_tvc_card_usb', 'number', ['number']),
      cardSelectDrive: c('ep_tvc_card_select_drive', null, ['number']),
      usbList: c('ep_usb_list', 'string', ['string']),
      usbPut: c('ep_usb_put', 'number', ['string', 'string']),
      usbGet: c('ep_usb_get', 'number', ['string', 'string']),
      usbMkdir: c('ep_usb_mkdir', 'number', ['string']),
      usbDelete: c('ep_usb_delete', 'number', ['string']),
      usbChdir: c('ep_usb_chdir', 'number', ['string']),
      usbInfo: c('ep_usb_info', 'number', ['number']),
      setTvcExtJoy: c('ep_set_tvc_ext_joy', null, ['number', 'number']),
      set2dfx: c('ep_set_2dfx', null, ['number']),
      dbgState: c('ep_dbg_state', 'number', []),
      dbgInfo: c('ep_dbg_info', 'string', []),
      dbgPause: c('ep_dbg_pause', null, []),
      dbgContinue: c('ep_dbg_continue', null, []),
      dbgStep: c('ep_dbg_step', null, []),
      dbgRunTo: c('ep_dbg_run_to', null, ['number']),
      dbgSetBp: c('ep_dbg_set_bp', null, ['number', 'number']),
      dbgClearBps: c('ep_dbg_clear_bps', null, []),
      dbgWatchClear: c('ep_dbg_watch_clear', null, []),
      dbgWatchAdd: c('ep_dbg_watch_add', null, ['number', 'number', 'number', 'number']),
      dbgRegs: c('ep_dbg_regs', 'string', []),
      dbgSetReg: c('ep_dbg_set_reg', null, ['number', 'number']),
      dbgDisasm: c('ep_dbg_disasm', 'string', ['number', 'number']),
      dbgMem: c('ep_dbg_mem', 'number', ['number', 'number', 'number']),
      dbgPoke: c('ep_dbg_poke', null, ['number', 'number', 'number']),
      dbgMemValid: c('ep_dbg_mem_valid', 'number', ['number']),
      dbgAssemble: c('ep_dbg_assemble', 'number', ['string']),
      dbgIoRegs: c('ep_dbg_io_regs', 'string', []),
      dbgOut: c('ep_dbg_out', null, ['number', 'number']),
      dbgHistoryEnable: c('ep_dbg_history_enable', null, ['number']),
      dbgHistory: c('ep_dbg_history', 'string', ['number']),
      dbgProfileEnable: c('ep_dbg_profile_enable', null, ['number']),
      dbgProfileClear: c('ep_dbg_profile_clear', null, []),
      dbgProfile: c('ep_dbg_profile', 'number', []),
      dbgIoLogEnable: c('ep_dbg_iolog_enable', null, ['number']),
      luaRun: c('ep_lua_run', 'number', ['string']),
      luaStop: c('ep_lua_stop', null, []),
      luaActive: c('ep_lua_active', 'number', []),
      luaOutput: c('ep_lua_output', 'string', []),
      dbgIoLog: c('ep_dbg_iolog', 'string', ['number']),
      dbg2dfx: c('ep_dbg_2dfx', 'string', []),
      dbgCard256: c('ep_dbg_card256', 'string', []),
      dbgSound: c('ep_dbg_sound', 'string', [])
    };
    for (const d of ['/roms', '/files', '/tmp', '/disk', '/diskb', '/tape']) ensureDir(d);

    await setupAudio();
    check(api.init(sampleRate), 'indítás');

    const w = api.frameWidth(), h = api.frameHeight();
    canvas.width = w;
    canvas.height = h;
    imageData = ctx.createImageData(w, h);
    updateScreenCrop();

    // ROMs: epfileio.rom ships with ep128emu (GPL); the rest come from the
    // user's ROM package, stored in IndexedDB, or from roms/ on the server
    for (const f of ['epfileio.rom', 'tvcfileio.rom']) {
      try {
        const r = await fetch(f);
        if (r.ok) M.FS.writeFile('/roms/' + f, new Uint8Array(await r.arrayBuffer()));
      } catch (e) { }
    }
    const stored = await db.getAll();
    for (const [key, value] of stored) {
      try {
        if (key === 'pkg') installROMPackage(value);
        else if (key.startsWith('rom:')) M.FS.writeFile('/roms/' + key.slice(4), value);
        else if (key === 'usbfiles') usbSaved = value;
        else if (key.startsWith('disk:')) restoreDisk(key, value);
        else if (key === 'cardflash') {
          try { M.FS.mkdir('/card'); } catch (e) { }
          M.FS.writeFile('/card/flash.bin', value);
          cardFlashLoaded = (api.loadTvcCardFlash('/card/flash.bin') === 0);
        }
      } catch (e) { console.warn(e); }
    }
    if (!fileExists('/roms/exos21.rom')) {
      const romUrls = [
        'https://tvc.homeserver.hu/dl.php?file=ep128emu_roms-2.0.11.bin',
        'roms/ep128emu_roms-2.0.11.bin'
      ];
      for (const url of romUrls) {
        try {
          const r = await fetch(url);
          if (r.ok) {
            const buf = new Uint8Array(await r.arrayBuffer());
            installROMPackage(buf);
            db.put('pkg', buf);
            break;
          }
        } catch (e) { }
      }
    }

    restoreDiskActive();
    renderDrives();

    let id = null;
    try { id = localStorage.getItem('ep128web.machine'); } catch (e) { }
    id = MACHINE_ALIASES[id] || id;
    machine = MACHINES.find((m) => m.id === id) || MACHINES.find((m) => m.id === DEFAULT_TVC);
    if (machine.type === 1 && !machine.cart) userTvc = machine.id;
    setupUI();
    listFiles();
    applyMachine(machine);
    if (audioCtx && audioCtx.state !== 'running') $('click-hint').hidden = false;
    else resumeAudio();
    canvas.focus({ preventScroll: true });
    requestAnimationFrame(frame);
  }

  main().catch((e) => {
    console.error(e);
    setMessage('Hiba: ' + (e.message || e), true);
  });
})();
