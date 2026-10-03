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
      id: 'tvc64p-22-vtdos', type: 1, name: 'TVC 64k+ · BASIC 2.2 · VT-DOS', ram: 128,
      roms: [['tvc22_sys.rom', [0x00]], ['tvc22_ext.rom', [0x02]],
             ['tvc_dos12d.rom', [0x03]]]
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
  const JOY_KEYMAP = {
    ArrowRight: 0x70, ArrowLeft: 0x71, ArrowDown: 0x72, ArrowUp: 0x73,
    ControlRight: 0x74
  };
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
      m[c.toUpperCase()] = [letters[c], false];
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
    return m;
  })();
  const CHARMAP_TVC = (() => {
    const m = Object.assign({}, CHARMAP_EP);
    m.y = m.Y = [0x06, false];
    m.z = m.Z = [0x12, false];
    m['0'] = [0x4B, false];
    m[':'] = [0x44, true];
    m['-'] = [0x43, false];
    delete m['/'];
    delete m[';'];
    return m;
  })();
  const CHARMAP = [CHARMAP_EP, CHARMAP_TVC];

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
  let tvcFileIO = true;         // TVC: FILE: device instead of cassette

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
    if (m.type === 1 && tvcFileIO)
      return m.roms.concat([['tvcfileio.rom', [0x04]]]);
    return m.roms;
  }

  function missingROMs(m) {
    return machineROMs(m).map((r) => r[0]).filter((f) => !fileExists('/roms/' + f));
  }

  let machineType = 0;

  function applyMachine(m, coldReset) {
    machine = m;
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
    if (coldReset !== false)
      api.reset(1);
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

  function keyDown(code) {
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
    return KEYMAP[e.code];
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
    if (code === undefined) return;
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

  let padState = 0;
  function pollGamepads() {
    if (!navigator.getGamepads) return;
    let state = 0;
    let name = '';
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      name = gp.id;
      const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      const b = (i) => gp.buttons[i] && gp.buttons[i].pressed;
      if (ax > 0.5 || b(15)) state |= 1;      // right
      if (ax < -0.5 || b(14)) state |= 2;     // left
      if (ay > 0.5 || b(13)) state |= 4;      // down
      if (ay < -0.5 || b(12)) state |= 8;     // up
      if (b(0) || b(1) || b(2) || b(3)) state |= 16;
      break;
    }
    if (state !== padState) {
      const codes = [0x70, 0x71, 0x72, 0x73, 0x74];
      codes.forEach((c, i) => {
        const bit = 1 << i;
        if ((state & bit) && !(padState & bit)) api.setKey(c, 1);
        else if (!(state & bit) && (padState & bit)) api.setKey(c, 0);
      });
      padState = state;
    }
    $('pad-status').textContent = name ? 'Gamepad: ' + name : '';
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

  function startAutostart(command, onTyped) {
    releaseAllKeys();
    api.reset(1);
    autoTask = {
      // the TVC starts BASIC directly, the Enterprise shows a logo first
      phase: machine.type === 1 ? 'basic' : 'boot',
      t: 0, phaseT: 0, dark: false, stable: 0,
      command, onTyped, events: null, wait: 0
    };
    setMessage('Indítás…');
  }

  // returns the number of microseconds to emulate before calling again,
  // or 0 when the task is finished
  function stepAutoTask() {
    const a = autoTask;
    const phaseTime = a.t - a.phaseT;
    if (a.phase === 'boot') {
      // wait for the end of the memory test: the ENTERPRISE logo appears in
      // the middle of the (previously black) screen
      const v = screenActivity(120, 200);
      if (v < 100) a.dark = true;
      if ((a.dark && v > 300 && v < 4000) || phaseTime > 40e6) {
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
      return delay;
    }
    if (a.phase === 'logo') {
      a.phase = 'basic';
      a.phaseT = a.t;
      return 20000;
    }
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

  async function loadFile(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const name = file.name;
    const ext = (name.match(/\.([^.]+)$/) || ['', ''])[1].toLowerCase();

    // ROM package or individual ROM image
    if ((ext === 'bin' && bytes.length > 100000 && /rom/i.test(name)) || ext === 'rom') {
      if (ext === 'rom') {
        const romName = name.toLowerCase();
        M.FS.writeFile('/roms/' + romName, bytes);
        db.put('rom:' + romName, bytes);
        setMessage('ROM betöltve: ' + romName);
      } else {
        const n = check(installROMPackage(bytes), 'ROM-csomag');
        db.put('pkg', bytes);
        setMessage(n + ' ROM kicsomagolva');
      }
      if (!ready || machine && missingROMs(machine).length === 0)
        applyMachine(machine);
      return;
    }
    if (!ready) {
      setMessage('Először a ROM-okat kell betölteni', true);
      return;
    }

    switch (ext) {
    case 'ep128s':
    case 'ep128d':
    case 'ep128s2':
      M.FS.writeFile('/tmp/snapshot', bytes);
      {
        // switch to the machine type the snapshot was saved from
        const type = api.fileMachineType('/tmp/snapshot');
        if (type >= 0 && type !== machineType) {
          const m = MACHINES.find((x) => x.type === type);
          if (missingROMs(m).length === 0) {
            applyMachine(m);
            $('machine').value = m.id;
          } else {
            check(api.setMachineType(type), 'gép');
            machineType = type;
            machine = m;
            $('machine').value = m.id;
            applyVolume();
          }
        }
        check(api.loadSnapshot('/tmp/snapshot'), 'pillanatkép');
      }
      setMessage((ext === 'ep128d' ? 'Demó: ' : 'Pillanatkép: ') + name);
      return;
    case 'tap':
    case 'wav':
    case 'tzx':
    case 'cdt':
      ensureDir('/tape');
      tapeName = sanitizeName(name);
      M.FS.writeFile('/tape/' + tapeName, bytes);
      check(api.setTape('/tape/' + tapeName), 'kazetta');
      $('tape-name').textContent = name;
      setMessage('Kazetta betöltve – indítás…');
      if (machine.type === 1) {
        // tvcfileio.rom replaces the cassette device: remove it
        if (tvcFileIO) {
          tvcFileIO = false;
          applyMachine(machine);
        }
        startAutostart('load\n', () => api.tapeCommand(1));
      } else {
        startAutostart('load "tape:"\n', () => api.tapeCommand(1));
      }
      return;
    case 'img':
    case 'dsk':
      ensureDir('/disk');
      diskName = sanitizeName(name);
      M.FS.writeFile('/disk/' + diskName, bytes);
      check(api.setDisk(0, '/disk/' + diskName), 'lemez');
      $('disk-name').textContent = name;
      if (machine.type === 1) {
        if (!machine.roms.some((r) => r[0].startsWith('tvc_dos')))
          setMessage('A lemezhez VT-DOS-os TVC-t válassz!', true);
        else
          setMessage('Lemez az A: meghajtóban');
      } else if (!machine.roms.some((r) => r[0].startsWith('exdos'))) {
        setMessage('A lemezhez EXDOS-os gépet válassz!', true);
      } else {
        setMessage('Lemez az A: meghajtóban (pl. :dir, load "a:név")');
      }
      return;
    default: {
      if (machine.type === 1) {
        // TVC: programs are .cas files, loaded through tvcfileio.rom
        const base = sanitizeName(name.replace(/\.[^.]*$/, '')).replace(/\./g, '-') || 'program';
        M.FS.writeFile('/files/' + base + '.cas', bytes);
        listFiles();
        if (!tvcFileIO) {
          tvcFileIO = true;
          applyMachine(machine);
        }
        startAutostart('load "' + base + '"\nrun\n', null);
        return;
      }
      const fname = sanitizeName(name);
      M.FS.writeFile('/files/' + fname, bytes);
      listFiles();
      const cmd = (ext === 'bas' ? 'run "file:' : 'load "file:') + fname + '"\n';
      startAutostart(cmd, null);
    }
    }
  }

  async function loadFiles(files) {
    resumeAudio();
    // ROMs first, so that a ROM package and a program can be dropped together
    const list = Array.from(files).sort((a, b) =>
      (/\.(rom|bin)$/i.test(b.name) ? 1 : 0) - (/\.(rom|bin)$/i.test(a.name) ? 1 : 0));
    for (const f of list) {
      try {
        await loadFile(f);
      } catch (e) {
        console.error(e);
        if (!statusMsg.textContent) setMessage(String(e.message || e), true);
      }
    }
    canvas.focus();
  }

  // --------------------------------------------------------------------------
  // UI

  function applyVolume() {
    const v = Number($('volume').value) / 100;
    api.setVolume(v * v);
  }

  function reset(cold) {
    if (!ready) return;
    autoTask = null;
    releaseAllKeys();
    api.reset(cold ? 1 : 0);
    resumeAudio();
    canvas.focus();
  }

  function toggleTurbo() {
    turbo = !turbo;
    $('btn-turbo').classList.toggle('on', turbo);
  }

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
    $('btn-full').onclick = () => {
      const el = $('screen-wrap');
      if (document.fullscreenElement) document.exitFullscreen();
      else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
      canvas.focus();
    };
    $('btn-snap').onclick = () => {
      if (!ready) return;
      check(api.saveSnapshot('/tmp/save.ep128s'), 'mentés');
      download(M.FS.readFile('/tmp/save.ep128s'), 'ep128-' +
               new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.ep128s');
    };
    $('volume').oninput = (e) => {
      applyVolume();
      try { localStorage.setItem('ep128web.volume', e.target.value); } catch (er) { }
    };
    try {
      const v = localStorage.getItem('ep128web.volume');
      if (v !== null) $('volume').value = v;
    } catch (e) { }
    $('volume').oninput({ target: $('volume') });

    $('file-any').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };
    $('file-roms').onchange = (e) => { loadFiles(e.target.files); e.target.value = ''; };

    $('tape-play').onclick = () => { if (tapeName) api.tapeCommand(1); canvas.focus(); };
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
    $('tape-fast').onchange = (e) => { tapeFast = e.target.checked; canvas.focus(); };
    $('arrows-joy').onchange = (e) => {
      releaseAllKeys();
      arrowsAsJoystick = e.target.checked;
      canvas.focus();
    };

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
  }

  // --------------------------------------------------------------------------
  // Main loop

  let lastTime = 0;
  let lastTapePos = -1;
  let tapeFast = true;
  let speedAccUs = 0, speedAccMs = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    let dt = lastTime ? now - lastTime : 16.7;
    lastTime = now;
    if (dt > 100) dt = 100;             // tab was in the background
    if (!ready || paused) return;
    pollGamepads();

    let us = dt * 1000;
    if (audioRunning && !turbo) {
      // keep about 60 ms of audio buffered: run slightly faster or slower
      const buffered = audioLevel / sampleRate;
      if (buffered < 0.04) us *= 1.1;
      else if (buffered > 0.1) us *= 0.9;
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
      console.error(e);
      paused = true;
      $('btn-pause').classList.add('on');
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
    M = await createEp128Module({
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
      unpackRoms: c('ep_unpack_rom_package', 'number', ['string', 'string'])
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
      } catch (e) { console.warn(e); }
    }
    if (!fileExists('/roms/exos21.rom')) {
      try {
        const r = await fetch('roms/ep128emu_roms-2.0.11.bin');
        if (r.ok) installROMPackage(new Uint8Array(await r.arrayBuffer()));
      } catch (e) { }
    }

    let id = null;
    try { id = localStorage.getItem('ep128web.machine'); } catch (e) { }
    machine = MACHINES.find((m) => m.id === id) || MACHINES[0];
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
