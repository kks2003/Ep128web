// Ep128web: copied from kks2003/TVC-DiskManager 687900c (src/upm_disk.ts compiled with tsc), MIT, see LICENSE
import { DISK_FORMATS } from './types.js';
import { CasParser } from './cas_parser.js';
export class UpmDisk {
    data = new Uint8Array(0);
    format = DISK_FORMATS['96tpi_ds'];
    files = [];
    rawEntries = [];
    isLoaded = false;
    diskName = 'LEMEZ.IMG';
    constructor() {
        this.createNew('96tpi_ds');
    }
    /**
     * Új üres lemezkép létrehozása és formázása
     */
    createNew(formatId = '96tpi_ds', name = 'UJ_LEMEZ.IMG') {
        const fmt = DISK_FORMATS[formatId] || DISK_FORMATS['96tpi_ds'];
        this.format = fmt;
        this.diskName = name;
        this.data = new Uint8Array(fmt.totalSize);
        // Standard CP/M formázás: minden bájt 0xE5
        this.data.fill(0xE5);
        this.isLoaded = true;
        this.refreshCatalog();
    }
    /**
     * Meglévő lemezkép (.img) betöltése bájtokból
     */
    load(bytes, name = 'LEMEZ.IMG') {
        this.diskName = name;
        // Formátum meghatározása méret alapján
        let detectedFormat = null;
        for (const key in DISK_FORMATS) {
            if (DISK_FORMATS[key].totalSize === bytes.length) {
                detectedFormat = DISK_FORMATS[key];
                break;
            }
        }
        if (!detectedFormat) {
            // Ha nem standard méret, de legalább akkora mint a rendszer + dir (22528 bájt)
            // Feltételezzük a standard 720KB-ot ha 737280, egyébként hiba
            if (bytes.length === 737280) {
                detectedFormat = DISK_FORMATS['96tpi_ds'];
            }
            else {
                throw new Error(`Nem támogatott lemezméret: ${bytes.length} bájt. Az UPM lemezek általában 737280 bájtosak (720 KB).`);
            }
        }
        this.format = detectedFormat;
        this.data = new Uint8Array(bytes.length);
        this.data.set(bytes);
        this.isLoaded = true;
        this.refreshCatalog();
        return true;
    }
    getFormat() {
        return this.format;
    }
    getDiskName() {
        return this.diskName;
    }
    setDiskName(name) {
        this.diskName = name;
    }
    isReady() {
        return this.isLoaded;
    }
    getFiles() {
        return this.files;
    }
    getRawEntries() {
        return this.rawEntries;
    }
    /**
     * Lemezkatalógus újraolvasása és felépítése
     */
    refreshCatalog() {
        if (!this.isLoaded)
            return;
        this.rawEntries = [];
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        const maxEntries = this.format.maxDirEntries;
        for (let i = 0; i < maxEntries; i++) {
            const entryOffset = dirOffset + i * 32;
            const raw = this.data.subarray(entryOffset, entryOffset + 32);
            const user = raw[0];
            const isDeleted = (user === 0xE5);
            // Fájlnév és kiterjesztés 7-bites tisztítása
            let nameStr = '';
            for (let n = 1; n <= 8; n++) {
                nameStr += String.fromCharCode(raw[n] & 0x7F);
            }
            nameStr = nameStr.trim();
            let extStr = '';
            for (let e = 9; e <= 11; e++) {
                extStr += String.fromCharCode(raw[e] & 0x7F);
            }
            extStr = extStr.trim();
            const isReadOnly = (raw[9] & 0x80) !== 0;
            const isSystem = (raw[10] & 0x80) !== 0;
            const isArchive = (raw[11] & 0x80) !== 0;
            const ex = raw[12];
            const s1 = raw[13];
            const s2 = raw[14];
            const extentIndex = ex + 32 * s2;
            const rc = raw[15];
            // 8 darab 16-bites blokkmutató (little-endian)
            const blocks = [];
            for (let b = 0; b < 8; b++) {
                const blk = raw[16 + b * 2] | (raw[16 + b * 2 + 1] << 8);
                if (blk !== 0 && !isDeleted) {
                    blocks.push(blk);
                }
            }
            const fullName = extStr ? `${nameStr}.${extStr}` : nameStr;
            this.rawEntries.push({
                index: i,
                offset: entryOffset,
                user,
                name: nameStr,
                ext: extStr,
                fullName,
                ex,
                s1,
                s2,
                extentIndex,
                rc,
                blocks,
                isReadOnly,
                isSystem,
                isArchive,
                isDeleted,
                rawBytes: new Uint8Array(raw)
            });
        }
        // Fájlok csoportosítása felhasználó és név szerint
        const fileMap = new Map();
        for (const ent of this.rawEntries) {
            if (ent.isDeleted || ent.user > 15 || !ent.name) {
                continue;
            }
            const key = `${ent.user}:${ent.fullName}`;
            if (!fileMap.has(key)) {
                fileMap.set(key, []);
            }
            fileMap.get(key).push(ent);
        }
        this.files = [];
        for (const [, entries] of fileMap) {
            // Rendezés extentIndex szerint
            entries.sort((a, b) => a.extentIndex - b.extentIndex);
            const first = entries[0];
            let totalRecords = 0;
            const allBlocks = [];
            for (let i = 0; i < entries.length; i++) {
                const ent = entries[i];
                for (const blk of ent.blocks) {
                    allBlocks.push(blk);
                }
                if (i === entries.length - 1) {
                    // Utolsó extent rekordjai
                    totalRecords += ent.rc;
                }
                else {
                    // Előző extensek teljesek (128 rekord)
                    totalRecords += 128;
                }
            }
            const logicalBytes = totalRecords * 128;
            const allocatedBytes = allBlocks.length * this.format.blockSize;
            let isCas = first.ext.toUpperCase() === 'CAS';
            // Olvassuk ki az első rekordokat a CAS metaadatokhoz, ha releváns
            let casInfo = undefined;
            let exactBytes = logicalBytes;
            if (allBlocks.length > 0) {
                const firstBlockData = this.readBlock(allBlocks[0]);
                if (firstBlockData.length >= 16) {
                    const parsed = CasParser.parse(firstBlockData);
                    if (parsed) {
                        casInfo = parsed;
                        if (parsed.hasProgramHeader || isCas) {
                            isCas = true;
                        }
                        // Ha a logikai méret és a CAS fejléc összhangban van
                        if (parsed.exactLength <= logicalBytes + 128) {
                            exactBytes = parsed.exactLength;
                        }
                    }
                }
            }
            // Ha nem CAS fájl, de szöveges fájl: számítsuk ki a valós szöveghosszt (Ctrl+Z és 0xE5 padding levágásával)
            if (!isCas && this.isTextExt(first.ext) && allBlocks.length > 0) {
                try {
                    const raw = this.readEntriesData(entries, totalRecords);
                    exactBytes = this.trimTextData(raw).length;
                }
                catch {
                    exactBytes = logicalBytes;
                }
            }
            this.files.push({
                user: first.user,
                name: first.name,
                ext: first.ext,
                fullName: first.fullName,
                totalRecords,
                logicalBytes,
                allocatedBytes,
                exactBytes,
                blocks: allBlocks,
                entries,
                diskOrder: first.index,
                isReadOnly: first.isReadOnly,
                isSystem: first.isSystem,
                isCas,
                casInfo
            });
        }
        // Alapértelmezett sorrend: eredeti lemezsorrend (ahogy a katalógusban szerepel)
        this.files.sort((a, b) => a.diskOrder - b.diskOrder);
    }
    /**
     * Egy adott blokk (2048 bájt) kiolvasása a lemezről
     */
    readBlock(blockIndex) {
        if (blockIndex < 0 || blockIndex >= this.format.totalBlocks) {
            throw new Error(`Érvénytelen blokk index: ${blockIndex}`);
        }
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        const offset = dirOffset + blockIndex * this.format.blockSize;
        if (offset + this.format.blockSize > this.data.length) {
            throw new Error(`A blokk túlmutat a lemez méretén: offset 0x${offset.toString(16)}`);
        }
        return this.data.subarray(offset, offset + this.format.blockSize);
    }
    /**
     * Egy adott blokk (2048 bájt) megírása a lemezen
     */
    writeBlock(blockIndex, bytes) {
        if (blockIndex < 0 || blockIndex >= this.format.totalBlocks) {
            throw new Error(`Érvénytelen blokk index: ${blockIndex}`);
        }
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        const offset = dirOffset + blockIndex * this.format.blockSize;
        if (offset + this.format.blockSize > this.data.length) {
            throw new Error(`A blokk túlmutat a lemez méretén: offset 0x${offset.toString(16)}`);
        }
        // Kitöltés 0xE5-tel ha kevesebb
        const blockData = new Uint8Array(this.format.blockSize);
        blockData.fill(0xE5);
        blockData.set(bytes.subarray(0, this.format.blockSize));
        this.data.set(blockData, offset);
    }
    /**
     * Extent bejegyzések adatainak összefűzése
     */
    readEntriesData(entries, totalRecords) {
        const totalLogicalSize = totalRecords * 128;
        const result = new Uint8Array(totalLogicalSize);
        let outOffset = 0;
        let recordsRemaining = totalRecords;
        for (const ent of entries) {
            let entRecords = (ent === entries[entries.length - 1]) ? ent.rc : 128;
            let entRecOffset = 0;
            for (const blk of ent.blocks) {
                if (entRecOffset >= entRecords)
                    break;
                const blkData = this.readBlock(blk);
                const recsFromBlock = Math.min(16, entRecords - entRecOffset);
                const bytesFromBlock = recsFromBlock * 128;
                result.set(blkData.subarray(0, bytesFromBlock), outOffset);
                outOffset += bytesFromBlock;
                entRecOffset += recsFromBlock;
                recordsRemaining -= recsFromBlock;
            }
        }
        return result;
    }
    isTextExt(ext) {
        const textExts = new Set([
            'TXT', 'BAS', 'ASM', 'MAC', 'SUB', 'PAS', 'C', 'H', 'PRN', 'DOC',
            'INC', 'HLP', 'ME', 'BAT', 'INI', 'JSON', 'MD', 'LOG', 'HEX', 'GEN'
        ]);
        return textExts.has(ext.toUpperCase().trim());
    }
    isTextFile(fileName, data) {
        const ext = fileName.split('.').pop()?.toUpperCase() || '';
        if (this.isTextExt(ext))
            return true;
        const sampleSize = Math.min(data.length, 512);
        if (sampleSize === 0)
            return false;
        let textCount = 0;
        for (let i = 0; i < sampleSize; i++) {
            const b = data[i];
            if (b === 0x00)
                return false;
            if (b === 0x09 || b === 0x0A || b === 0x0D || (b >= 0x20 && b <= 0x7E) || b >= 0x80) {
                textCount++;
            }
        }
        return (textCount / sampleSize) > 0.85;
    }
    trimTextData(data) {
        // 1. Ha van benne 0x1A (CP/M EOF / Ctrl+Z), ott ér véget a szöveg
        const eofIdx = data.indexOf(0x1A);
        let end = eofIdx !== -1 ? eofIdx : data.length;
        // 2. Levágjuk a záró 0xE5 (CP/M formázási padding) és 0x00 bájtokat a szöveg végéről
        while (end > 0 && (data[end - 1] === 0xE5 || data[end - 1] === 0x00 || data[end - 1] === 0x1A)) {
            end--;
        }
        return data.subarray(0, end);
    }
    /**
     * Teljes fájl tartalmának kiolvasása
     */
    readFile(fullName, user = 0, exactCas = true) {
        const file = this.files.find(f => f.fullName.toUpperCase() === fullName.toUpperCase() && f.user === user);
        if (!file) {
            throw new Error(`Fájl nem található: [User ${user}] ${fullName}`);
        }
        const raw = this.readEntriesData(file.entries, file.totalRecords);
        if (exactCas && file.isCas && file.casInfo) {
            if (file.casInfo.exactLength > 0 && file.casInfo.exactLength <= raw.length) {
                return raw.subarray(0, file.casInfo.exactLength);
            }
        }
        // Ha nem CAS, de szöveges fájl (pl. TXT, BAS, ASM, SUB)
        if (this.isTextFile(file.fullName, raw)) {
            return this.trimTextData(raw);
        }
        return raw;
    }
    /**
     * Fájl törlése a lemezről
     */
    deleteFile(fullName, user = 0) {
        const file = this.files.find(f => f.fullName.toUpperCase() === fullName.toUpperCase() && f.user === user);
        if (!file) {
            throw new Error(`Fájl nem található: [User ${user}] ${fullName}`);
        }
        if (file.isReadOnly) {
            throw new Error(`A fájl írásvédett (Read-Only): ${fullName}`);
        }
        // Minden kapcsolódó bejegyzés 0. bájtját 0xE5-re állítjuk
        for (const ent of file.entries) {
            this.data[ent.offset] = 0xE5;
            // Az attribútum és név helyeket is 0xE5-re tölthetjük vagy meghagyhatjuk a CP/M szokásoknak megfelelően
            for (let j = 0; j < 32; j++) {
                this.data[ent.offset + j] = 0xE5;
            }
        }
        // A lefoglalt adatblokkokat is 0xE5-tel feltölthetjük a tiszta lemezképért
        for (const blk of file.blocks) {
            const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
            const off = dirOffset + blk * this.format.blockSize;
            this.data.subarray(off, off + this.format.blockSize).fill(0xE5);
        }
        this.refreshCatalog();
        return true;
    }
    /**
     * Fájl átnevezése
     */
    renameFile(oldFullName, newFullName, user = 0) {
        const file = this.files.find(f => f.fullName.toUpperCase() === oldFullName.toUpperCase() && f.user === user);
        if (!file) {
            throw new Error(`Fájl nem található: [User ${user}] ${oldFullName}`);
        }
        if (file.isReadOnly) {
            throw new Error(`A fájl írásvédett: ${oldFullName}`);
        }
        const parsedNew = this.parseFileName(newFullName);
        const existing = this.files.find(f => f.name.toUpperCase() === parsedNew.name.toUpperCase() &&
            f.ext.toUpperCase() === parsedNew.ext.toUpperCase() &&
            f.user === user);
        if (existing) {
            throw new Error(`Már létezik ilyen nevű fájl: [User ${user}] ${parsedNew.fullName}`);
        }
        // Minden kapcsolódó bejegyzés nevének frissítése
        for (const ent of file.entries) {
            // 8 karakter név space-ekkel
            const paddedName = parsedNew.name.toUpperCase().padEnd(8, ' ');
            for (let i = 0; i < 8; i++) {
                this.data[ent.offset + 1 + i] = paddedName.charCodeAt(i) & 0x7F;
            }
            // 3 karakter ext space-ekkel, megőrizve az attribútum biteket!
            const paddedExt = parsedNew.ext.toUpperCase().padEnd(3, ' ');
            for (let i = 0; i < 3; i++) {
                const attrBit = this.data[ent.offset + 9 + i] & 0x80;
                this.data[ent.offset + 9 + i] = (paddedExt.charCodeAt(i) & 0x7F) | attrBit;
            }
        }
        this.refreshCatalog();
        return true;
    }
    /**
     * Fájl attribútumok (Read-Only, System) beállítása
     */
    setFileAttributes(fullName, user, isReadOnly, isSystem) {
        const file = this.files.find(f => f.fullName.toUpperCase() === fullName.toUpperCase() && f.user === user);
        if (!file) {
            throw new Error(`Fájl nem található: [User ${user}] ${fullName}`);
        }
        for (const ent of file.entries) {
            // byte 9: T1 bit 7 = R/O
            if (isReadOnly) {
                this.data[ent.offset + 9] |= 0x80;
            }
            else {
                this.data[ent.offset + 9] &= 0x7F;
            }
            // byte 10: T2 bit 7 = System
            if (isSystem) {
                this.data[ent.offset + 10] |= 0x80;
            }
            else {
                this.data[ent.offset + 10] &= 0x7F;
            }
        }
        this.refreshCatalog();
        return true;
    }
    /**
     * CAS fejléc és méretek javítása a CasRepair1.0 algoritmussal (Error 231 fix)
     */
    repairFileCasHeader(fullName, user = 0) {
        const file = this.files.find(f => f.fullName.toUpperCase() === fullName.toUpperCase() && f.user === user);
        if (!file)
            throw new Error(`Fájl nem található: [User ${user}] ${fullName}`);
        if (file.blocks.length === 0)
            throw new Error("A fájl nem rendelkezik blokkokkal.");
        const blk = file.blocks[0];
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        const blkOffset = dirOffset + blk * this.format.blockSize;
        const blockData = this.data.subarray(blkOffset, blkOffset + this.format.blockSize);
        const result = CasParser.repairCasHeader(blockData);
        if (result.repaired) {
            this.refreshCatalog();
        }
        return result;
    }
    /**
     * TVC AutoRun jelzés beállítása vagy törlése a megadott fájlban
     */
    setFileAutoRun(fullName, user, enable) {
        const file = this.files.find(f => f.fullName.toUpperCase() === fullName.toUpperCase() && f.user === user);
        if (!file) {
            throw new Error(`Fájl nem található: [User ${user}] ${fullName}`);
        }
        if (file.blocks.length === 0) {
            throw new Error("A fájl nem rendelkezik blokkokkal.");
        }
        const blk = file.blocks[0];
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        const blkOffset = dirOffset + blk * this.format.blockSize;
        const blockData = this.data.subarray(blkOffset, blkOffset + this.format.blockSize);
        const success = CasParser.setAutoRun(blockData, enable);
        if (!success) {
            throw new Error("A fájl nem tartalmaz érvényes TVC programfejlécet az AutoRun beállításához.");
        }
        this.refreshCatalog();
        return true;
    }
    /**
     * Új fájl bemásolása / feltöltése a lemezre
     */
    writeFile(fileName, fileBytes, user = 0, wrapInCasIfMissing = false) {
        const parsed = this.parseFileName(fileName);
        let uploadData = fileBytes;
        // Ha a felhasználó CAS fájlként kéri, de nincs rajta CAS fejléc
        if (wrapInCasIfMissing && parsed.ext.toUpperCase() === 'CAS') {
            const parsedCas = CasParser.parse(uploadData);
            if (!parsedCas) {
                const casHdr = CasParser.createCasHeader(uploadData.length);
                const combined = new Uint8Array(128 + uploadData.length);
                combined.set(casHdr, 0);
                combined.set(uploadData, 128);
                uploadData = combined;
            }
        }
        // Ha a fájl már létezik ezzel a névvel és userrel, töröljük először
        const existing = this.files.find(f => f.name.toUpperCase() === parsed.name.toUpperCase() &&
            f.ext.toUpperCase() === parsed.ext.toUpperCase() &&
            f.user === user);
        if (existing) {
            this.deleteFile(existing.fullName, user);
        }
        // CP/M szöveg szabvány: ha a fájl szöveg és a hossza nem osztható 128-cal,
        // a rekord maradékát 0x1A (Ctrl+Z) CP/M EOF bájtokkal töltjük fel 0xE5 helyett!
        const isText = this.isTextFile(fileName, uploadData);
        let writeData = uploadData;
        const remainder = uploadData.length % 128;
        if (isText && remainder !== 0) {
            const padLen = 128 - remainder;
            writeData = new Uint8Array(uploadData.length + padLen);
            writeData.set(uploadData, 0);
            writeData.fill(0x1A, uploadData.length);
        }
        const totalRecords = Math.ceil(writeData.length / 128);
        const recordsPerBlock = this.format.blockSize / 128; // 16
        const neededBlocks = Math.max(1, Math.ceil(totalRecords / recordsPerBlock));
        // Szabad blokkok keresése
        const freeBlocks = this.getFreeBlockIndices();
        if (freeBlocks.length < neededBlocks) {
            throw new Error(`Nincs elég szabad terület a lemezen! Szükséges: ${neededBlocks} blokk (${neededBlocks * 2} KB), Elérhető: ${freeBlocks.length} blokk (${freeBlocks.length * 2} KB).`);
        }
        const allocatedBlocks = freeBlocks.slice(0, neededBlocks);
        // Szükséges extentek száma (max 8 blokk / extent = 128 rekord = 16 KB)
        const neededExtents = Math.ceil(neededBlocks / 8);
        const freeDirEntries = this.getFreeDirEntryIndices();
        if (freeDirEntries.length < neededExtents) {
            throw new Error(`A lemezkatalógus megtelt! Szükséges: ${neededExtents} bejegyzés, Szabad: ${freeDirEntries.length}.`);
        }
        // 1. Adatok kiírása a lefoglalt blokkokba
        let dataOffset = 0;
        for (let i = 0; i < neededBlocks; i++) {
            const blk = allocatedBlocks[i];
            const slice = writeData.subarray(dataOffset, dataOffset + this.format.blockSize);
            this.writeBlock(blk, slice);
            dataOffset += this.format.blockSize;
        }
        // 2. Extent bejegyzések megírása a katalógusba
        const paddedName = parsed.name.toUpperCase().padEnd(8, ' ');
        const paddedExt = parsed.ext.toUpperCase().padEnd(3, ' ');
        let remainingRecords = totalRecords;
        for (let extIdx = 0; extIdx < neededExtents; extIdx++) {
            const dirEntryIdx = freeDirEntries[extIdx];
            const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
            const entryOffset = dirOffset + dirEntryIdx * 32;
            // 32 bájtos bejegyzés előkészítése
            const entryBytes = new Uint8Array(32);
            entryBytes[0] = user & 0x0F;
            // Név (8 bájt)
            for (let i = 0; i < 8; i++) {
                entryBytes[1 + i] = paddedName.charCodeAt(i) & 0x7F;
            }
            // Ext (3 bájt)
            for (let i = 0; i < 3; i++) {
                entryBytes[9 + i] = paddedExt.charCodeAt(i) & 0x7F;
            }
            // Extent szám (EX és S2)
            entryBytes[12] = extIdx & 0x1F;
            entryBytes[13] = 0; // S1
            entryBytes[14] = (extIdx >> 5) & 0xFF; // S2
            // RC: rekordok száma ebben az extentben (max 128)
            const extRecords = Math.min(128, remainingRecords);
            entryBytes[15] = extRecords;
            remainingRecords -= extRecords;
            // Blokk mutatók (8 db 16-bites little endian)
            const startBlkIdx = extIdx * 8;
            for (let b = 0; b < 8; b++) {
                const blkListIdx = startBlkIdx + b;
                if (blkListIdx < allocatedBlocks.length) {
                    const blkNum = allocatedBlocks[blkListIdx];
                    entryBytes[16 + b * 2] = blkNum & 0xFF;
                    entryBytes[16 + b * 2 + 1] = (blkNum >> 8) & 0xFF;
                }
                else {
                    entryBytes[16 + b * 2] = 0;
                    entryBytes[16 + b * 2 + 1] = 0;
                }
            }
            this.data.set(entryBytes, entryOffset);
        }
        this.refreshCatalog();
        return true;
    }
    /**
     * Szabad blokk indexek lekérdezése (a blokk 2-től felfelé, mert 0 és 1 a katalógus)
     */
    getFreeBlockIndices() {
        const usedBlocks = new Set();
        // Katalógus blokkok (0 és 1)
        for (let i = 0; i < this.format.dirBlocks; i++) {
            usedBlocks.add(i);
        }
        for (const ent of this.rawEntries) {
            if (!ent.isDeleted && ent.user <= 15) {
                for (const blk of ent.blocks) {
                    usedBlocks.add(blk);
                }
            }
        }
        const freeList = [];
        for (let blk = this.format.dirBlocks; blk < this.format.totalBlocks; blk++) {
            if (!usedBlocks.has(blk)) {
                freeList.push(blk);
            }
        }
        return freeList;
    }
    /**
     * Szabad katalógustétel indexek
     */
    getFreeDirEntryIndices() {
        const free = [];
        for (let i = 0; i < this.rawEntries.length; i++) {
            if (this.rawEntries[i].isDeleted) {
                free.push(i);
            }
        }
        return free;
    }
    /**
     * Blokk foglaltsági térkép lekérdezése vizualizációhoz
     */
    getBlockAllocationMap() {
        const map = [];
        const blockToFile = new Map();
        for (const file of this.files) {
            for (const blk of file.blocks) {
                blockToFile.set(blk, { name: file.fullName, user: file.user });
            }
        }
        for (let i = 0; i < this.format.totalBlocks; i++) {
            if (i < this.format.dirBlocks) {
                map.push({
                    index: i,
                    type: 'directory'
                });
            }
            else if (blockToFile.has(i)) {
                const info = blockToFile.get(i);
                map.push({
                    index: i,
                    type: 'used',
                    fileOwner: info.name,
                    user: info.user
                });
            }
            else {
                map.push({
                    index: i,
                    type: 'free'
                });
            }
        }
        return map;
    }
    /**
     * Teljes nyers lemezkép kimentése letöltéshez
     */
    saveImage() {
        return new Uint8Array(this.data);
    }
    /**
     * Fájlnév parse (NAME.EXT felbontás, validálás)
     */
    parseFileName(input) {
        const trimmed = input.trim().replace(/^.*[\\\/]/, ''); // elérési út levágása
        const dotIdx = trimmed.lastIndexOf('.');
        let name = '';
        let ext = '';
        if (dotIdx >= 0) {
            name = trimmed.substring(0, dotIdx);
            ext = trimmed.substring(dotIdx + 1);
        }
        else {
            name = trimmed;
            ext = '';
        }
        // Tisztítás: csak megengedett karakterek (angol betűk, számok, _, -, $, !, #, stb.)
        // Szóköz és ékezetek kiszűrése/helyettesítése
        name = name.toUpperCase().replace(/[^A-Z0-9_\-\$!#]/g, '_').substring(0, 8);
        ext = ext.toUpperCase().replace(/[^A-Z0-9_\-\$!#]/g, '_').substring(0, 3);
        if (!name) {
            name = 'FILE';
        }
        const fullName = ext ? `${name}.${ext}` : name;
        return { name, ext, fullName };
    }
    /**
     * Lemez töredezettségmentesítése és újrarendezése a megadott rendezési szempont szerint.
     * Minden fájlt folytonos blokkokba ír ki, a katalógust folytonosan rendezi a lemez elejére,
     * a szabad blokkokat pedig a lemez végére tömöríti egybefüggően.
     */
    defragment(sortMode) {
        if (!this.isLoaded)
            return;
        // 1. Összes fájl beolvasása nyers bájtokkal és attribútumokkal
        const fileDumps = [];
        for (const f of this.files) {
            const rawBytes = this.readFile(f.fullName, f.user, false);
            fileDumps.push({
                user: f.user,
                name: f.name,
                ext: f.ext,
                fullName: f.fullName,
                readOnly: f.isReadOnly,
                system: f.isSystem,
                rawBytes,
                totalRecords: f.totalRecords,
                diskOrder: f.diskOrder
            });
        }
        // 2. Rendezés a sortMode szerint
        if (sortMode === 'name-asc') {
            fileDumps.sort((a, b) => a.fullName.localeCompare(b.fullName));
        }
        else if (sortMode === 'name-desc') {
            fileDumps.sort((a, b) => b.fullName.localeCompare(a.fullName));
        }
        else if (sortMode === 'size-asc') {
            fileDumps.sort((a, b) => a.rawBytes.length - b.rawBytes.length || a.fullName.localeCompare(b.fullName));
        }
        else if (sortMode === 'size-desc') {
            fileDumps.sort((a, b) => b.rawBytes.length - a.rawBytes.length || a.fullName.localeCompare(b.fullName));
        }
        else {
            // 'original': megőrzi az eredeti lemezsorrendet
            fileDumps.sort((a, b) => a.diskOrder - b.diskOrder);
        }
        // 3. Katalógus és adatblokkok törlése 0xE5-tel (rendszer boot sávok 0..3 érintetlenek maradnak)
        const dirOffset = this.format.trackOffset * this.format.sectorsPerTrack * this.format.bytesPerSector;
        this.data.subarray(dirOffset, this.data.length).fill(0xE5);
        // 4. Fájlok és katalógusbejegyzések folytonos visszaírása
        let nextFreeBlock = 2; // 0 és 1 a katalógus (4096 bájt = 2 blokk)
        let nextFreeDirEntry = 0;
        for (const file of fileDumps) {
            const totalRecs = file.totalRecords;
            const recordsPerBlock = this.format.blockSize / 128; // 16 rekord blokkonként (2048 bájt)
            const neededBlocks = Math.max(1, Math.ceil(totalRecs / recordsPerBlock));
            const neededExtents = Math.ceil(neededBlocks / 8);
            // Blokk adatok kiírása folytonosan
            for (let b = 0; b < neededBlocks; b++) {
                const blk = nextFreeBlock + b;
                const slice = file.rawBytes.subarray(b * this.format.blockSize, (b + 1) * this.format.blockSize);
                this.writeBlock(blk, slice);
            }
            // Extentek kiírása a katalógusba folytonosan
            const paddedName = file.name.toUpperCase().padEnd(8, ' ');
            const paddedExt = file.ext.toUpperCase().padEnd(3, ' ');
            let remainingRecords = totalRecs;
            for (let extIdx = 0; extIdx < neededExtents; extIdx++) {
                const dirEntryIdx = nextFreeDirEntry++;
                const entryOffset = dirOffset + dirEntryIdx * 32;
                const entryBytes = new Uint8Array(32);
                entryBytes[0] = file.user & 0x0F;
                // Név (8 bájt)
                for (let i = 0; i < 8; i++) {
                    entryBytes[1 + i] = paddedName.charCodeAt(i) & 0x7F;
                }
                // Kiterjesztés (3 bájt) + attribútumok
                for (let i = 0; i < 3; i++) {
                    entryBytes[9 + i] = paddedExt.charCodeAt(i) & 0x7F;
                }
                if (file.readOnly)
                    entryBytes[9] |= 0x80;
                if (file.system)
                    entryBytes[10] |= 0x80;
                // Extent számok
                entryBytes[12] = extIdx & 0x1F; // EX
                entryBytes[13] = 0; // S1
                entryBytes[14] = Math.floor(extIdx / 32); // S2
                const extRecords = Math.min(128, remainingRecords);
                entryBytes[15] = extRecords;
                remainingRecords -= extRecords;
                // Blokk allokációk (8 db 16-bites mutató, little-endian)
                const startBlkIndex = extIdx * 8;
                for (let i = 0; i < 8; i++) {
                    const blkIdx = startBlkIndex + i;
                    if (blkIdx < neededBlocks) {
                        const blockNum = nextFreeBlock + blkIdx;
                        entryBytes[16 + i * 2] = blockNum & 0xFF;
                        entryBytes[16 + i * 2 + 1] = (blockNum >> 8) & 0xFF;
                    }
                    else {
                        entryBytes[16 + i * 2] = 0;
                        entryBytes[16 + i * 2 + 1] = 0;
                    }
                }
                this.data.set(entryBytes, entryOffset);
            }
            nextFreeBlock += neededBlocks;
        }
        this.refreshCatalog();
    }
}
