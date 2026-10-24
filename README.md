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
| `.img`, `.dsk` | A: lemezmeghajtó; TVC-n a 360 KiB és 720 KiB (nyers, 512 bájtos szektoros) képek is támogatottak; Enterprise-on szükség esetén EXDOS-os gépre vált; TVC-n a formátumnak megfelelő lemezkártyát (VT-DOS vagy UPM) teszi be; kilistázza a lemezt (`:DIR`, ill. `EXT 2` + `DIR`), UPM-lemeznél a programjai közül lehet választani. Két lemezkép egyszerre: a második a B: meghajtóba kerül (TVC: VT-DOS/UPM `B:`, EP: EXDOS `B:`). A ráejtett lemez a meghajtó aktív helyére kerül. |
| `.zip`, több fájl | minden fájl a `FILE:` eszközre kerül; ha több indítható program van, választani lehet |
| `.ep128s` / `.ep128d` | ep128emu pillanatkép / demó |
| `.bin` (ROM-csomag), `.rom` | ROM-ok telepítése |

### Lemezmeghajtók (A:, B:)

Mindkét meghajtónak 3 helye van, egymás alatt. Egy hely sora:

- **Választó:** azt a lemezt teszi azonnal a meghajtóba, a következő lemezművelet már azt használja.
- **📂 Megnyitás:** lemezkép (.dsk, .img, .zip) feltöltése a helyre. A hely aktív lesz, az A:-n a lemez ki is listázódik.
- **⬇ Letöltés:** a lemezkép mentése.
- **✕ Törlés:** kiveszi a lemezt, a hely üres lesz.

A lemezképeket és a kiválasztott helyeket a böngésző megjegyzi (IndexedDB), újratöltés után is megvannak. Amit a gép a lemezre ír, az is mentődik, amikor a meghajtó lámpája elalszik.

A FILE: panel Betöltés… gombja a fájlokat (ZIP-et kibontva) csak a `FILE:` eszközre
másolja, indítás nélkül; a listában az indítható programok neve kattintható, a
kattintás elindítja a programot.

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
  EXOS 2.32-vel (UK/magyar), EP 2048K EXOS 2.4-gyel (EXDOS-szal vagy csak magnóval). Mindegyikben benne van az
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

### Debugger

A fejléc **🐞 Debugger** gombja nyitja meg a képernyő alatti panelt.

**Vezérlés**
- Megállítás, Folytatás (F5), Lépés (F11).
- Átlépés (F10): a CALL, az RST (az EXOS-/TVC-rendszerhívás paraméterbájtjával együtt), a DJNZ, az LDIR-féle és a HALT egyben fut le.
- Kilépés: a verem tetején lévő visszatérési címig fut.
- ⟲ Vissza: visszalépés az előző debugger-lépés (lépés, átlépés, folytatás…) előtti állapotra, a képpel együtt. Az utolsó 40 állapotot pillanatképből tölti vissza; a lemezek és a kártyák (2dfx, hangkártyák) állapota nem lép vissza. Újraindítás, gépváltás vagy pillanatkép betöltése törli az előzményt (egy korábbi programba nem lehet visszalépni).
- Futás a kurzorig (F4).
- Képkocka: 20 ms-nyi futás, utána megáll.
- A billentyűk akkor működnek, ha a fókusz a panelen van.

**Regiszterek**
- Megállítva szerkeszthetők (hex, Enter). A legutóbbi megállás óta változottak pirosak.
- Alattuk a jelzőbitek, a 4 lap szegmense névvel és a verem teteje.
- Szegmensnevek: TVC-n SYS, CART, EXT, SDEXT, U0–U3, VID0–VID3. Enterprise-on a ROM-ok neve (EXOS0, BASIC, EXDOS0…), RAM, VID (FC–FE) és SYS (FF, az EXOS rendszerszegmense, egyben videó-RAM).

