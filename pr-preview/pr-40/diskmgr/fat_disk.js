// Ep128web: copied from kks2003/TVC-DiskManager 687900c (src/fat_disk.ts compiled with tsc), MIT, see LICENSE
import { DISK_FORMATS } from './types.js';
import { CasParser } from './cas_parser.js';
export class FatDisk {
    data = new Uint8Array(0);
    format = DISK_FORMATS['vtdos_720k'];
    diskName = 'VTDOS.IMG';
    isLoaded = false;
    currentPath = '\\';
    // BPB mezők
    bytesPerSector = 512;
    sectorsPerCluster = 2;
    reservedSectors = 1;
    numFATs = 2;
    rootEntries = 112;
    totalSectors = 1440;
    mediaDescriptor = 0xF9;
    sectorsPerFAT = 3;
    sectorsPerTrack = 9;
    heads = 2;
    // Számított címek
    fatStart = 512;
    fatSize = 3 * 512;
    rootDirStart = 512 + 2 * (3 * 512); // szektor 7 (offset 3584)
    rootDirSize = 112 * 32; // 3584 bájt = 7 szektor
    dataStart = 3584 + 3584; // szektor 14 (offset 7168)
    totalClusters = 713;
    clusterSize = 1024; // 2 * 512
    /**
     * Megvizsgálja, hogy a bájtok érvényes FAT12 / DOS lemezképet alkotnak-e
     */
    static isFatImage(bytes) {
        if (bytes.length < 512)
            return false;
        const bps = bytes[11] | (bytes[12] << 8);
        const spc = bytes[13];
        const rsv = bytes[14] | (bytes[15] << 8);
        const nf = bytes[16];
        const media = bytes[21];
        const spf = bytes[22] | (bytes[23] << 8);
        if (bps !== 512)
            return false;
        if (spc !== 1 && spc !== 2 && spc !== 4)
            return false;
        if (rsv < 1 || rsv > 32)
            return false;
        if (nf !== 1 && nf !== 2)
            return false;
        if (media < 0xF0)
            return false;
        if (spf < 1 || spf > 64)
            return false;
        // Ellenőrizzük a FAT első 3 bájtját: media, 0xFF, 0xFF
        const fatOff = rsv * bps;
        if (bytes.length >= fatOff + 3) {
            if (bytes[fatOff] === media && bytes[fatOff + 1] === 0xFF && bytes[fatOff + 2] === 0xFF) {
                return true;
            }
        }
        // Boot szignatúra 0x55, 0xAA ellenőrzése
        if (bytes[510] === 0x55 && bytes[511] === 0xAA) {
            return true;
        }
        return false;
    }
    /**
     * Új VT-DOS / FAT12 lemez létrehozása és formázása
     */
    createNew(formatId = 'vtdos_720k', name = 'VTDOS.IMG') {
        const fmt = DISK_FORMATS[formatId] || DISK_FORMATS['vtdos_720k'];
        this.format = fmt;
        this.diskName = name;
        this.currentPath = '\\';
        this.bytesPerSector = 512;
        this.sectorsPerCluster = 2;
        this.reservedSectors = 1;
        this.numFATs = 2;
        this.rootEntries = fmt.id === 'vtdos_360k' ? 112 : 112;
        this.totalSectors = fmt.id === 'vtdos_360k' ? 720 : 1440;
        this.mediaDescriptor = fmt.id === 'vtdos_360k' ? 0xF8 : 0xF9;
        this.sectorsPerFAT = fmt.id === 'vtdos_360k' ? 2 : 3;
        this.sectorsPerTrack = 9;
        this.heads = 2;
        this.recomputeGeometry();
        this.data = new Uint8Array(this.totalSectors * 512);
        this.data.fill(0x00);
        // Boot szektor generálása
        this.data[0] = 0xEB;
        this.data[1] = 0x3C;
        this.data[2] = 0x90;
        // OEM Name: "VTDOS2.0"
        const oem = new TextEncoder().encode("VTDOS2.0");
        this.data.set(oem, 3);
        // BPB mezők
        const view = new DataView(this.data.buffer);
        view.setUint16(11, this.bytesPerSector, true);
        this.data[13] = this.sectorsPerCluster;
        view.setUint16(14, this.reservedSectors, true);
        this.data[16] = this.numFATs;
        view.setUint16(17, this.rootEntries, true);
        view.setUint16(19, this.totalSectors, true);
        this.data[21] = this.mediaDescriptor;
        view.setUint16(22, this.sectorsPerFAT, true);
        view.setUint16(24, this.sectorsPerTrack, true);
        view.setUint16(26, this.heads, true);
        view.setUint16(28, 0, true); // hidden sectors
        // Boot signature
        this.data[510] = 0x55;
        this.data[511] = 0xAA;
        // FAT1 és FAT2 inicializálása
        for (let f = 0; f < this.numFATs; f++) {
            const off = this.fatStart + f * this.fatSize;
            this.data[off] = this.mediaDescriptor;
            this.data[off + 1] = 0xFF;
            this.data[off + 2] = 0xFF;
        }
        this.isLoaded = true;
    }
    /**
     * Meglévő FAT12 lemez betöltése
     */
    load(bytes, name = 'VTDOS.IMG') {
        this.diskName = name;
        this.currentPath = '\\';
        this.bytesPerSector = bytes[11] | (bytes[12] << 8) || 512;
        this.sectorsPerCluster = bytes[13] || 2;
        this.reservedSectors = bytes[14] | (bytes[15] << 8) || 1;
        this.numFATs = bytes[16] || 2;
        this.rootEntries = bytes[17] | (bytes[18] << 8) || 112;
        this.totalSectors = bytes[19] | (bytes[20] << 8) || Math.floor(bytes.length / 512);
        this.mediaDescriptor = bytes[21] || 0xF9;
        this.sectorsPerFAT = bytes[22] | (bytes[23] << 8) || 3;
        this.sectorsPerTrack = bytes[24] | (bytes[25] << 8) || 9;
        this.heads = bytes[26] | (bytes[27] << 8) || 2;
        this.recomputeGeometry();
        this.data = new Uint8Array(bytes.length);
        this.data.set(bytes);
        this.isLoaded = true;
        return true;
    }
    recomputeGeometry() {
        this.fatStart = this.reservedSectors * this.bytesPerSector;
        this.fatSize = this.sectorsPerFAT * this.bytesPerSector;
        this.rootDirStart = this.fatStart + this.numFATs * this.fatSize;
        this.rootDirSize = this.rootEntries * 32;
        this.dataStart = this.rootDirStart + this.rootDirSize;
        this.clusterSize = this.sectorsPerCluster * this.bytesPerSector;
        const dataSectors = this.totalSectors - Math.floor(this.dataStart / this.bytesPerSector);
        this.totalClusters = Math.floor(dataSectors / this.sectorsPerCluster);
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
    getCurrentPath() {
        return this.currentPath;
    }
    setCurrentPath(path) {
        if (!path.startsWith('\\'))
            path = '\\' + path;
        if (path.length > 1 && path.endsWith('\\'))
            path = path.slice(0, -1);
        this.currentPath = path;
    }
    getClusterSize() {
        return this.clusterSize;
    }
    // --- FAT12 lánc kezelés ---
    getNextCluster(cluster) {
        if (cluster < 2 || cluster >= this.totalClusters + 2)
            return 0xFFF;
        const fatOffset = this.fatStart + Math.floor(cluster * 1.5);
        let val;
        if (cluster % 2 === 0) {
            val = this.data[fatOffset] | ((this.data[fatOffset + 1] & 0x0F) << 8);
        }
        else {
            val = (this.data[fatOffset] >> 4) | (this.data[fatOffset + 1] << 4);
        }
        return val;
    }
    setNextCluster(cluster, value) {
        if (cluster < 2)
            return;
        for (let f = 0; f < this.numFATs; f++) {
            const fatOffset = this.fatStart + f * this.fatSize + Math.floor(cluster * 1.5);
            if (cluster % 2 === 0) {
                this.data[fatOffset] = value & 0xFF;
                this.data[fatOffset + 1] = (this.data[fatOffset + 1] & 0xF0) | ((value >> 8) & 0x0F);
            }
            else {
                this.data[fatOffset] = (this.data[fatOffset] & 0x0F) | ((value << 4) & 0xF0);
                this.data[fatOffset + 1] = (value >> 4) & 0xFF;
            }
        }
    }
    getClusterChain(startCluster) {
        const chain = [];
        let current = startCluster;
        const visited = new Set();
        while (current >= 2 && current < 0xFF8 && !visited.has(current)) {
            visited.add(current);
            chain.push(current);
            current = this.getNextCluster(current);
        }
        return chain;
    }
    getClusterOffset(cluster) {
        return this.dataStart + (cluster - 2) * this.clusterSize;
    }
    getFreeClustersCount() {
        let free = 0;
        for (let c = 2; c < this.totalClusters + 2; c++) {
            if (this.getNextCluster(c) === 0) {
                free++;
            }
        }
        return free;
    }
    getTotalClustersCount() {
        return this.totalClusters;
    }
    // --- Könyvtár és Fájl kezelés ---
    /**
     * Egy könyvtár bejegyzéseit tartalmazó nyers bájt puffer lekérdezése
     */
    getDirectoryBuffer(path) {
        if (path === '' || path === '\\') {
            // Gyökérkönyvtár
            const rootSlice = this.data.subarray(this.rootDirStart, this.rootDirStart + this.rootDirSize);
            return {
                bytes: rootSlice,
                writeBack: (updated) => {
                    this.data.set(updated, this.rootDirStart);
                }
            };
        }
        // Alkönyvtár felkeresése
        const parts = path.split('\\').filter(p => p.length > 0);
        let currentCluster = 0;
        // Végigjárjuk az útvonalat a gyökértől
        let currentBuf = this.data.subarray(this.rootDirStart, this.rootDirStart + this.rootDirSize);
        for (let pIdx = 0; pIdx < parts.length; pIdx++) {
            const part = parts[pIdx].toUpperCase();
            const entries = this.parseDirEntriesFromBuffer(currentBuf, '');
            const match = entries.find(e => e.isDirectory && e.fullName.toUpperCase() === part);
            if (!match) {
                throw new Error(`Könyvtár nem található: ${path}`);
            }
            currentCluster = match.firstCluster;
            const chain = this.getClusterChain(currentCluster);
            const subBuf = new Uint8Array(chain.length * this.clusterSize);
            for (let i = 0; i < chain.length; i++) {
                const off = this.getClusterOffset(chain[i]);
                subBuf.set(this.data.subarray(off, off + this.clusterSize), i * this.clusterSize);
            }
            currentBuf = subBuf;
        }
        const chain = this.getClusterChain(currentCluster);
        return {
            bytes: currentBuf,
            writeBack: (updated) => {
                for (let i = 0; i < chain.length; i++) {
                    const off = this.getClusterOffset(chain[i]);
                    const slice = updated.subarray(i * this.clusterSize, (i + 1) * this.clusterSize);
                    this.data.set(slice, off);
                }
            }
        };
    }
    parseDirEntriesFromBuffer(buf, dirPath) {
        const files = [];
        const count = Math.floor(buf.length / 32);
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            const firstByte = buf[off];
            if (firstByte === 0x00)
                break; // Könyvtár vége
            if (firstByte === 0xE5)
                continue; // Törölt fájl
            const attr = buf[off + 11];
            if (attr === 0x0F)
                continue; // LFN (hosszú fájlnév bejegyzés kihagyása)
            const isVolumeLabel = (attr & 0x08) !== 0;
            if (isVolumeLabel)
                continue;
            let name = '';
            for (let n = 0; n < 8; n++) {
                name += String.fromCharCode(buf[off + n]);
            }
            name = name.trim();
            let ext = '';
            for (let e = 0; e < 3; e++) {
                ext += String.fromCharCode(buf[off + 8 + e]);
            }
            ext = ext.trim();
            const fullName = ext ? `${name}.${ext}` : name;
            const isDirectory = (attr & 0x10) !== 0;
            const isReadOnly = (attr & 0x01) !== 0;
            const isHidden = (attr & 0x02) !== 0;
            const isSystem = (attr & 0x04) !== 0;
            const isArchive = (attr & 0x20) !== 0;
            const view = new DataView(buf.buffer, buf.byteOffset + off, 32);
            const firstCluster = view.getUint16(26, true);
            const size = isDirectory ? 0 : view.getUint32(28, true);
            // Idő / dátum
            const timeVal = view.getUint16(22, true);
            const dateVal = view.getUint16(24, true);
            const hour = (timeVal >> 11) & 0x1F;
            const min = (timeVal >> 5) & 0x3F;
            const year = ((dateVal >> 9) & 0x7F) + 1980;
            const month = (dateVal >> 5) & 0x0F;
            const day = dateVal & 0x1F;
            const dateTime = `${year}.${month.toString().padStart(2, '0')}.${day.toString().padStart(2, '0')} ${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
            const chain = isDirectory ? [] : this.getClusterChain(firstCluster);
            let isCas = ext.toUpperCase() === 'CAS';
            let casInfo = undefined;
            if (!isDirectory && chain.length > 0) {
                const firstClusterOff = this.getClusterOffset(chain[0]);
                const headerLen = Math.min(this.clusterSize, size > 0 ? size : this.clusterSize);
                const headerBytes = this.data.subarray(firstClusterOff, firstClusterOff + headerLen);
                const parsed = CasParser.parse(headerBytes);
                if (parsed) {
                    casInfo = parsed;
                    if (parsed.hasProgramHeader || isCas) {
                        isCas = true;
                    }
                }
            }
            files.push({
                name,
                ext,
                fullName,
                path: dirPath,
                size,
                firstCluster,
                isDirectory,
                diskOrder: i,
                isReadOnly,
                isHidden,
                isSystem,
                isArchive,
                dateTime,
                clusterChain: chain,
                isCas,
                casInfo
            });
        }
        return files;
    }
    /**
     * Az aktuális könyvtár fájljainak és alkönyvtárainak listája
     */
    listCurrentDirectory() {
        const dir = this.getDirectoryBuffer(this.currentPath);
        return this.parseDirEntriesFromBuffer(dir.bytes, this.currentPath);
    }
    /**
     * Fájl tartalmának kiolvasása a klaszterláncból
     */
    readFile(fileName) {
        const files = this.listCurrentDirectory();
        const file = files.find(f => !f.isDirectory && f.fullName.toUpperCase() === fileName.toUpperCase());
        if (!file) {
            throw new Error(`Fájl nem található: ${fileName}`);
        }
        const result = new Uint8Array(file.size);
        let bytesRead = 0;
        for (const cluster of file.clusterChain) {
            if (bytesRead >= file.size)
                break;
            const off = this.getClusterOffset(cluster);
            const toRead = Math.min(this.clusterSize, file.size - bytesRead);
            result.set(this.data.subarray(off, off + toRead), bytesRead);
            bytesRead += toRead;
        }
        return result;
    }
    /**
     * Fájl törlése
     */
    deleteFile(fileName) {
        const dir = this.getDirectoryBuffer(this.currentPath);
        const count = Math.floor(dir.bytes.length / 32);
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (dir.bytes[off] === 0x00)
                break;
            if (dir.bytes[off] === 0xE5)
                continue;
            let fn = '';
            for (let n = 0; n < 8; n++)
                fn += String.fromCharCode(dir.bytes[off + n]);
            let ext = '';
            for (let e = 0; e < 3; e++)
                ext += String.fromCharCode(dir.bytes[off + 8 + e]);
            const fullName = ext.trim() ? `${fn.trim()}.${ext.trim()}` : fn.trim();
            if (fullName.toUpperCase() === fileName.toUpperCase()) {
                const isDir = (dir.bytes[off + 11] & 0x10) !== 0;
                const view = new DataView(dir.bytes.buffer, dir.bytes.byteOffset + off, 32);
                const firstCluster = view.getUint16(26, true);
                if (isDir) {
                    // Csak üres könyvtár törölhető
                    const subPath = this.currentPath === '\\' ? `\\${fullName}` : `${this.currentPath}\\${fullName}`;
                    const subDir = this.getDirectoryBuffer(subPath);
                    const subFiles = this.parseDirEntriesFromBuffer(subDir.bytes, subPath)
                        .filter(f => f.fullName !== '.' && f.fullName !== '..');
                    if (subFiles.length > 0) {
                        throw new Error(`A(z) ${fullName} könyvtár nem üres!`);
                    }
                }
                // Klaszterlánc felszabadítása a FAT-ban
                const chain = this.getClusterChain(firstCluster);
                for (const c of chain) {
                    this.setNextCluster(c, 0x000);
                    // Opcionálisan kitisztítjuk a klasztert
                    const cOff = this.getClusterOffset(c);
                    this.data.subarray(cOff, cOff + this.clusterSize).fill(0x00);
                }
                // Bejegyzés törlése (0xE5)
                dir.bytes[off] = 0xE5;
                dir.writeBack(dir.bytes);
                return true;
            }
        }
        throw new Error(`Fájl nem található a törléshez: ${fileName}`);
    }
    /**
     * Új könyvtár létrehozása az aktuális mappában
     */
    createDirectory(dirName) {
        const cleanName = dirName.trim().toUpperCase().replace(/[^A-Z0-9_\-\$]/g, '_').substring(0, 8);
        if (!cleanName)
            throw new Error('Érvénytelen könyvtárnév!');
        const existing = this.listCurrentDirectory();
        if (existing.some(f => f.fullName.toUpperCase() === cleanName)) {
            throw new Error(`Már létezik ilyen nevű fájl vagy könyvtár: ${cleanName}`);
        }
        // Keresünk 1 szabad klasztert az új könyvtárnak
        const newCluster = this.allocateClusters(1)[0];
        if (!newCluster)
            throw new Error('Nincs elég szabad hely a lemezen könyvtár létrehozásához!');
        this.setNextCluster(newCluster, 0xFFF); // EOF
        // Klaszter kitöltése: . és .. bejegyzések
        const clusterOff = this.getClusterOffset(newCluster);
        this.data.subarray(clusterOff, clusterOff + this.clusterSize).fill(0x00);
        const subBuf = this.data.subarray(clusterOff, clusterOff + this.clusterSize);
        // . bejegyzés
        this.formatDirEntry(subBuf, 0, '.', '', 0x10, newCluster, 0);
        // .. bejegyzés (a szülő könyvtár klasztere)
        let parentCluster = 0;
        if (this.currentPath !== '\\') {
            const curDir = this.getDirectoryBuffer(this.currentPath);
            const curEntries = this.parseDirEntriesFromBuffer(curDir.bytes, '');
            const dotDot = curEntries.find(e => e.fullName === '..');
            if (dotDot)
                parentCluster = dotDot.firstCluster;
        }
        this.formatDirEntry(subBuf, 32, '..', '', 0x10, parentCluster, 0);
        // Bejegyzés hozzáadása az aktuális könyvtárhoz
        this.addEntryToCurrentDirectory(cleanName, '', 0x10, newCluster, 0);
        return true;
    }
    /**
     * Fájl kiírása az aktuális könyvtárba
     */
    writeFile(fileName, bytes) {
        const parsed = this.parseFileName(fileName);
        const existing = this.listCurrentDirectory().find(f => f.fullName.toUpperCase() === parsed.fullName.toUpperCase());
        if (existing) {
            if (existing.isDirectory) {
                throw new Error(`Már létezik ilyen nevű könyvtár: ${parsed.fullName}`);
            }
            this.deleteFile(existing.fullName);
        }
        const neededClusters = Math.max(1, Math.ceil(bytes.length / this.clusterSize));
        const freeCount = this.getFreeClustersCount();
        if (freeCount < neededClusters) {
            throw new Error(`Nincs elég szabad hely a lemezen! Szükséges: ${neededClusters * (this.clusterSize / 1024)} KB, Szabad: ${freeCount * (this.clusterSize / 1024)} KB.`);
        }
        const allocated = this.allocateClusters(neededClusters);
        for (let i = 0; i < allocated.length; i++) {
            const c = allocated[i];
            const nextC = (i === allocated.length - 1) ? 0xFFF : allocated[i + 1];
            this.setNextCluster(c, nextC);
            const off = this.getClusterOffset(c);
            const slice = bytes.subarray(i * this.clusterSize, (i + 1) * this.clusterSize);
            this.data.subarray(off, off + this.clusterSize).fill(0x00);
            this.data.set(slice, off);
        }
        this.addEntryToCurrentDirectory(parsed.name, parsed.ext, 0x20, allocated[0], bytes.length);
        return true;
    }
    allocateClusters(count) {
        const result = [];
        for (let c = 2; c < this.totalClusters + 2; c++) {
            if (this.getNextCluster(c) === 0x000) {
                result.push(c);
                if (result.length === count)
                    break;
            }
        }
        return result;
    }
    addEntryToCurrentDirectory(name, ext, attr, firstCluster, size) {
        const dir = this.getDirectoryBuffer(this.currentPath);
        const count = Math.floor(dir.bytes.length / 32);
        let targetIndex = -1;
        for (let i = 0; i < count; i++) {
            const first = dir.bytes[i * 32];
            if (first === 0x00 || first === 0xE5) {
                targetIndex = i;
                break;
            }
        }
        if (targetIndex === -1) {
            throw new Error('A könyvtár megtelt!');
        }
        this.formatDirEntry(dir.bytes, targetIndex * 32, name, ext, attr, firstCluster, size);
        dir.writeBack(dir.bytes);
    }
    formatDirEntry(buf, offset, name, ext, attr, firstCluster, size) {
        const pName = name.toUpperCase().padEnd(8, ' ');
        const pExt = ext.toUpperCase().padEnd(3, ' ');
        for (let i = 0; i < 8; i++)
            buf[offset + i] = pName.charCodeAt(i) & 0x7F;
        for (let i = 0; i < 3; i++)
            buf[offset + 8 + i] = pExt.charCodeAt(i) & 0x7F;
        buf[offset + 11] = attr;
        // Idő és dátum (mostani idő)
        const now = new Date();
        const timeVal = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dateVal = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const view = new DataView(buf.buffer, buf.byteOffset + offset, 32);
        view.setUint16(22, timeVal, true);
        view.setUint16(24, dateVal, true);
        view.setUint16(26, firstCluster, true);
        view.setUint32(28, size, true);
    }
    renameFile(oldName, newName) {
        const parsed = this.parseFileName(newName);
        const dir = this.getDirectoryBuffer(this.currentPath);
        const count = Math.floor(dir.bytes.length / 32);
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (dir.bytes[off] === 0x00)
                break;
            if (dir.bytes[off] === 0xE5)
                continue;
            let fn = '';
            for (let n = 0; n < 8; n++)
                fn += String.fromCharCode(dir.bytes[off + n]);
            let ext = '';
            for (let e = 0; e < 3; e++)
                ext += String.fromCharCode(dir.bytes[off + 8 + e]);
            const fullName = ext.trim() ? `${fn.trim()}.${ext.trim()}` : fn.trim();
            if (fullName.toUpperCase() === oldName.toUpperCase()) {
                const pName = parsed.name.toUpperCase().padEnd(8, ' ');
                const pExt = parsed.ext.toUpperCase().padEnd(3, ' ');
                for (let j = 0; j < 8; j++)
                    dir.bytes[off + j] = pName.charCodeAt(j) & 0x7F;
                for (let j = 0; j < 3; j++)
                    dir.bytes[off + 8 + j] = pExt.charCodeAt(j) & 0x7F;
                dir.writeBack(dir.bytes);
                return true;
            }
        }
        throw new Error(`Fájl nem található: ${oldName}`);
    }
    setAttributes(fileName, isReadOnly, isHidden, isSystem) {
        const dir = this.getDirectoryBuffer(this.currentPath);
        const count = Math.floor(dir.bytes.length / 32);
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (dir.bytes[off] === 0x00)
                break;
            if (dir.bytes[off] === 0xE5)
                continue;
            let fn = '';
            for (let n = 0; n < 8; n++)
                fn += String.fromCharCode(dir.bytes[off + n]);
            let ext = '';
            for (let e = 0; e < 3; e++)
                ext += String.fromCharCode(dir.bytes[off + 8 + e]);
            const fullName = ext.trim() ? `${fn.trim()}.${ext.trim()}` : fn.trim();
            if (fullName.toUpperCase() === fileName.toUpperCase()) {
                let attr = dir.bytes[off + 11];
                if (isReadOnly)
                    attr |= 0x01;
                else
                    attr &= ~0x01;
                if (isHidden)
                    attr |= 0x02;
                else
                    attr &= ~0x02;
                if (isSystem)
                    attr |= 0x04;
                else
                    attr &= ~0x04;
                dir.bytes[off + 11] = attr;
                dir.writeBack(dir.bytes);
                return true;
            }
        }
        return false;
    }
    /**
     * TVC AutoRun jelzés beállítása vagy törlése a megadott fájlban
     */
    setFileAutoRun(fileName, enable) {
        const files = this.listCurrentDirectory();
        const file = files.find(f => !f.isDirectory && f.fullName.toUpperCase() === fileName.toUpperCase());
        if (!file)
            throw new Error(`Fájl nem található: ${fileName}`);
        if (file.clusterChain.length === 0)
            throw new Error("A fájl nem rendelkezik klaszterrel.");
        // Az 1. klaszter tartalmazza a fejléceket
        const clus = file.clusterChain[0];
        const clusOff = this.getClusterOffset(clus);
        const clusterData = this.data.subarray(clusOff, clusOff + this.clusterSize);
        const success = CasParser.setAutoRun(clusterData, enable);
        if (!success) {
            throw new Error("A fájl nem tartalmaz érvényes TVC programfejlécet az AutoRun beállításához.");
        }
        return true;
    }
    /**
     * CAS fejléc és méretek javítása a CasRepair1.0 algoritmussal (Error 231 fix)
     */
    repairFileCasHeader(fileName) {
        const files = this.listCurrentDirectory();
        const file = files.find(f => !f.isDirectory && f.fullName.toUpperCase() === fileName.toUpperCase());
        if (!file)
            throw new Error(`Fájl nem található: ${fileName}`);
        if (file.clusterChain.length === 0)
            throw new Error("A fájl nem rendelkezik klaszterrel.");
        const clus = file.clusterChain[0];
        const clusOff = this.getClusterOffset(clus);
        const clusterData = this.data.subarray(clusOff, clusOff + this.clusterSize);
        return CasParser.repairCasHeader(clusterData);
    }
    getVolumeLabel() {
        const rootBuf = this.data.subarray(this.rootDirStart, this.rootDirStart + this.rootDirSize);
        const count = Math.floor(rootBuf.length / 32);
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (rootBuf[off] === 0x00)
                break;
            if (rootBuf[off] === 0xE5)
                continue;
            const attr = rootBuf[off + 11];
            if ((attr & 0x08) !== 0 && (attr & 0x10) === 0) {
                let label = '';
                for (let j = 0; j < 11; j++) {
                    label += String.fromCharCode(rootBuf[off + j]);
                }
                return label.trim();
            }
        }
        return '';
    }
    setVolumeLabel(newLabel) {
        const rootBuf = this.data.subarray(this.rootDirStart, this.rootDirStart + this.rootDirSize);
        const count = Math.floor(rootBuf.length / 32);
        const cleanLabel = (newLabel || 'TVC_DISC').trim().toUpperCase().replace(/[^A-Z0-9_\-\$]/g, '_').substring(0, 11).padEnd(11, ' ');
        let targetIdx = -1;
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (rootBuf[off] === 0x00)
                break;
            if (rootBuf[off] === 0xE5)
                continue;
            const attr = rootBuf[off + 11];
            if ((attr & 0x08) !== 0 && (attr & 0x10) === 0) {
                targetIdx = i;
                break;
            }
        }
        if (targetIdx === -1) {
            for (let i = 0; i < count; i++) {
                const off = i * 32;
                if (rootBuf[off] === 0x00 || rootBuf[off] === 0xE5) {
                    targetIdx = i;
                    break;
                }
            }
        }
        if (targetIdx === -1)
            throw new Error('A gyökérkönyvtár megtelt!');
        const off = targetIdx * 32;
        for (let j = 0; j < 11; j++) {
            rootBuf[off + j] = cleanLabel.charCodeAt(j) & 0x7F;
        }
        rootBuf[off + 11] = 0x08; // Volume Label attr
        const now = new Date();
        const timeVal = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        const dateVal = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        const view = new DataView(rootBuf.buffer, rootBuf.byteOffset + off, 32);
        view.setUint16(22, timeVal, true);
        view.setUint16(24, dateVal, true);
        view.setUint16(26, 0, true);
        view.setUint32(28, 0, true);
    }
    moveFile(fileName, targetDirName) {
        const curDir = this.getDirectoryBuffer(this.currentPath);
        const count = Math.floor(curDir.bytes.length / 32);
        let srcOff = -1;
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            if (curDir.bytes[off] === 0x00)
                break;
            if (curDir.bytes[off] === 0xE5)
                continue;
            let fn = '';
            for (let n = 0; n < 8; n++)
                fn += String.fromCharCode(curDir.bytes[off + n]);
            let ext = '';
            for (let e = 0; e < 3; e++)
                ext += String.fromCharCode(curDir.bytes[off + 8 + e]);
            const fullName = ext.trim() ? `${fn.trim()}.${ext.trim()}` : fn.trim();
            if (fullName.toUpperCase() === fileName.toUpperCase()) {
                srcOff = off;
                break;
            }
        }
        if (srcOff === -1)
            throw new Error(`Fájl nem található: ${fileName}`);
        // Cél könyvtár útvonal meghatározása
        let targetPath = '';
        if (targetDirName === '..') {
            const p = this.currentPath;
            const lastSlash = p.lastIndexOf('\\');
            targetPath = lastSlash <= 0 ? '\\' : p.substring(0, lastSlash);
        }
        else {
            targetPath = this.currentPath === '\\' ? `\\${targetDirName}` : `${this.currentPath}\\${targetDirName}`;
        }
        const targetDir = this.getDirectoryBuffer(targetPath);
        const targetCount = Math.floor(targetDir.bytes.length / 32);
        let dstOff = -1;
        for (let i = 0; i < targetCount; i++) {
            const off = i * 32;
            if (targetDir.bytes[off] === 0x00 || targetDir.bytes[off] === 0xE5) {
                dstOff = off;
                break;
            }
        }
        if (dstOff === -1)
            throw new Error(`A célkönyvtár (${targetDirName}) megtelt!`);
        // Átmásoljuk a 32 bájtos bejegyzést a célba
        const entryData = new Uint8Array(curDir.bytes.subarray(srcOff, srcOff + 32));
        targetDir.bytes.set(entryData, dstOff);
        targetDir.writeBack(targetDir.bytes);
        // Eredeti könyvtárban 0xE5 (törölt)
        curDir.bytes[srcOff] = 0xE5;
        curDir.writeBack(curDir.bytes);
        return true;
    }
    parseFileName(input) {
        const trimmed = input.trim().replace(/^.*[\\\/]/, '');
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
        name = name.toUpperCase().replace(/[^A-Z0-9_\-\$]/g, '_').substring(0, 8);
        ext = ext.toUpperCase().replace(/[^A-Z0-9_\-\$]/g, '_').substring(0, 3);
        if (!name)
            name = 'FILE';
        const fullName = ext ? `${name}.${ext}` : name;
        return { name, ext, fullName };
    }
    saveImage() {
        return new Uint8Array(this.data);
    }
    /**
     * Térkép vizualizáció (FAT klaszterek leképzése)
     */
    getBlockAllocationMap() {
        const map = [];
        // Rendszerterület: Boot szektor + FAT-ok + Root dir (kb. 14 szektor = 7 klaszternyi méret)
        const systemClusters = Math.ceil(this.dataStart / this.clusterSize);
        for (let i = 0; i < systemClusters; i++) {
            map.push({
                index: i,
                type: i === 0 ? 'system' : 'directory'
            });
        }
        // Klaszterek állapota
        for (let c = 2; c < this.totalClusters + 2; c++) {
            const next = this.getNextCluster(c);
            if (next === 0x000) {
                map.push({
                    index: c,
                    type: 'free'
                });
            }
            else {
                map.push({
                    index: c,
                    type: 'used',
                    fileOwner: `Klaszter #${c}`
                });
            }
        }
        return map;
    }
    /**
     * Lemez töredezettségmentesítése és újrarendezése a megadott rendezési szempont szerint.
     * Minden fájl és könyvtár tartalmát folytonos klaszterláncokba szervezi,
     * a könyvtárbejegyzéseket a kiválasztott rendezési sorrendbe állítja,
     * a szabad klasztereket pedig a lemez végére tömöríti.
     */
    defragment(sortMode) {
        if (!this.isLoaded)
            return;
        const volumeLabel = this.getVolumeLabel();
        // 1. Rekurzívan kinyerjük a gyökérkönyvtárból az összes könyvtárat és fájlt
        const tree = this.collectDirectoryTree('\\');
        // 2. Rendezés a sortMode szerint minden szinten
        this.sortDefragItems(tree, sortMode);
        // 3. FAT táblák és adatterületek alaphelyzetbe állítása
        for (let f = 0; f < this.numFATs; f++) {
            const fatOff = this.fatStart + f * this.fatSize;
            this.data.subarray(fatOff, fatOff + this.fatSize).fill(0x00);
            this.data[fatOff] = this.mediaDescriptor;
            this.data[fatOff + 1] = 0xFF;
            this.data[fatOff + 2] = 0xFF;
        }
        // Gyökérkönyvtár törlése 0x00-val
        this.data.subarray(this.rootDirStart, this.rootDirStart + this.rootDirSize).fill(0x00);
        // Adatterület törlése 0x00-val
        this.data.subarray(this.dataStart, this.data.length).fill(0x00);
        let nextCluster = 2;
        const allocateContiguous = (numClusters) => {
            if (numClusters <= 0)
                return 0;
            if (nextCluster + numClusters > this.totalClusters + 2) {
                throw new Error('Nincs elég hely a lemezen a defragmentáláshoz!');
            }
            const start = nextCluster;
            for (let c = 0; c < numClusters; c++) {
                const clus = start + c;
                if (c === numClusters - 1) {
                    this.setNextCluster(clus, 0xFFF);
                }
                else {
                    this.setNextCluster(clus, clus + 1);
                }
            }
            nextCluster += numClusters;
            return start;
        };
        const writeEntryHeader = (buf, off, item, startCluster, size) => {
            const paddedName = item.name.toUpperCase().padEnd(8, ' ').substring(0, 8);
            const paddedExt = item.ext.toUpperCase().padEnd(3, ' ').substring(0, 3);
            for (let i = 0; i < 8; i++)
                buf[off + i] = paddedName.charCodeAt(i);
            for (let i = 0; i < 3; i++)
                buf[off + 8 + i] = paddedExt.charCodeAt(i);
            let attr = 0;
            if (item.isReadOnly)
                attr |= 0x01;
            if (item.isHidden)
                attr |= 0x02;
            if (item.isSystem)
                attr |= 0x04;
            if (item.isDirectory)
                attr |= 0x10;
            if (item.isArchive)
                attr |= 0x20;
            buf[off + 11] = attr;
            const view = new DataView(buf.buffer, buf.byteOffset + off, 32);
            view.setUint16(22, item.timeVal, true);
            view.setUint16(24, item.dateVal, true);
            view.setUint16(26, startCluster, true);
            view.setUint32(28, size, true);
        };
        const processItem = (item, destBuf, destOffset, parentCluster) => {
            let startCluster = 0;
            let fileSize = 0;
            if (item.isDirectory) {
                const childCount = (item.children ? item.children.length : 0) + 2; // . és ..
                const neededClusters = Math.max(1, Math.ceil((childCount * 32) / this.clusterSize));
                startCluster = allocateContiguous(neededClusters);
                const subBuf = new Uint8Array(neededClusters * this.clusterSize);
                subBuf.fill(0x00);
                // '.' bejegyzés (saját klaszter)
                const dotName = '.'.padEnd(11, ' ');
                for (let i = 0; i < 11; i++)
                    subBuf[i] = dotName.charCodeAt(i);
                subBuf[11] = 0x10;
                const dotView = new DataView(subBuf.buffer, subBuf.byteOffset, 32);
                dotView.setUint16(22, item.timeVal, true);
                dotView.setUint16(24, item.dateVal, true);
                dotView.setUint16(26, startCluster, true);
                dotView.setUint32(28, 0, true);
                // '..' bejegyzés (szülő klaszter)
                const dotDotName = '..'.padEnd(11, ' ');
                for (let i = 0; i < 11; i++)
                    subBuf[32 + i] = dotDotName.charCodeAt(i);
                subBuf[32 + 11] = 0x10;
                const dotDotView = new DataView(subBuf.buffer, subBuf.byteOffset + 32, 32);
                dotDotView.setUint16(22, item.timeVal, true);
                dotDotView.setUint16(24, item.dateVal, true);
                dotDotView.setUint16(26, parentCluster, true);
                dotDotView.setUint32(28, 0, true);
                // Gyerek elemek feldolgozása
                if (item.children && item.children.length > 0) {
                    let subIdx = 2;
                    for (const child of item.children) {
                        processItem(child, subBuf, subIdx * 32, startCluster);
                        subIdx++;
                    }
                }
                // Kiírás az adatterületre
                const off = this.getClusterOffset(startCluster);
                this.data.set(subBuf, off);
            }
            else {
                fileSize = item.bytes.length;
                if (fileSize > 0) {
                    const neededClusters = Math.ceil(fileSize / this.clusterSize);
                    startCluster = allocateContiguous(neededClusters);
                    const off = this.getClusterOffset(startCluster);
                    this.data.set(item.bytes, off);
                }
            }
            writeEntryHeader(destBuf, destOffset, item, startCluster, fileSize);
        };
        // Ha volt kötetcímke, beírjuk a gyökér 0. bejegyzésébe
        let rootEntryIdx = 0;
        if (volumeLabel) {
            const off = this.rootDirStart + rootEntryIdx * 32;
            const padded = volumeLabel.padEnd(11, ' ').substring(0, 11);
            for (let i = 0; i < 11; i++)
                this.data[off + i] = padded.charCodeAt(i);
            this.data[off + 11] = 0x08; // Volume ID
            rootEntryIdx++;
        }
        // Gyökérkönyvtár elemeinek kiírása
        for (const item of tree) {
            if (rootEntryIdx >= this.rootEntries) {
                throw new Error('A gyökérkönyvtár megtelt a defragmentálás során!');
            }
            processItem(item, this.data, this.rootDirStart + rootEntryIdx * 32, 0);
            rootEntryIdx++;
        }
        this.currentPath = '\\';
    }
    collectDirectoryTree(dirPath) {
        const dir = this.getDirectoryBuffer(dirPath);
        const count = Math.floor(dir.bytes.length / 32);
        const items = [];
        for (let i = 0; i < count; i++) {
            const off = i * 32;
            const firstByte = dir.bytes[off];
            if (firstByte === 0x00)
                break;
            if (firstByte === 0xE5)
                continue;
            const attr = dir.bytes[off + 11];
            if (attr === 0x0F)
                continue; // LFN
            if ((attr & 0x08) !== 0)
                continue; // Volume label
            let name = '';
            for (let n = 0; n < 8; n++)
                name += String.fromCharCode(dir.bytes[off + n]);
            name = name.trim();
            let ext = '';
            for (let e = 0; e < 3; e++)
                ext += String.fromCharCode(dir.bytes[off + 8 + e]);
            ext = ext.trim();
            if (name === '.' || name === '..')
                continue;
            const fullName = ext ? `${name}.${ext}` : name;
            const isDirectory = (attr & 0x10) !== 0;
            const isReadOnly = (attr & 0x01) !== 0;
            const isHidden = (attr & 0x02) !== 0;
            const isSystem = (attr & 0x04) !== 0;
            const isArchive = (attr & 0x20) !== 0;
            const view = new DataView(dir.bytes.buffer, dir.bytes.byteOffset + off, 32);
            const firstCluster = view.getUint16(26, true);
            const size = isDirectory ? 0 : view.getUint32(28, true);
            const timeVal = view.getUint16(22, true);
            const dateVal = view.getUint16(24, true);
            if (isDirectory) {
                const subPath = dirPath === '\\' ? `\\${fullName}` : `${dirPath}\\${fullName}`;
                const children = this.collectDirectoryTree(subPath);
                items.push({
                    name,
                    ext,
                    fullName,
                    isDirectory: true,
                    isReadOnly,
                    isHidden,
                    isSystem,
                    isArchive,
                    timeVal,
                    dateVal,
                    bytes: new Uint8Array(0),
                    diskOrder: i,
                    children
                });
            }
            else {
                const chain = this.getClusterChain(firstCluster);
                const fileBytes = new Uint8Array(size);
                let bytesRead = 0;
                for (const clus of chain) {
                    if (bytesRead >= size)
                        break;
                    const clusterOff = this.getClusterOffset(clus);
                    const toRead = Math.min(this.clusterSize, size - bytesRead);
                    fileBytes.set(this.data.subarray(clusterOff, clusterOff + toRead), bytesRead);
                    bytesRead += toRead;
                }
                items.push({
                    name,
                    ext,
                    fullName,
                    isDirectory: false,
                    isReadOnly,
                    isHidden,
                    isSystem,
                    isArchive,
                    timeVal,
                    dateVal,
                    bytes: fileBytes,
                    diskOrder: i
                });
            }
        }
        return items;
    }
    sortDefragItems(items, sortMode) {
        if (sortMode === 'name-asc') {
            items.sort((a, b) => a.fullName.localeCompare(b.fullName));
        }
        else if (sortMode === 'name-desc') {
            items.sort((a, b) => b.fullName.localeCompare(a.fullName));
        }
        else if (sortMode === 'size-asc') {
            items.sort((a, b) => a.bytes.length - b.bytes.length || a.fullName.localeCompare(b.fullName));
        }
        else if (sortMode === 'size-desc') {
            items.sort((a, b) => b.bytes.length - a.bytes.length || a.fullName.localeCompare(b.fullName));
        }
        else {
            items.sort((a, b) => a.diskOrder - b.diskOrder);
        }
        for (const it of items) {
            if (it.children) {
                this.sortDefragItems(it.children, sortMode);
            }
        }
    }
}
