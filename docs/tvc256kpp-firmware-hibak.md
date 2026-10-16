# TVC256k++ firmware – talált hibák

A [dikdom/tvc256kplusplus](https://github.com/dikdom/tvc256kplusplus) repó firmware-ében
(`sources/firmware/TVC-IO`, FW 0.24, commit `4580b14`) az Ep128web emulátorba építés közben
talált hibák. A sorszámok erre a commitra vonatkoznak.

Jelölések:
- **Ellenőrizve**: az emulátorban futtatva (ugyanazzal a kóddal) előjött, vagy teszt mutatja.
- **Kódolvasás**: a forrásból következik, valódi kártyán nem próbáltam ki.

Az „Emulátorban” sor azt írja le, hogy az Ep128web mit csinál (a javított vagy az eredeti
viselkedést követi-e). A javított helyeken a forrásban `Ep128web:` megjegyzés áll.

---

## 1. Beépített függvények (`tvc-routines.c`)

### 1.1 `create_psram_drive` (34-es függvény) a mutatót olvassa, nem a paramétert

`tvc-routines.c:1480`

```c
uint16_t num_of_blocks = *(uint16_t *)&bufStart;
```

`&bufStart` a mutató változó címe, így a blokkszám a paraméterterület *címének* alsó 16 bitje
lesz, nem a Z80 által átadott érték. A létrehozott PSRAM drive mérete véletlenszerű (a
memóriacímtől függ), a kért méretnek nincs hatása.

- Javítás: `*(uint16_t *)bufStart`
- Ellenőrizve (az emulátor tesztje a javított változattal 32 blokkos drive-ot kap).
- Emulátorban: javítva.

### 1.2 `get_first_usable_psram_pos` (35-ös függvény) a mutatóba ír, nem a paraméterterületre

`tvc-routines.c:1486-1487`

```c
uint32_t value = (*(uint32_t *)&bufStart & 0xff000000) | (free_psram_start & 0x00ffffff);
*(uint32_t *)&bufStart = value;
```

Ugyanaz a hiba: a helyi `bufStart` változót írja felül, így a Z80 soha nem kapja meg az
eredményt (a paraméterterület változatlan marad).

- Javítás: `*(uint32_t *)bufStart` mindkét helyen.
- Ellenőrizve. Emulátorban: javítva.

### 1.3 `tvcfunc_write_file` (`$84` függvény) fordított irányban másol

`tvc-routines.c:1762-1764`

```c
*(uint32_t *)&TVC_ROM[0x1906] = (uint32_t)&bufferStart[6];
if((length!=0) && (((uint32_t)length + 0x1a00) <= 0x2000)) {
    memcpy(&bufferStart[6], &TVC_ROM[0x1a00], length);
```

A meghívott `tvc_lfs_file_write()` / `tvc_fatfs_write_file()` az írandó adatot a
`TVC_ROM[0x1906]`-tól várja. A függvény oda egy mutatót tesz, és a `memcpy` a
`TVC_ROM[0x1a00]` tartalmát a *program pufferébe* másolja (felülírja a kiírandó adatot). A
fájlba így szemét kerül, a Z80 puffere pedig tönkremegy. A határellenőrzés is a `0x1a00`-hoz
mér, nem a `0x1906`-hoz.

- Javítás: `memcpy(&TVC_ROM[0x1906], &bufferStart[6], length)`, a mutató eltárolása nélkül,
  és `length + 0x1906 <= 0x2000` ellenőrzés.
- Ellenőrizve (az emulátor tesztje a javítással fájlt ír és visszaolvas a PSRAM drive-on).
- Emulátorban: javítva. (Az MSC-parancsos írás – amit a CLI használ – nem érintett.)

### 1.4 `delete_psram_drive` (36-os függvény): túlcsorduló hossz

`tvc-routines.c:1493-1494`

```c
int len = psram_size() * 1024 * 1024 - free_psram_start;
memset(psram_array, 0xff, len);
```

A `psram_size()` bájtban adja a méretet (`psram.c:336`: `psram_sz <<= 20`), így a
`* 1024 * 1024` 32 biten túlcsordul (8 MB esetén 0), a `len` negatív lesz, és a `memset`
óriási hosszal fut – a PSRAM mögötti memóriát is felülírná. A szándék valószínűleg a drive
területének törlése volt.

- Javítás például: `len = (free_psram_start > psram_size()) ? psram_size() : free_psram_start;`
- Kódolvasás (az emulátorban a javítás nélkül összeomlana).
- Emulátorban: javítva (a drive területét törli).
- Megjegyzés: a függvény a `lfs_psram`-ot nem unmountolja, csak a jelzőt törli.

### 1.5 `REG_FUNCTION_MULTI_EXECUTE`: nincs határellenőrzés

`TVC-IO-main-sys.c`, a `REG_FUNCTION_MULTI_EXECUTE` ága: a paraméterlista mutatója
függvényenként előre lép a `getFunctionParamSize()` szerint, de nincs ellenőrzés, hogy a
`TVC_RAM` végén belül marad-e. Hibás paraméterlistánál a firmware a RAM-on túl olvas.

- Kódolvasás. Emulátorban: ha a lista kifut a kártya RAM-jából, a futás `0x80 + index`
  hibakóddal áll le.

---

## 2. PSRAM drive (`tvc-lfs-psram.c`, `tvc-lfs.c`)

### 2.1 `free_psram_start` mindig „nincs szabad hely” lesz

`tvc-lfs-psram.c:118`

```c
if((num_of_blocks * 4096) < (psram_size() * 1024 * 1024))
```

Ugyanaz a túlcsordulás, mint az 1.4-nél: a jobb oldal 0, a feltétel sosem teljesül, ezért a
`free_psram_start` mindig `0x00ffffff`. A 35-ös függvény így akkor is „nincs szabad PSRAM”-ot
adna, ha a drive csak egy kis részét foglalja.

- Javítás: `(num_of_blocks * 4096) < psram_size()`
- Kódolvasás. Emulátorban: a szándékolt értéket számolja.

### 2.2 PSRAM-ra írás csak `FA_READ`-del együtt

`tvc-lfs-psram.c:135`: a `tvc_lfs_psram_file_open()` a `tvc_lfs_file_open(&lfs_psram, true, …)`
hívással nyit, és a `readOnly = true` miatt (`tvc-lfs.c`: `if(readOnly && ((openMode & FA_READ) == 0)) return LFS_ERR_READONLY_FS;`)
egy csak írásra (`FA_WRITE | FA_CREATE_ALWAYS`) nyitott fájl hibát ad. Az írható PSRAM drive-on
ez valószínűleg nem szándékos (a flash drive-nál érthető).

- Ellenőrizve. Emulátorban: az eredeti viselkedés (a tesztek `FA_READ | FA_WRITE`-tal írnak).

---

## 3. Grafika (`tvc-graphics.c`)

### 3.1 Függőleges görgetés karakteres módokban: szemét a felső sorokban

`tvc-graphics.c:215` és `:237`

```c
uint8_t midLine = (yToUse-21) % 8;
```

`yToUse = y - (scrollY & 7)`, így az első sorokban `yToUse < 21`. A bitmap mód ezt kezeli
(`:193`, `if(yToUse < 21) return;`), a két karakteres mód nem: `(yToUse-21)` negatív, a
`% 8` negatív maradékot ad, ami `uint8_t`-ként 249–255 lesz. A font sorának indexe így a
karakter 8 bájtján kívül esik, és a görgetett terület tetején szemét jelenik meg. (A 0.24-es
megjegyzés szerint ezt javították, de csak a bitmap módban.)

- Javítás: a `copy_2color_text_line()` és a `copy_fullcolor_text_line()` elején is
  `if (yToUse < 21) return;`.
- Kódolvasás. Emulátorban: az eredeti kód fut.

### 3.2 2 színű karakteres mód: a sprite–háttér ütközési maszk felei felcserélődnek

`tvc-graphics.c:226-229`

```c
*pos_of_background = (bitmap_mask>>32);
pos_of_background++;
*pos_of_background = bitmap_mask & 0xffffffff;
```

A `bitmap_mask_buffer` 64 bites elemében a 0. bájt a bal szélső pixel, little-endian
tárolásban tehát az alsó 32 bit a 0–3. pixel. A kód előbb a felső felet (4–7. pixel) írja a
0–3. pozícióra, így a háttérmaszk minden karakteren belül 4 pixellel el van tolva. A
sprite–háttér ütközés 2 színű karakteres módban rossz helyen jelez.

- Javítás: előbb az alsó, aztán a felső fél (vagy egyszerűen `memcpy` 8 bájttal).
- Kódolvasás. Emulátorban: az eredeti kód fut.

### 3.3 `reset_handler`: csak 15 sprite-ot tilt le

`tvc-graphics.c:773`: `for(int i=0; i<15; i++) sprites[i].enabled = false;` – a 16. sprite
kimarad. Következmény nincs, mert a `draw_screen_cycle()` vége mind a 16-ot letiltja, de
valószínűleg `i<16` volt a szándék.

- Kódolvasás.

---

## 4. vSID (`tvc-sid.c`, `tvc-graphics.c`)

### 4.1 Reset után az első hang nem szól

`tvc-sid.c:233` (és a 2–3. hangnál ugyanígy): a `reset_SID()` a `Gate_previous_1 = 1`
értéket állítja, a támadási (attack) fázist pedig csak a gate bit 0 → 1 váltása indítja
(`:664` környéke). Reset után ezért egy rögtön `1`-es gate bittel indított hang nem szólal
meg; előbb 0-t kell írni. Valódi SID-en a gate bekapcsolása mindig indítja az attack-ot.

- Javítás: `Gate_previous_X = 0` a resetben.
- Ellenőrizve. Emulátorban: az eredeti viselkedés.

### 4.2 Nullával osztás

`tvc-sid.c:409-411` (sync) és `:705` / `:712` / `:872` / `:885` / `:1033` / `:1046` (ADSR):
osztás `OSC_x_HiLo`-val és `LFSR*_comparator_value_x`-szel, amelyek 0-k lehetnek (pl. ha egy
hang ADSR-regiszterei még nem kaptak értéket). Az RP2350 ARM magja ilyenkor 0-t ad (nincs
csapda), így a kártyán nem okoz gondot, de C-ben definiálatlan viselkedés, és más
platformon (x86, WebAssembly) a program leáll.

- Javítás: osztás előtt ellenőrzés.
- Ellenőrizve (az emulátorban WebAssembly alatt leállt). Emulátorban: `ARM_DIV()` makró, ami
  az ARM viselkedését utánozza (0 osztó → 0).

### 4.3 TVC reset: a SID hangereje marad

`tvc-graphics.c:776`: a `reset_handler()` `SID[24] = 0`-t ír, de ez csak a regiszterek
másolata; a `MASTER_VOLUME` (és a többi belső változó) csak a `setregister_SID()`-en át
változik. Reset után egy szóló hang tovább szól, amíg a program újra nem ír a regiszterbe.

- Javítás: `setregister_SID(24, 0)` (vagy a gate bitek törlése is).
- Kódolvasás. Emulátorban: az eredeti viselkedés.

---

## 5. Kártya ROM (`Z80/tvc-init.asm`)

### 5.1 USB egér mellett a pendrive nem lesz aktív bootoláskor

`Z80/tvc-init.asm:93-100` (`CHECK_PENDRIVE_PRESENCE`): `cp $02` – a `REG_USB_DETECTED`
értékét pontosan 2-vel hasonlítja. A firmware ezt bitmaszkként állítja (`tvc-usb.c`: bit 0 =
egér, bit 1 = háttértár), így ha egér *és* pendrive is csatlakozik (érték: 3), a ROM úgy
veszi, mintha nem lenne pendrive: nem a pendrive lesz az aktív meghajtó, és az
`auto256k.tvc` sem töltődik be.

- Javítás: `and $02` majd `cp $02` (vagy `bit 1, a`).
- Kódolvasás. Emulátorban: az eredeti viselkedés (a pendrive-ról indításnál az oldal maga
  választja ki a meghajtót).

---

## 6. Kisebbek

- `TVC-IO-main-sys.c:311`: `} if(prev_register_selected == REG_SPRITE_BG_COLLISION_LOW)` –
  hiányzó `else`. Működésbeli hatása nincs.
- Ütközési regiszterek: a `REG_SPRITE_SP_COLLISION_LOW` (és a `_BG_` párja) olvasása a teljes
  16 bites értéket törli, így ha a program előbb az alsó, aztán a felső bájtot olvassa, a
  felső mindig 0. Ha ez szándékos, a dokumentációban érdemes jelezni az olvasási sorrendet
  (előbb a HIGH).
- A fájl- és könyvtárkezelők a Z80 felé nyers 32 bites mutatóként mennek ki
  (`tvc-lfs.c`, `tvc-fatfs.c`). Az RP2350-en működik, de nem hordozható (64 bites gépen
  hibás). Az emulátorban táblaindexre cseréltem.
