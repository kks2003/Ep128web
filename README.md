# Ep128web – Enterprise 128 és Videoton TVC emulátor a böngészőben

Az [ep128emu](https://github.com/istvan-v/ep128emu) (Varga István) emulátor
WebAssembly-portja, Enterprise 128 és Videoton TVC géppel. Az emulációs mag
(Z80, NICK, DAVE, a TVC CRTC/videó, WD177x/EXDOS/VT-DOS, magnó, FILE: eszköz)
az eredeti, **változatlan** C++ forráskód, Emscriptennel
fordítva; csak a grafikus felület (FLTK) és a hangkimenet (PortAudio) helyére
került egy kis webes frontend (canvas + Web Audio).

## Használat

1. Nyisd meg az oldalt (lásd lent: GitHub Pages vagy helyi szerver).
2. Alapértelmezés szerint Videoton TVC 64k+ BASIC 2.2 indul; a gépválasztást
   az oldal megjegyzi.
3. Első indításkor kéri a ROM-okat: töltsd le az **ep128emu_roms-2.0.11.bin**
   csomagot ([enterpriseforever.com](https://enterpriseforever.com/letoltesek-downloads/egyeb-misc/msg61025/)
   vagy [ep128.hu](http://ep128.hu/Emu/ep128emu_roms-2.0.11.bin)), és húzd rá az
   oldalra. A böngésző eltárolja (IndexedDB), legközelebb már nem kell.
4. Programot betölteni a „Fájl betöltése…” gombbal vagy a képre húzással lehet,
   egyszerre több fájlt vagy egy `.zip` archívumot is:

TVC-játékok a [tvc.hu programletöltései](http://www.tvc.hu/html/programok.html)
közül választhatók. A játék letöltése után a „Letöltött játék indítása…” gombbal
válaszd ki a `.cas` fájlt vagy a `.zip` csomagot; a kiválasztott program
automatikusan elindul. A böngésző biztonsági korlátozásai miatt a weboldal
letöltését külön kell betölteni.

| Fájl | Mi történik |
| --- | --- |
| `.cas` (TVC) | TVC módban: FILE eszköz, automatikus `LOAD` + `RUN` |
| `.com`, `.bas`, egyéb | a `FILE:` eszközre kerül, a gép újraindul és automatikusan kiadja a `LOAD "FILE:név"` (BASIC-nél `RUN`) parancsot |
| `.tap`, `.wav` | magnóba kerül, automatikus `LOAD "TAPE:"` + lejátszás, betöltés közben turbó |
| `.img`, `.dsk` | A: lemezmeghajtó; TVC-n a 360 KiB és 720 KiB (nyers, 512 bájtos szektoros) képek is támogatottak; szükség esetén EXDOS-os Enterprise-ra / VT-DOS-os TVC-re vált, és kilistázza a lemezt (`:DIR`, ill. `EXT 2` + `DIR`) |
| `.zip`, több fájl | minden fájl a `FILE:` eszközre kerül; ha több indítható program van, választani lehet |
| `.ep128s` / `.ep128d` | ep128emu pillanatkép / demó |
| `.bin` (ROM-csomag), `.rom` | ROM-ok telepítése |

### Utántöltős programok

Az összes fájlt egyszerre kell feltenni (vagy egy ZIP-ben): ezek az eredeti
nevükön a `FILE:` eszközre kerülnek, így a program futás közben is betöltheti a
többit. Enterprise-on az automatikus indítás az alapértelmezett eszközt is a
betöltés módjához állítja (`:DEF_DEV_FILE`, `:DEF_DEV_TAPE`, `:DEF_DEV_DISK` –
az ep128emu `epfileio.rom` parancsai), így a többi rész FILE:-ról, szalagról
vagy lemezről jön. TVC-n a `tvcfileio.rom` maga a FILE eszköz alapértelmezetté
tétele, kazettánál és lemeznél pedig a natív eszköz marad.

Gépkonfigurációk:

- **Enterprise**: EP128 (UK/magyar) EXDOS-szal vagy csak magnóval, EP 640K
  EXOS 2.32-vel (UK/magyar), EP 2048K EXOS 2.4-gyel. Mindegyikben benne van az
  ep128emu `epfileio.rom` bővítése (`FILE:` eszköz).
- **Videoton TVC**: TVC 64k+ BASIC 2.2 (VT-DOS-szal is), TVC 64k és 32k
  BASIC 1.2. A `.cas` programok a `tvcfileio.rom` FILE eszközére kerülnek és
  automatikusan elindulnak (`LOAD "név"` + `RUN`). Mivel a TVC-n ez a bővítés
  helyettesíti a magnót (és ütközik a VT-DOS-szal), kazetta vagy lemezkép
  betöltésekor kikapcsol, `.cas` betöltésekor visszakapcsol. A billentyűzet a magyar PC-kiosztást
  követi (QWERTZ, `0` az `1` bal oldalán, `ö ü ó` a 9 után).

A pillanatképek (`.ep128s`) betöltésekor az oldal automatikusan a mentéskori
géptípusra (Enterprise/TVC) vált.

Enterprise-billentyűzet: Esc = ESC, Backspace = ERASE, Del = DEL, Ins = INS, End/Pause = STOP,
Home = HOLD, Alt = ALT, F1–F8 = funkciógombok, CapsLock = LOCK; F11 = reset,
Shift+F11 = hideg reset, F12 = turbó. Joystick 1: numerikus billentyűzet
(8/4/6/2 + 0 = tűz), gamepad, vagy nyilak + jobb Ctrl (kapcsolható).
TVC-n a PC Esc az ESC billentyűt, a magyar PC `í` billentyűje pedig az `í` karaktert adja.

### Mobilon

A kép alatti gombokkal kapcsolható:

- **Billentyűzet**: képernyő-billentyűzet a gép saját kiosztásával (Enterprise:
  F1–F8, STOP, HOLD, ERASE, ALT stb.; TVC: magyar QWERTZ ékezetes betűkkel).
  A SHIFT, CTRL és ALT egy koppintásra „ragad” a következő billentyűig;
  a billentyűk nyomva tarthatók (ismétlés, játékok).
- **Joystick**: érintős iránykereszt (8 irány) és TŰZ gomb; választható, hogy
  külső joystick 1-ként vagy kurzorbillentyűk + SPACE-ként működjön.
- **Szöveg beírása**: a telefon saját billentyűzetével beírt sort (nagybetűk,
  írásjelek, TVC-n ékezetek is) a gép begépeli és Entert nyom.
- **⛶**: a kép és a vezérlők együtt teljes képernyőre kerülnek; fekvő
  tájolásban a joystick a kép két oldalára kerül.

Érintőképernyős eszközön a billentyűzet és a joystick alapból be van kapcsolva;
a beállítást a böngésző megjegyzi.

A ROM-ok szerzői jogi okokból nincsenek a repóban. Ha a saját szervereden
`roms/ep128emu_roms-2.0.11.bin` néven elérhető a csomag, az oldal automatikusan
betölti.

## Fordítás

```sh
git clone --recursive https://github.com/kks2003/Ep128web.git
cd Ep128web
source /path/to/emsdk/emsdk_env.sh   # Emscripten SDK (tesztelve: 6.0.11)
./build.sh                           # eredmény: dist/
cd dist && python3 -m http.server 8000
```

Majd `http://localhost:8000`. Smoke teszt (Node.js, a ROM-csomaggal):

```sh
node test/smoke.js ep128emu_roms-2.0.11.bin
```

### GitHub Pages

A `.github/workflows/pages.yml` minden `main`/`master` push után lefordítja és
kiteszi az oldalt. Ehhez a repó *Settings → Pages* oldalán a *Source* legyen
**GitHub Actions**.

## Felépítés

- `ep128emu/` – az eredeti ep128emu (git submodule)
- `web/src/main.cpp` – WebAssembly frontend: képkimenet (NICK sorformátum → RGBA),
  hang-puffer, C API a JavaScript felé, ROM-csomag kicsomagolás
- `web/src/soundio_web.cpp` – az `AudioOutput` alaposztály PortAudio nélkül
- `web/src/sndfile_wav.cpp`, `web/stubs/` – minimális libsndfile (csak WAV
  olvasás a magnóhoz) és PortAudio típus-csonkok
- `web/shell/` – HTML/CSS/JS felület (AudioWorklet, billentyűzet, fájlkezelés)
- `build.sh` – fordítás `em++`-szal

Eltérések a natív ep128emu-tól: nincs debugger/monitor, Lua script, videó- és
hangfelvétel, OpenGL effektek, egér; TVC-n az automatikus szövegbeíróval az „í”
nem gépelhető; a kép 768×288-as (a váltottsoros módok
két félképe egybe van hajtva). A ZX Spectrum és CPC gépek nincsenek
lefordítva.

## Licenc

GPL v2 vagy újabb, mint az ep128emu (lásd `ep128emu/COPYING`).

## Weboldal

[https://kks2003.github.io/Ep128web/](https://kks2003.github.io/Ep128web/)
