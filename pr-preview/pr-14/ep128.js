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
    }
  ];
  for (const m of MACHINES) m.type = m.type || 0;
  // machine ids of earlier versions (VT-DOS is a card in a slot now)
  const MACHINE_ALIASES = { 'tvc64p-22-vtdos': 'tvc64p-22', 'tvc64-12-vtdos': 'tvc64-12' };

  // TVC expansion cards; the ids are those of ep_set_tvc_slot()
  const SLOT_EMPTY = 0, SLOT_VTDOS = 1, SLOT_FILEIO = 2, SLOT_CARD256 = 5;
  const TVC_CARDS = [
    { id: SLOT_EMPTY, name: '— üres —' },
    { id: SLOT_VTDOS, name: 'VT-DOS (lemez)', rom: 'tvc_dos12d.rom', seg: 0x03 },
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
    // external joystick 1
    Numpad6: 0x70, Numpad4: 0x71, Numpad2: 0x72, Numpad8: 0x73, Numpad0: 0x74,
    Numpad5: 0x72
  };
  const KEYMAP_TVC = Object.assign({}, KEYMAP, {
    Escape: 0x38, IntlBackslash: 0x1F, End: undefined, Pause: undefined
  });
  const JOY_KEYMAP = {
    ArrowRight: 0x70, ArrowLeft: 0x71, ArrowDown: 0x72, ArrowUp: 0x73,
    ControlRight: 0x74
  };
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
    m.y = m.Y = [0x06, false];
    m.z = m.Z = [0x12, false];
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
  const CHARMAP = [CHARMAP_EP, CHARMAP_TVC];
  const PAUSE = '\u0001';      // in autotyped text: wait 2.5 seconds
  const PRESS_ESC = '\u0002';  // in autotyped text: press the TVC ESC key

  function isTypable(text, type) {
    return Array.from(text).every((ch) => CHARMAP[type][ch]);
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
  const pressedKeys = new Set();
  let arrowsAsJoystick = false;
  let tapeName = '';
  let diskName = '';
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
    // a card can only be in one slot
    return v.every((c, i) => c === SLOT_EMPTY || v.indexOf(c) === i);
  }

  function tvcSlotOf(card) {
    return tvcSlots.indexOf(card);
  }

  // value of the cassette device redirect ($0B05/$0B0D) that points at the
  // slot of a card, or 0 if the card is not installed
  // device for the LOAD / RUN buttons: the TVC256k++ card if present, else FILE:
  function defaultTvcLoadRedirect() {
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

  function applyTvcSlots() {
    if (api && api.setTvcSlot) tvcSlots.forEach((card, slot) => api.setTvcSlot(slot, card));
    applyTvcUsb();
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
    canvas.focus();
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
    if (m.type === 1 && cartridgeName && fileExists('/roms/' + cartridgeName))
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
    if (nameEl) nameEl.textContent = cartridgeName || 'nincs modul';
    updateTvcCardsUI();
  }

  function updateTvcCardsUI() {
    const grp = $('tvc-cards-group');
    if (grp) grp.hidden = !(machine && machine.type === 1);
    renderUsb();
  }

  function ejectCartridge() {
    if (!cartridgeName) return;
    cartridgeName = '';
    if (machine && machine.type === 1) {
      check(api.loadRom(1, '', 0), 'cartridge');
      api.reset(1);
      keyedSinceReset = false;
    }
    updateCartridgeUI();
    setMessage('Cartridge eltávolítva');
    canvas.focus();
  }

  function loadCartridgeFile(f) {
    if (machine.type !== 1) {
      const tvc = MACHINES.find((x) => x.id === 'tvc64p-22') || MACHINES.find((x) => x.type === 1);
      if (tvc) applyMachine(tvc);
    }
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
    const sel = $('machine');
    if (sel && sel.value !== m.id) sel.value = m.id;
    updateLoadButton();
    updateCatalogVisibility();
    if (m.type !== 1) {
      cartridgeName = '';
    }
    updateCartridgeUI();
    updateMouseButton();
    if (vkbdType >= 0) renderKeyboard();
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
    if (m.type === 1) applyTvcSlots();   // before the reset: the TVC OS detects the cards at boot
    if (coldReset !== false) {
      api.reset(1);
      keyedSinceReset = false;
    }
    ready = true;
    try { localStorage.setItem('ep128web.machine', m.id); } catch (e) { }
    setMessage('');
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
    if (arrowsAsJoystick && JOY_KEYMAP[e.code] !== undefined)
      return JOY_KEYMAP[e.code];
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
        if (pIdx === 0) {
          const codes = [0x70, 0x71, 0x72, 0x73, 0x74];
          codes.forEach((c, i) => {
            const bit = 1 << i;
            if ((state & bit) && !(padState[0] & bit)) api.setKey(c, 1);
            else if (!(state & bit) && (padState[0] & bit)) api.setKey(c, 0);
          });
        } else if (pIdx === 1) {
          const codes = [0x78, 0x79, 0x7A, 0x7B, 0x7C];
          codes.forEach((c, i) => {
            const bit = 1 << i;
            if ((state & bit) && !(padState[1] & bit)) api.setKey(c, 1);
            else if (!(state & bit) && (padState[1] & bit)) api.setKey(c, 0);
          });
        } else if (pIdx === 2 || pIdx === 3) {
          if (api && api.setTvcExtJoy) {
            let extByte = 0xFF;
            if (state & 8) extByte &= ~1;   // up
            if (state & 4) extByte &= ~2;   // down
            if (state & 2) extByte &= ~4;   // left
            if (state & 1) extByte &= ~8;   // right
            if (state & 16) extByte &= ~16; // fire
            api.setTvcExtJoy(pIdx - 2, extByte);
          }
        }
        padState[pIdx] = state;
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
      const k = CHARMAP[machine.type][ch];
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
      if (a.stable >= 25 || phaseTime > 15e6) {
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
    let base = name.toLowerCase().replace(/[^a-z0-9.\-]/g, '');
    if (!base || base[0] === '.') base = 'file' + base;
    return base.slice(0, 28);
  }

  function ensureDir(path) {
    try { M.FS.mkdir(path); } catch (e) { }
  }

  function listFiles() {
    const names = M.FS.readdir('/files').filter((n) => n !== '.' && n !== '..');
    $('files-list').textContent = names.length ? names.join(', ') : 'üres';
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
      const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
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

  function loadDiskFile(f) {
    ensureDir('/disk');
    diskName = sanitizeName(f.name);
    M.FS.writeFile('/disk/' + diskName, f.bytes);
    $('disk-name').textContent = f.name;
    if (machine.type === 1) {
      if (tapeName) {
        api.setTape('');
        tapeName = '';
        $('tape-name').textContent = 'nincs kazetta';
      }
      check(api.setDisk(0, '/disk/' + diskName), 'lemez');
      if (tvcSlotOf(SLOT_VTDOS) < 0) {
        setMessage('A lemezhez tegyél VT-DOS kártyát egy bővítőportba (Bővítőportok)', true);
        return;
      }
      setMessage('Lemez az A: meghajtóban – VT-DOS indítása…');
      // the VT-DOS commands (EXT 2) need the default device to be the DOS
      startAutostart('ext 2\n' + PAUSE + 'dir\n' + PAUSE + PRESS_ESC, null, false,
                     tvcRedirectFor(SLOT_VTDOS));
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
      canvas.focus();
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
    // the card has one USB port: with the pendrive plugged in, no mouse
    btn.disabled = usbPlugged;
    btn.title = usbPlugged ? 'A kártya egyetlen USB-portjában a pendrive van (húzd ki az egérhez)'
                           : 'Egér a TVC256k++ kártyának (kilépés: Esc)';
    if (usbPlugged && document.pointerLockElement === canvas) document.exitPointerLock();
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
      b.onclick = () => { box.hidden = true; startProgram(n); canvas.focus(); };
      list.appendChild(b);
    }
    box.hidden = false;
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
        canvas.focus();
      };
      list.appendChild(b);
    }

    for (const f of wavFiles) {
      const b = document.createElement('button');
      b.textContent = '📼 WAV: ' + f.name;
      b.onclick = () => {
        box.hidden = true;
        onChoose('wav', f);
        canvas.focus();
      };
      list.appendChild(b);
    }

    box.hidden = false;
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
    canvas.focus();
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
        const tvc = MACHINES.find((x) => x.id === 'tvc64p-22') || MACHINES.find((x) => x.type === 1);
        if (tvc) applyMachine(tvc);
      }
    }

    // all other files go to the FILE: directory, so that programs which
    // load further files at run time find them there
    const startable = storeProgramFiles(progFiles);
    if (snapshots.length) {
      loadSnapshotFile(snapshots[0]);
    } else if (disks.length) {
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
       ['DEL', 0x2E, '', 'mod', 1.4]],
      [['ESC', 0x38, '', 'mod', 1.3]].concat(
        L('qwertzuiop', [0x11, 0x16, 0x15, 0x13, 0x14, 0x12, 0x10, 0x48, 0x4A, 0x4C]),
        [['Ő', 0x4D], ['Ú', 0x36]]),
      [['LOCK', 0x09, '', 'mod', 1.5]].concat(
        L('asdfghjkl', [0x0E, 0x0D, 0x0B, 0x0C, 0x0A, 0x08, 0x30, 0x32, 0x34]),
        [['É', 0x33], ['Á', 0x35], ['Ű', 0x01], ['RETURN', 0x3E, '', 'mod', 1.8]]),
      [['SHIFT', 0x07, '', 'mod sticky', 1.7]].concat(
        L('yxcvbnm', [0x06, 0x05, 0x03, 0x04, 0x02, 0x00, 0x40]),
        [[',', 0x42, '?'], ['.', 0x44, ':'], ['-', 0x43, '_'],
         ['SHIFT', 0x45, '', 'mod sticky', 1.7]]),
      [['CTRL', 0x0F, '', 'mod sticky', 1.2], ['ALT', 0x3F, '', 'mod sticky', 1.1],
       ['@', 0x27, '`'], [';', 0x17, '$'], ['SPACE', 0x46, '', '', 4.5],
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
    $('typer').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = $('typer-input');
      if (autoTask) return;
      typeText(inp.value + '\n');
      inp.value = '';
    });
    $('tb-full').onclick = toggleFullscreen;
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
        ? 'Egy kártya csak egy portban lehet.'
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
    $('tvc-slots-apply').onclick = () => {
      const p = pending();
      if (!validTvcSlots(p)) { update(); return; }
      tvcSlots = p;
      try { localStorage.setItem('ep128web.tvcSlots', JSON.stringify(tvcSlots)); } catch (e) { }
      update();
      if (machine.type === 1) {
        autoTask = null;
        releaseAllKeys();
        applyMachine(machine);        // loads the card ROMs, cold reset
      }
      canvas.focus();
    };
    $('tvc-slots-default').onclick = () => {
      selects.forEach((sel, i) => { sel.value = String(TVC_DEFAULT_SLOTS[i]); });
      update();
    };
    update();
  }

  let muted = false;
  try { muted = localStorage.getItem('ep128web.muted') === '1'; } catch (e) { }

  function applyVolume() {
    const v = muted ? 0 : Number($('volume').value) / 100;
    api.setVolume(v * v);
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
    canvas.focus();
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
    for (const t of types) {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      sel.appendChild(opt);
    }
    if (types.includes(current)) sel.value = current;
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
      const typeOk = !type || entry.type === type;
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
      autoTask = null;
      releaseAllKeys();
      applyMachine(m);
      canvas.focus();
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
        setTvcRedirect(tapeName ? 5 : defaultTvcLoadRedirect());
      typeText('load"*"\n');
      canvas.focus();
    };
    const btnRun = $('btn-run');
    if (btnRun) btnRun.onclick = () => {
      if (machine.type === 1)
        setTvcRedirect(tapeName ? 5 : defaultTvcLoadRedirect());
      typeText('run\n');
      canvas.focus();
    };
    $('btn-full').onclick = () => { toggleFullscreen(); canvas.focus(); };
    setupMouse();
    setupUsbUI();
    $('btn-snap').onclick = () => {
      if (!ready) return;
      check(api.saveSnapshot('/tmp/save.ep128s'), 'mentés');
      download(M.FS.readFile('/tmp/save.ep128s'), 'ep128-' +
               new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.ep128s');
    };
    $('btn-mute').onclick = () => { toggleMute(); canvas.focus(); };
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
    $('chooser-cancel').onclick = () => { $('chooser').hidden = true; canvas.focus(); };
    $('file-any').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    const fileGames = $('file-games');
    if (fileGames) fileGames.onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    $('file-roms').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };

    $('tape-play').onclick = () => {
      if (tapeName) {
        if (machine.type === 1) writeMemory(2821, 5);
        api.tapeCommand(1);
      }
      canvas.focus();
    };
    $('tape-stop').onclick = () => { if (tapeName) api.tapeCommand(0); canvas.focus(); };
    $('tape-rew').onclick = () => { if (tapeName) api.tapeCommand(2); canvas.focus(); };
    $('tape-rec').onclick = () => { if (tapeName) api.tapeCommand(3); canvas.focus(); };
    $('tape-new').onclick = () => {
      tapeName = 'tape-' + Date.now().toString(36) + '.tap';
      check(api.setTape('/tape/' + tapeName), 'kazetta');
      $('tape-name').textContent = tapeName + ' (üres)';
      canvas.focus();
    };
    $('tape-save').onclick = () => {
      if (!tapeName) return;
      api.setTape('');                  // flush and close the tape file
      download(M.FS.readFile('/tape/' + tapeName), tapeName);
      check(api.setTape('/tape/' + tapeName), 'kazetta');
    };
    $('disk-eject').onclick = () => {
      api.setDisk(0, '');
      diskName = '';
      $('disk-name').textContent = 'nincs lemez';
      canvas.focus();
    };
    $('disk-save').onclick = () => {
      if (!diskName) return;
      api.setDisk(0, '');               // flush and close the image file
      download(M.FS.readFile('/disk/' + diskName), diskName);
      api.setDisk(0, '/disk/' + diskName);
    };
    $('files-clear').onclick = () => {
      for (const n of M.FS.readdir('/files'))
        if (n !== '.' && n !== '..') M.FS.unlink('/files/' + n);
      listFiles();
    };
    const cartEject = $('cart-eject');
    if (cartEject) cartEject.onclick = ejectCartridge;
    $('tape-fast').onchange = (e) => { tapeFast = e.target.checked; canvas.focus(); };
    $('arrows-joy').onchange = (e) => {
      releaseAllKeys();
      arrowsAsJoystick = e.target.checked;
      canvas.focus();
    };
    setupTvcSlotsUI();

    const wrap = $('screen-wrap');
    wrap.addEventListener('dragover', (e) => { e.preventDefault(); wrap.classList.add('drag'); });
    wrap.addEventListener('dragleave', () => wrap.classList.remove('drag'));
    wrap.addEventListener('drop', (e) => {
      e.preventDefault();
      wrap.classList.remove('drag');
      if (e.dataTransfer.files.length) loadFiles(e.dataTransfer.files);
    });
    canvas.addEventListener('pointerdown', () => { resumeAudio(); canvas.focus(); });
    document.addEventListener('pointerdown', resumeAudio, { once: true });
    setupCatalogUI();
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
        } while (performance.now() - t0 < 14);
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
    processKeyQueue();
    speedAccUs += us;
    speedAccMs += dt;

    // audio
    const nFrames = api.audioFrames();
    if (nFrames > 0) {
      if (audioRunning && !turbo && !autoTask && !tapeMoving && audioNode) {
        const p = api.audioBuffer() >> 2;
        audioNode.port.postMessage(M.HEAPF32.slice(p, p + nFrames * 2));
      }
      api.audioClear();
    }

    // video
    const fc = api.frameCount();
    if (fc !== lastFrameCount) {
      lastFrameCount = fc;
      const p = api.frameBuffer();
      imageData.data.set(M.HEAPU8.subarray(p, p + imageData.data.length));
      ctx.putImageData(imageData, 0, 0);
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
    api = {
      lastError: c('ep_last_error', 'number', []),
      init: c('ep_init', 'number', ['number']),
      setMachineType: c('ep_set_machine_type', 'number', ['number']),
      fileMachineType: c('ep_file_machine_type', 'number', ['string']),
      resetMemory: c('ep_reset_memory', 'number', ['number']),
      loadRom: c('ep_load_rom', 'number', ['number', 'string', 'number']),
      reset: c('ep_reset', 'number', ['number']),
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
      loadSnapshot: c('ep_load_snapshot', 'number', ['string']),
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
      setTvcExtJoy: c('ep_set_tvc_ext_joy', null, ['number', 'number'])
    };
    for (const d of ['/roms', '/files', '/tmp', '/disk', '/tape']) ensureDir(d);

    await setupAudio();
    check(api.init(sampleRate), 'indítás');

    const w = api.frameWidth(), h = api.frameHeight();
    canvas.width = w;
    canvas.height = h;
    imageData = ctx.createImageData(w, h);

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
        else if (key === 'cardflash') {
          try { M.FS.mkdir('/card'); } catch (e) { }
          M.FS.writeFile('/card/flash.bin', value);
          api.loadTvcCardFlash('/card/flash.bin');
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

    let id = null;
    try { id = localStorage.getItem('ep128web.machine'); } catch (e) { }
    id = MACHINE_ALIASES[id] || id;
    machine = MACHINES.find((m) => m.id === id) || MACHINES.find((m) => m.id === 'tvc64p-22');
    setupUI();
    listFiles();
    applyMachine(machine);
    if (audioCtx && audioCtx.state !== 'running') $('click-hint').hidden = false;
    else resumeAudio();
    canvas.focus();
    requestAnimationFrame(frame);
  }

  main().catch((e) => {
    console.error(e);
    setMessage('Hiba: ' + (e.message || e), true);
  });
})();
