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
| `.img`, `.dsk` | A: lemezmeghajtó; TVC-n a 360 KiB és 720 KiB (nyers, 512 bájtos szektoros) képek is támogatottak; Enterprise-on szükség esetén EXDOS-os gépre vált; TVC-n VT-DOS kártya kell valamelyik portba; kilistázza a lemezt (`:DIR`, ill. `EXT 2` + `DIR`) |
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
- **Videoton TVC**: TVC 64k+ BASIC 2.2, TVC 64k és 32k BASIC 1.2. A négy
  bővítőport mindegyikébe választható kártya (lásd lent). A `.cas` programok a
  FILE: kártya (`tvcfileio.rom`) eszközére kerülnek és automatikusan betöltődnek
  (`LOAD "név"`). A billentyűzet a magyar PC-kiosztást követi (QWERTZ, `0` az
  `1` bal oldalán, `ö ü ó` a 9 után).

### TVC bővítőportok

A „TVC bővítőportok” panelen mind a négy porthoz (0–3) kiválasztható a kártya:
üres, VT-DOS (lemez), FILE: (`.cas` fájlok), GameCard (SN76489 + 3–4. joystick),
Multichip Soundcard (SN76489, SAA1099, OPL2) vagy TVC256k++. Egy kártya csak egy
portban lehet. A választás csak a **Portok betöltése, újraindítás** gombbal lép
életbe (a kártyák ROM-jai betöltődnek, a gép hidegen újraindul); a beállítást a
böngésző megjegyzi.

Minden kártya a saját portjának címein jelenik meg: I/O portok `$10 + $10·n`-től,
IOMEM-lap `n` (a `$03` port 6–7. bitje), a `$5A` porton a kártyaazonosító (a
VT-DOS 2-es, „DISK”, minden más 3-as, „MOPS” fejléces ROM-mal). A TVC IOS a
bootoláskor portonként felismeri és inicializálja őket.

A VT-DOS, a FILE: és a TVC256k++ is magára állítja az alapértelmezett tárolót
(kazetta-átirányítás, `$0B05`/`$0B0D`); a legnagyobb sorszámú portban lévő nyer.
A VT-DOS (`EXT 2`) és a TVC256k++ (`EXT` + a port száma) parancssora csak akkor
működik, ha az alapértelmezett tároló rájuk mutat. Ezért az alapbeállítás:
**0: FILE:, 1: VT-DOS, 2: GameCard, 3: üres** – így bootolás után a VT-DOS az
alapértelmezett. Lemezkép betöltésekor az oldal a VT-DOS-ra, `.cas` program
indításakor a FILE:-ra, kazettánál a magnóra állítja át az átirányítást; a
portokat viszont sosem cseréli magától (ha hiányzik a szükséges kártya, szól).

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

### TVC256k++ kártya (kísérleti)

A [TVC256k++](https://github.com/dikdom/tvc256kplusplus) kártya bármelyik bővítőportba
tehető; a parancssora BASIC-ből `EXT` + a port száma (pl. a 3-as portban `EXT 3`). Ha a
legnagyobb sorszámú tároló-kártya, bootoláskor magára állítja a kazetta-átirányítást, így a
`LOAD` és a CLI fájlparancsai a kártya meghajtóit használják. Egy `.cas` program automatikus
indítása viszont a `FILE:` eszközre állítja át (hogy az utántöltés is onnan jöjjön); utána a
kártya fájlparancsai („IO operation failed”) csak hideg reset után működnek újra.

Állapot (2. lépés):

- megvalósítva: a kártya IO portjai és regiszterfájlja (két port-készlet, automatikus
  növelés), 256 kB gyors RAM és 8 MB PSRAM lapozása az U2/U3 területen, az IO ROM
  (2 × 6 kB, `REG_MEMORY_ROM_PAGE`) és a 2 kB IO RAM, valamint a `REG_DRIVE_SELECT`
  tükrözése a `$D810` címen;
- **flash drive**: a kártya firmware-ének saját fájlkezelő kódja (`tvc-lfs.c`, littlefs) fut
  az emulátorban (`web/src/card/`), így a `REG_USB_MSC_CMD` fájlparancsok (megnyitás,
  olvasás, könyvtárlistázás, `CD`, `LOAD`) pontosan úgy működnek, mint a valódi kártyán.
  A flash drive képét (`flash-root-*.bin`, vagy a `flash-root-*-bin.zip`) ráejtheted az
  oldalra; a böngésző megjegyzi. Utána `EXT <port>` → `DS`, `DIR`, `CD games`, `X`, majd
  `LOAD "aircraft"`, `RUN`;
- a PSRAM drive alapja is megvan (littlefs a PSRAM-ban), de formázni egyelőre nem lehet
  (`LCDSR` USB-t igényel);
- még nincs: USB és DSK drive, a beépített függvények (`REG_FUNCTION_EXECUTE`, ezek kellenek
  a launcherhez is), sprite-ok és grafikai overlay, vSID, egér, állapotmentés. A `$C0`/`$C6`
  függvényhívások hibakóddal térnek vissza.

A kártya IO ROM-ját a `scripts/extract_card_rom.py` állítja elő a firmware
`TVC-IO-v0.24.uf2` fájljából (`web/src/tvc256kpp_rom.cpp`). A Z80-oldali viselkedés
az ep128emu-ba a `patches/tvc256kpp.patch` segítségével kerül be.

Tesztek (nem kellenek hozzájuk a TVC ROM-ok):

```sh
python3 test/native_card_test.py     # a teljes emulátor natívan, saját mini Z80-programmal; ha a
                                     # tvc256kplusplus repó a szomszédos könyvtárban van (vagy --card-repo),
                                     # a fájlrendszert a valódi flash-képen is teszteli
python3 test/native_card_test.py --roms ep128emu_roms-2.0.11.bin   # + a valódi TVC BASIC 2.2 bootolása, LOAD a flash drive-ról
```

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

### Kitelepítés és tesztelés

- **Éles oldal:** a `.github/workflows/pages.yml` minden `main` push után
  lefordítja az oldalt, és kiteszi a `gh-pages` ág gyökerébe:
  https://kks2003.github.io/Ep128web/
- **Teszt-előnézet:** minden pull request lefordul
  (`.github/workflows/preview.yml`), és saját címre kerül:
  `https://kks2003.github.io/Ep128web/pr-preview/pr-<szám>/`. A címet egy
  automatikus megjegyzés írja be a PR-be, minden új commit után frissül, a PR
  lezárásakor törlődik. Az előnézet tetején narancs sáv jelzi, hogy nem az éles
  oldal, és a keresők nem indexelik.
- **Menet:** módosítás egy külön ágon → pull request → kipróbálás az előnézeti
  címen → ha minden rendben, beolvasztás a `main`-be → kikerül az éles oldalra.

Az előnézet ugyanazon a címen (kks2003.github.io) fut, mint az éles oldal,
ezért a böngészőben tárolt ROM-ok és beállítások közösek: a ROM-csomagot nem
kell újra feltölteni.

Egyszeri beállítás a repóban:

1. *Settings → Pages → Build and deployment → Source*: **Deploy from a branch**,
   ág: **`gh-pages`**, mappa: **`/ (root)`**.
2. Ajánlott: *Settings → Rules → Rulesets* (vagy *Branches*) alatt védelem a
   `main` ágra: csak pull requesttel lehessen módosítani, és a „Build and
   preview” ellenőrzésnek sikeresnek kell lennie.

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
