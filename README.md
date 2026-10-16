# Ep128web – Enterprise 128 és Videoton TVC emulátor a böngészőben

Az [ep128emu](https://github.com/istvan-v/ep128emu) (Varga István) emulátor
WebAssembly-portja, Enterprise 128 és Videoton TVC géppel. Az emulációs mag
(Z80, NICK, DAVE, a TVC CRTC/videó, WD177x/EXDOS/VT-DOS, magnó, FILE: eszköz)
az eredeti, **változatlan** C++ forráskód, Emscriptennel
fordítva; csak a grafikus felület (FLTK) és a hangkimenet (PortAudio) helyére
került egy kis webes frontend (canvas + Web Audio).

## Használat

1. Nyisd meg az oldalt (lásd lent: GitHub Pages vagy helyi szerver).
2. Alapértelmezés szerint Videoton TVC 64k BASIC 1.2 indul; a gépválasztást
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
| `.img`, `.dsk` | A: lemezmeghajtó; TVC-n a 360 KiB és 720 KiB (nyers, 512 bájtos szektoros) képek is támogatottak; Enterprise-on szükség esetén EXDOS-os gépre vált; TVC-n a formátumnak megfelelő lemezkártyát (VT-DOS vagy UPM) teszi be; kilistázza a lemezt (`:DIR`, ill. `EXT 2` + `DIR`), UPM-lemeznél a programjai közül lehet választani |
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
- **Videoton TVC**: TVC 64k+ BASIC 2.2, TVC 64k és 32k BASIC 1.2, valamint
  rendszer-cartridge-dzsel: TVC 64k+ BASIC 2.2 · VT-DOS (`tvc_dos12c.rom`, a
  „(DOS)” programok rendszerlemezéhez) és TVC 64k+ BASIC 1.2 · UPM
  (`tvcupm_c.rom`, CP/M-kompatibilis operációs rendszer). Mindkét cartridge
  a ROM-csomagban van; a géphez kellő lemezkártyát az oldal beteszi egy portba
  (VT-DOS, ill. UPM). Az UPM cartridge a `*` után RETURN-re vár, ezt
  lemezkép betöltésekor az oldal leüti, és kilistázza a lemezt. A
  programkatalógus „(DOS)”, ill. „(UPM)” jelölésű programjai ezen a gépen
  indulnak, a „(64k+)” jelölésűek a TVC 64k+ BASIC 2.2-n, a többi a
  gépválasztóban kiválasztott TVC-n. A négy
  bővítőport mindegyikébe választható kártya (lásd lent). A `.cas` programok a
  FILE: kártya (`tvcfileio.rom`) eszközére kerülnek és automatikusan betöltődnek
  (`LOAD "név"`). A billentyűzet a magyar PC-kiosztást követi (QWERTZ, `0` az
  `1` bal oldalán, `ö ü ó` a 9 után).

### TVC bővítőportok

A „TVC bővítőportok” panelen mind a négy porthoz (0–3) kiválasztható a kártya:
üres, VT-DOS (lemez), UPM (lemez), FILE: (`.cas` fájlok), GameCard (SN76489 +
3–4. joystick), Multichip Soundcard (SN76489, SAA1099, OPL2) vagy TVC256k++. Egy
kártya csak egy portban lehet, és lemezkártya (VT-DOS vagy UPM) csak egy. Az UPM
kártya ugyanaz a floppy-csatoló, mint a VT-DOS, az UPM-kompatibilis ROM-mal
(`tvcupm_d.rom`): BASIC alól `LOAD "NÉV"`-vel tölt UPM formátumú lemezről. A választás csak a **Portok betöltése, újraindítás** gombbal lép
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
indításakor a FILE:-ra, kazettánál a magnóra állítja át az átirányítást.

Lemezkép betöltésekor az oldal felismeri a formátumát: a FAT-os (boot szektoros)
lemez VT-DOS-é, az UPM-lemez első 4 pályája üres, utána CP/M-katalógus jön. A
lemezkártyát ehhez igazítja: ha a másik van bent, ugyanabba a portba cseréli
(ha egyik sincs, az első üres portba teszi), és hidegen újraindít. VT-DOS-lemeznél
`EXT 2` + `DIR`, UPM-lemeznél a lemezen lévő `.CAS` programok közül lehet
választani (`LOAD "NÉV"`). A többi kártyát az oldal sosem cseréli magától (ha
hiányzik a szükséges, szól).

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
`LOAD` és a CLI fájlparancsai a kártya meghajtóit használják (USB nélkül bootoláskor a
flash drive lesz az aktív, mint a valódi kártyán). Ha a kártya be van dugva, a képre húzott
`.cas` programok (egy ZIP összes fájljával) az USB pendrive-ra kerülnek – ha nincs bedugva,
az oldal bedugja –, és a `LOAD` a kártyán keresztül fut. A PSRAM így a programoké marad (sok
program memóriának használja, pl. a Bad Apple lejátszó). Hideg resetkor a kártya újraindul:
a PSRAM drive megszűnik, a flash drive útvonala visszaáll a gyökérre.

Állapot (3. lépés):

- megvalósítva: a kártya IO portjai és regiszterfájlja (két port-készlet, automatikus
  növelés), 256 kB gyors RAM és 8 MB PSRAM lapozása az U2/U3 területen, az IO ROM
  (2 × 6 kB, `REG_MEMORY_ROM_PAGE`) és a 2 kB IO RAM, valamint a `REG_DRIVE_SELECT`
  tükrözése a `$D810` címen;
- **flash drive**: a kártya firmware-ének saját fájlkezelő kódja (`tvc-lfs.c`, littlefs) fut
  az emulátorban (`web/src/card/`), így a `REG_USB_MSC_CMD` fájlparancsok (megnyitás,
  olvasás, könyvtárlistázás, `CD`, `LOAD`) pontosan úgy működnek, mint a valódi kártyán.
  Alapból a kártya repójában közzétett flash-kép (`binaries/flash-root-1.3-bin.zip`, a
  launcherrel és a TVC programokkal) kerül rá: ha a kártya be van téve, az oldal egyszer
  letölti a GitHubról, és a böngésző megjegyzi. Saját képet (`flash-root-*.bin`, vagy
  `flash-root-*-bin.zip`) az oldalra ejtve tölthetsz be helyette. Utána `EXT <port>`,
  `DIR`, `CD games`, `X`, majd `LOAD "aircraft"`, `RUN`;
- **grafika**: a firmware rajzoló kódja (`tvc-graphics.c`) soronként kiszámolja a 256×240-es
  overlay-t, amit az emulátor a TVC képére rak (a papír területére, a TVC VSYNC/BORDER
  jeleihez igazítva, mint a kártya). Megy mind a négy mód (üres, 2 színű és 16 színű
  karakteres, 16 színű bitmap), a 16 sprite (2/16 szín, előtér/háttér), a 0–7 pixeles
  görgetés kerettel, a keretszín, a sprite–sprite és sprite–háttér ütközés, és az ütközési
  megszakítás (a TVC adott porthoz tartozó IT-bitjén, ha a program engedélyezte).
  Bekapcsoláskor a gyors RAM-ban ott van a firmware fontja (`$1000`), háttérképe (`$8000`)
  és mintasprite-jai, ahogy a valódi kártyán; TVC reset kikapcsolja az overlay-t;
- **beépített függvények**: `REG_FUNCTION_EXECUTE` (`$C0`) és a több függvényt egymás után
  futtató `REG_FUNCTION_MULTI_EXECUTE` (`$C6`) a firmware saját `tvc-routines.c` kódjával
  fut: szövegkiírás, színek, pont/vonal/téglalap/ellipszis/háromszög, kitöltés,
  képmásolás, memóriamozgatás (gyors RAM és PSRAM), zx7 kicsomagolás, sprite-tükrözés,
  matematikai kifejezés, PSRAM drive létrehozás/törlés, fájlműveletek a PSRAM és flash
  drive-on. A hívás azonnal lefut, a regiszter visszaolvasva már `$FF` („kész”).
  Három nyilvánvaló firmware-hibát javítottam (a forrásban `Ep128web:` megjegyzéssel): a
  PSRAM drive létrehozása (34) és a szabad PSRAM-pozíció lekérdezése (35) a paraméter helyett
  a mutatót olvasta/írta, a függvényes fájlírás (`$84`) pedig fordított irányban másolt;
- a PSRAM drive a 34-es függvénnyel létrehozható; az `LCDSR` (mappa másolása a PSRAM-ba)
  USB-t igényel, ez nem megy;
- **vSID**: a kártya SID-emulációja (`tvc-sid.c`, a firmware saját kódja) szól a TVC
  hangjával keverve, a kártyán használt mintavétellel (985 kHz-es SID-órajel, 41 kHz-es
  minták, szűrő nélkül, mint a firmware-ben); a `$E0`–`$FF` regiszterek írhatók-olvashatók
  (a 27/28 az OSC3/ENV3 értéke). A firmware a reset után az első hangot csak a gate bit
  0 → 1 váltásánál indítja;
- **egér**: a 🖱 gombbal (csak TVC-n, kártyával) a böngésző egere a kártya USB-egere lesz
  (relatív mozgás, három gomb, sebesség-regiszter); kilépés: Esc. Az első mozdulattól a
  `REG_USB_INIT` jelzi, hogy van egér;
- **reset**: a TVC resetje a kártyán csak a grafikát állítja alaphelyzetbe; a kártya teljes
  újraindítását (a valódi gépen két reset egy másodpercen belül) a „Hideg reset” gomb adja;
- **USB pendrive**: a TVC-nél megjelenő „USB pendrive (TVC256k++)” panelen bedugható egy
  FAT pendrive (32–256 MB) a kártya USB-portjába. A panel mutatja a tartalmát (mappák,
  méretek, szabad hely); fájl, mappa vagy ZIP (kibontva, mappastruktúrával) adható hozzá
  gombbal vagy a panelre húzva, bármilyen típusú (`.cas`, `.bmp`, `.dsk`…); egyenként
  letölthetők és törölhetők. A tartalom a böngészőben megmarad (újratöltés után is), a TVC
  programjai által írt fájlokkal együtt. Bedugott pendrive-nál bootoláskor ez lesz az aktív
  meghajtó, a képre húzott programok is erre kerülnek, és a launcher „Load dir to PSRAM”
  (L) parancsa is működik a rajta lévő mappákkal;
- **DSK drive**: a firmware FatFS-kódja (`tvc-fatfs.c`) fut, így a pendrive-on, a PSRAM- vagy
  a flash drive-on lévő `.dsk` képek csatolhatók (`MDSK`, `UMDSK`), és a 3-as meghajtóként
  használhatók. A flash drive az emulátorban csak olvasható, ezért az ott lévő képre írni nem
  lehet;
- még nincs: állapotmentés (a kártya állapota a pillanatképbe nem kerül bele).

A kártya IO ROM-ját a `scripts/extract_card_rom.py` állítja elő a firmware
`TVC-IO-v0.24.uf2` fájljából (`web/src/tvc256kpp_rom.cpp`). A Z80-oldali viselkedés
az ep128emu-ba a `patches/tvc256kpp.patch` segítségével kerül be, az overlay
megjelenítése a `patches/zzz-tvc256kpp-overlay.patch` segítségével. A gyors RAM bekapcsoláskori
tartalmát (font, háttérkép) a `scripts/gen_card_data.py` készíti a kártya repójából
(`web/src/card/tvc-card-data.c`).

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
./build.sh                           # eredmény: dist/ (a fejlécben a fordítás ideje és a commit)
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