**Disassembly**
- A PC körül mutat, vagy a megadott címtől (címke is megadható).
- Kattintás: kurzor (futás a kurzorig).
- Bal szélre kattintás vagy F9: végrehajtási töréspont be/ki.
- Megjegyzések a sorok végén (`;`):
  - IN/OUT: a port neve (NICK, DAVE, lapregiszter, TVC lapozás, CRTC, paletta, a bővítőhelyen lévő kártya…).
  - Az aktuális (PC) sorban a kiírandó érték is, a lapozás kibontva: TVC port 02 → `P0=SYS P1=U1 P2=VID P3=CART`, port 0C → VID lapok, port 06 → GRAPHICS mód, EP B0–B3 → a szegmens neve. `OUT (C),r` és az OUTI-félék portját a C regiszterből veszi.
  - Enterprise `EXOS nn`: a funkció neve, a PC-sorban a paraméterekkel (csatorna, eszköznév, EXOS változó).
  - TVC `RST 30: nn` funkcióhívás: a funkció neve (VID_CHOUT, VMODE, CAS_OPEN, TONE_SET, HI_MEM_SET…), a PC-sorban a paraméterekkel. Az ismeretlen kódoknál az osztály, az irány és a funkciószám.
  - Abszolút memóriacím: melyik lapra és szegmensre esik az aktuális lapozással, illetve az ismert rendszerváltozók neve: TVC-n az U0 lap változói (P_SAVE, IN_TABLE, PORT03, HI_MEM, INK, PICTURE…, a BASIC-éi is), EP-n a rendszerszegmens (FF) térképe az [enterprise.iko.hu](http://enterprise.iko.hu/memorymap.htm) alapján (EXOS 2.1 és újabb): az EXOS-változók (IRQ_ENABLE_STATE … RANDOM_IRQ), óra, dátum, lánc- és listamutatók, szegmensszámlálók, LP_POINTER, ST_POINTER, RST_ADDR, USR_P0–3. Az `EXOS 16` hívásnál a változó neve is. TVC-n a `LD HL,0B51`-féle betöltéseknél is.
  - CALL/JP másik lapra: a cél szegmense.
- Rendszerhívás átlépése (F10) után a megállási üzenet kiírja az A-ban visszaadott eredményt, TVC-n a hibakód jelentésével (pl. `F5 STOP`, `EA CRC hiba`).
- A TVC funkciók, rendszerváltozók és hibakódok forrása a „TV-Computer Operációs rendszer” kézikönyv ([tvcdoc](https://github.com/kks2003/tvcdoc)) és KKS TVCinf táblázata (a teljes U0 címlista a kazetta-, editor-, video- és BASIC-munkaterülettel, a floppy D6–DB funkciók).
- További kibontott portírások: TVC keretszín és paletta (színnévvel), CRTC regiszterválasztás (a 6845 regiszter neve), hangport 05; EP keretszín, billentyűsor.
- A memórianézetben (CPU-cím) az ismert címek pontozottan aláhúzottak; az egér alatt a cím neve, lapja és értéke látszik.
- Ugyanezek a megjegyzések a monitor `D` parancsában, az előzményekben, az I/O naplóban és a megállási üzenetben is megjelennek.

**Memória**
- Forrás: CPU-cím (`C000`), szegmens:offset (`FC:0000`), a 2dfx resource RAM, a TVC256k++ PSRAM vagy a kártya saját RAM-ja (háttérkép, sprite-ok, szöveg, font).
- A változott bájtok pirosak, dupla kattintással felülírhatók.

**Töréspontok**
- Fajták: végrehajtás, memória-olvasás/-írás, port-IN/-OUT.
- Végrehajtási töréspontnál a gép az utasítás előtt áll meg, figyelésnél a hozzáférő utasítás után. A panel kiírja a címet és az értéket.
- Feltétel: JavaScript-kifejezés, pl. `A == 3 && HL > 0x4000`, `VALUE == 0xA8`, `mem(0x1234) == 0`, `HITS == 10`. Hamis feltételnél a gép azonnal fut tovább.
- A töréspontok találatszámot mutatnak, ki-be kapcsolhatók, és a böngésző megjegyzi őket.

**Fülek**

| Fül | Tartalom |
|---|---|
| Monitor | Az ep128emu monitorának parancsai, `?` a súgó. `A`/`.` assembler, `D` disassembly, `M` dump (a `D` és az `M` fájlba is: `D 0000 0100 "lista.txt"`), `>` írás, `F` feltöltés, `C` összehasonlítás, `H` keresés, `SR` keresés és csere, `T` másolás, `R`/`;`/`;;` regiszterek, `G`/`X`/`Z`/`Y` futtatás, `IO`/`O` portok, `L`/`S`/`V` fájlbetöltés, -mentés és -összevetés, `I` állapot. |
| Előzmények | Az utolsó 16384 lefutott utasítás címe, a legutóbbi 64 disassemblyvel. |
| Profiler | Címenkénti utasításszámláló, a 40 leggyakoribb címmel. |
| I/O napló | Minden IN/OUT a PC-vel, portszűrővel. |
| I/O regiszterek | NICK, DAVE, EXDOS, illetve a TVC CRTC-je, palettája, lapozása. |
| NICK LPT (EP) | A sorparaméter-tábla: sorok, mód, színmód, margók, LD1/LD2, paletta színmintákkal, kiemelve az aktuális sort. |
| Grafika | A memória képként. Forrás: a gép memóriája (szegmens:offset vagy CPU-cím), a 2dfx resource RAM, a TVC256k++ kártya-RAM-ja vagy PSRAM-ja. Formátum: 2/4/16/256 szín (TVC, NICK), 2dfx 16 szín, 256k++ 16 és 2 szín; a gép palettája vagy szürke. Előbeállítások: a kijelzett képernyő (TVC: VID lap, mód, paletta; EP: az LPT legnagyobb grafikus területe), a 2dfx bekapcsolt sprite-jai (a kártya 16 alapszínével; EP-n a képernyőn a NICK sorpalettája szerint jelennek meg), a 256k++ háttérképe, 16 sprite-ja (az aktuális fázissal) és a sprite-terület összes fázisa (2 és 16 szín). ◀ ▶ lapoz, az egér alatt a bájt címe vagy a sprite adatai, kattintásra a memórianézetben. |
| BASIC (TVC) | A memóriában lévő BASIC program listája, a ROM saját kulcsszótáblájával (minden ROM-verzióval), ékezetekkel. Futás közben az aktuális sor kiemelve; kattintásra a sor címe a memórianézetben. |
| Hangkártyák (TVC) | GameCard / Multichip: SN76489, SAA1099 és OPL regiszterek. |
| 2dfx | Motor mód, státusz, demó, a bekapcsolt sprite-ok és a háttér/előtér 2DPT-lista. Bekapcsolt I/O naplóval parancsnapló is: az F8h parancsok névvel (SET_ENGINE_MODE, UPLOAD_NICK, sprite #n, előtér/háttér 2DPT LINE, demó C7h: Pong…) és az utánuk küldött F9h adatbájtok. Az F8h port írása a disassemblyben és az I/O naplóban is névvel látszik, az olvasása a státuszbitekkel (kész, ütközés, raszter IRQ…). |
| TVC256k++ | Port, lapozás, PSRAM, firmware, meghajtó, USB és a 256 regiszter. A PSRAM a memórianézetben látható. |
| Kereső | Memóriaérték-kereső („cheat finder”): pillanatkép, majd szűrés (= érték, változott, nőtt, eggyel csökkent…). Egy jelöltre kattintva írásfigyelés kerül rá. |
| Szimbólumok | Címkék betöltése (sjasmplus, pasmo, tniASM: `címke EQU 1234h`, `címke = $1234`, `1234 címke`). A disassemblyben, a címmezőkben és a monitorban is használhatók. |
| Szkript | JavaScript az `ep` objektummal, a böngésző konzolából is (`window.ep`). Lásd lent. |

**Szkript (Lua)**
- A nyelvválasztóban „Lua (ep128emu)”: az eredeti ep128emu Lua-szkriptelése, ugyanazzal az API-val (a desktop README-je szerint): `breakPointCallback(típus, cím, érték)`, `setBreakPoint`, `clearBreakPoints`, `readMemory`/`writeMemory`, `readMemoryRaw`, `readWord`, `getPC`/`getA`… `setPC`/`setA`…, `readIOPort`/`writeIOPort`, `getMemoryPage`, `getNextOpcodeAddr`, `getVideoPosition`, `getRawAddress`, `loadMemory`/`saveMemory`, `mprint`. A desktop szkriptek változtatás nélkül futnak.
- A `breakPointCallback` `false` értékkel továbbengedi a gépet; léptetéskor 3-as típussal hívódik (amíg `true`-t nem ad, a léptetés folytatódik).
- A szkript töréspontjai a debugger saját töréspontjai mellett élnek (nem jelennek meg a listában); a végrehajtási töréspontok (CPU-cím) az utasítás előtt állnak meg.
- Lua 5.3.6 (`web/src/lua`, MIT), a szkriptmotor az ep128emu `script.cpp`-je (`patches/zzzzzz-luascript.patch`, `web/src/webscript.cpp`).

**Szkript (JavaScript)**
- Gép: `regs`, `setReg`, `peek`/`peek16`/`poke`, `read`, `out`, `disasm`, `assemble`, `reset`, `time`.
- Töréspontok és futás: `bp`, `watch`, `clearBps`, `pause`, `step`, `stepOver`, `cont`, `runTo`, `monitor`.
- `onBreak(fn)`: minden megálláskor fut; `true` visszatérési értékkel továbbengedi a gépet (naplózás megállás nélkül).
- `onFrame(fn)`: minden képkocka után fut, pl. érték rögzítése (`ep.onFrame(() => ep.poke(cím, 5))`).
- Várakozás (`await`): `ep.type('LIST\n')` gépel, `ep.wait(ms)` emulált időt vár, `ep.until(() => feltétel)` a feltételig fut.
- Nevek: `callName(kód)`, `addrName(cím)`, `portName(port)`.
- Példák a legördülő listában (rendszerhívások naplózása, gépelés, memóriaírások naplózása, végtelen élet, futás feltételig). A szkript fájlba menthető és onnan betölthető; a Leállítás gomb az onBreak-et, az onFrame-et és a várakozásokat is leállítja.

**Működés:** a böngészőben minden egy szálon fut, ezért a gép az utasításhatárokon áll meg (`web/src/webdebug.cpp`, `patches/zzzzz-webdebug.patch`). Töréspontok, előzmények és profiler nélkül ez nem lassítja az emulációt.

### TVC programkatalógus frissítése

A katalógus a tvc.homeserver.hu programoldalairól készül (`scripts/build_catalog.mjs`), és a repóban tárolódik (`web/catalog/programs.json`, `web/shell/catalog.json`).

Frissítés gombbal: GitHub → **Actions** → **Update TVC catalog** → **Run workflow**. Ha a lista változott, a munkafolyamat a main ágra commitolja, és elindítja az éles oldal fordítását.

A típusszűrő „Gép, bővítés” csoportja a programnevekben lévő szavak alapján válogat. Ezek a programok a megfelelő beállítással indulnak:

- **DOS:** VT-DOS cartridge-dzsel (64k+, BASIC 2.2).
- **UPM:** UPM cartridge-dzsel.
- **256k++:** a TVC256k++ kártyával. A kártya az első üres portba kerül, a 2dfx kikapcsol.
- **2dfx:** a 2dfx kártyával. A TVC256k++ kikerül, ha bent volt.
- **64k+:** a TVC 64k+ géppel, BASIC 2.2-vel.

A tvc.homeserver.hu a tanúsítványa mellől nem küldi el a ZeroSSL köztes tanúsítványát, ezért a szkript a `scripts/certs/` mappából adja hozzá, és teljes ellenőrzéssel csatlakozik.

A munkafolyamat nem írja felül a listát, ha egyetlen oldal sem tölthető le, vagy ha a programok száma a korábbinak a felénél kevesebb lenne. Szándékos csökkenésnél a „force” jelölővel mégis felülírja.

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

TVC-n a 768 pontos sor két szélén lévő 48–48 pont vízszintes kioltás. Ez mindig fekete, egy valódi tévé nem mutatja, ezért az oldal levágja, és a képarányt is ehhez igazítja.

Felvétel a fejléc gombjaival:

- **📷 Kép**: a képernyő mentése PNG-ként (EP: 768×576, TVC: 672×576).
- **● Videó**: videó felvétele hanggal. Újra megnyomva leáll, és a fájl letöltődik. A hangerő és a némítás a videó hangjára is hat.
  - Formátum: MP4 (H.264), ha a böngésző tudja, különben WebM.
  - Ha mindkettőt tudja, a gomb melletti választóval lehet váltani. Az alapértelmezés MP4, a választást az oldal megjegyzi.
- **● Hang**: az emulált hang felvétele WAV-ként (16 bit, sztereó). Újra megnyomva leáll, és a fájl letöltődik. A felvételre a hangerő és a némítás nem hat.

Enterprise-billentyűzet: Esc = ESC, Backspace = ERASE, Del = DEL, Ins = INS, End/Pause = STOP,
Home = HOLD, Alt = ALT, F1–F8 = funkciógombok, CapsLock = LOCK; F11 = reset,
Shift+F11 = hideg reset, F12 = turbó. Joystickok: a Joystick panelen
minden bemenethez (numerikus 8/4/6/2 + 0, nyilak + jobb Ctrl, W A S D + Space,
gamepad 1–4, érintős joystick) kiválasztható, melyik joystickot hajtja: TVC-n az
1. portot (ugyanaz, mint a beépített kurzorjoystick), a 2. portot, vagy a GameCard
3–4. joystickját; EP-n a két külső joystickot. Alapból: numerikus és gamepad 1 →
1., gamepad 2 → 2., gamepad 3–4 → GameCard 3–4.; a beállítást a böngésző megjegyzi.
TVC-n a PC Esc az ESC billentyűt, a magyar PC `í` billentyűje pedig az `í` karaktert adja; az End/Pause a CTRL+ESC (STOP) kombinációt nyomja, mert a Ctrl+Esc-et a Windows a Start menünek tartja meg.

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

### 2dfx grafikus kártya

A 2dfx Vaczkó Károly grafikus kártyája Enterprise-hoz és TVC-hez. Az oldal a kártya készítőjétől kapott hordozható C modullal emulálja (`web/src/twodfx/`). A beépített demók (`C0h`–`DFh`) a kártya v1.1.0-s firmware-ének eredeti C forrásaiból fordulnak (`firmware_eggs/`). A Joystick panel „2dfx grafikus kártya” kapcsolójával dugható be, a beállítást az oldal megjegyzi.

- **Portok:** F8h (parancs, státusz) és F9h (adat).
- **Kép:** a kártya képe a gép képe fölé kerül, de csak a képterületen: a bordert sosem írhatja felül (EP-n a sor margói között, TVC-n a papíron). EP-n a NICK aktuális palettáján, TVC-n a TVC színein jelenik meg.
- **TVC felbontás:** a külső színbemenetek teljes felbontása csak Graphics 2 módban érvényes. Graphics 4 és 16 módban a TVC a 2dfx-nek csak minden második képpontját rajzolja ki, duplán.
- **Megszakítás:** a raszter-megszakítás EP-n a DAVE megszakításával VAGY-kapcsolatban, TVC-n a többi megszakítás mellett jut a Z80-hoz.
- **Reset:** a gép reset vonala a kártya mikrovezérlőjének reset lábára is rá van kötve, ezért a meleg és a hideg reset is újraindítja a kártyát, mintha most kapcsolták volna be. Ébresztése a `50h` paranccsal történik (`OUT 248,80`, majd `OUT 249,1`). A firmware-oldal az `OUT 248,142` paranccsal jelenik meg, a beépített demók a `C0h`–`DFh` parancsokkal indulnak (pl. `OUT 248,193`).
- **TVC256k++:** TVC-n a kettő együtt nem működik. A 2dfx bekapcsolása kiveszi a TVC256k++ kártyát a portjából, a TVC256k++ betöltése pedig kikapcsolja a 2dfx-et.
- **Pillanatkép:** a 2dfx állapotát az ep128emu pillanatképe (.ep128s) nem tartalmazza.

A modul MIT licencű (Vaczkó Károly). A demókban lévő Wriggler- és Elite-adatokra a modul `ASSET_LICENSES.md` fájlja vonatkozik, ezeket a kártya készítőjének hozzájárulásával tartalmazza a repó.

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
- `web/src/twodfx/` – a 2dfx kártya hordozható emulátora (MIT), `web/src/twodfx_bridge.cpp` – bekötése a VM-ekbe (`patches/zzzz-2dfx.patch`)
- `build.sh` – fordítás `em++`-szal

Eltérések a natív ep128emu-tól: a debuggerből nincs monitor-parancssor és Lua script, nincsenek
OpenGL effektek és egér; TVC-n az automatikus szövegbeíróval az „í”
nem gépelhető; a kép 768×288-as (a váltottsoros módok
két félképe egybe van hajtva). A ZX Spectrum és CPC gépek nincsenek
lefordítva.

## Licenc

GPL v2 vagy újabb, mint az ep128emu (lásd `ep128emu/COPYING`).

## Weboldal

[https://kks2003.github.io/Ep128web/](https://kks2003.github.io/Ep128web/)
