// Ep128web: copied from kks2003/TVC-DiskManager 687900c (src/zip_writer.ts compiled with tsc), MIT, see LICENSE
/**
 * Könnyűsúlyú, külső függőség nélküli ZIP készítő (PKZIP 2.0 Store mód)
 * 100%-ban kompatibilis a Windows Intézővel, 7-Zippel, WinRAR-ral stb.
 */
// CRC32 táblázat generálása egyszer
const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c >>> 0;
}
export function calculateCrc32(data) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ data[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}
export class SimpleZip {
    files = [];
    addFile(name, data) {
        this.files.push({ name, data });
    }
    generate() {
        const encoder = new TextEncoder();
        const localHeaders = [];
        const centralHeaders = [];
        let currentOffset = 0;
        const now = new Date();
        const dosTime = ((now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)) & 0xFFFF;
        const dosDate = (((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()) & 0xFFFF;
        for (const file of this.files) {
            const nameBytes = encoder.encode(file.name);
            const crc = calculateCrc32(file.data);
            const size = file.data.length;
            // 1. Local File Header (30 bytes + filename + data)
            const localHdr = new Uint8Array(30 + nameBytes.length + size);
            const lView = new DataView(localHdr.buffer);
            lView.setUint32(0, 0x04034B50, true); // Local file header signature
            lView.setUint16(4, 20, true); // Version needed (2.0)
            lView.setUint16(6, 0, true); // General purpose bit flag
            lView.setUint16(8, 0, true); // Compression method (0 = Store)
            lView.setUint16(10, dosTime, true); // DOS time
            lView.setUint16(12, dosDate, true); // DOS date
            lView.setUint32(14, crc, true); // CRC32
            lView.setUint32(18, size, true); // Compressed size
            lView.setUint32(22, size, true); // Uncompressed size
            lView.setUint16(26, nameBytes.length, true); // File name length
            lView.setUint16(28, 0, true); // Extra field length
            localHdr.set(nameBytes, 30);
            localHdr.set(file.data, 30 + nameBytes.length);
            localHeaders.push(localHdr);
            // 2. Central Directory Header (46 bytes + filename)
            const cdHdr = new Uint8Array(46 + nameBytes.length);
            const cdView = new DataView(cdHdr.buffer);
            cdView.setUint32(0, 0x02014B50, true); // Central directory file header signature
            cdView.setUint16(4, 20, true); // Version made by
            cdView.setUint16(6, 20, true); // Version needed
            cdView.setUint16(8, 0, true); // Bit flag
            cdView.setUint16(10, 0, true); // Compression method (0 = Store)
            cdView.setUint16(12, dosTime, true); // DOS time
            cdView.setUint16(14, dosDate, true); // DOS date
            cdView.setUint32(16, crc, true); // CRC32
            cdView.setUint32(20, size, true); // Compressed size
            cdView.setUint32(24, size, true); // Uncompressed size
            cdView.setUint16(28, nameBytes.length, true); // File name length
            cdView.setUint16(30, 0, true); // Extra field length
            cdView.setUint16(32, 0, true); // Comment length
            cdView.setUint16(34, 0, true); // Disk number start
            cdView.setUint16(36, 0, true); // Internal file attributes
            cdView.setUint32(38, 0, true); // External file attributes
            cdView.setUint32(42, currentOffset, true); // Relative offset of local header
            cdHdr.set(nameBytes, 46);
            centralHeaders.push(cdHdr);
            currentOffset += localHdr.length;
        }
        // 3. End of Central Directory Record (22 bytes)
        const cdOffset = currentOffset;
        let cdSize = 0;
        for (const h of centralHeaders) {
            cdSize += h.length;
        }
        const eocd = new Uint8Array(22);
        const eocdView = new DataView(eocd.buffer);
        eocdView.setUint32(0, 0x06054B50, true); // EOCD signature
        eocdView.setUint16(4, 0, true); // Disk number
        eocdView.setUint16(6, 0, true); // Disk with CD
        eocdView.setUint16(8, this.files.length, true); // Entries on this disk
        eocdView.setUint16(10, this.files.length, true); // Total entries
        eocdView.setUint32(12, cdSize, true); // Size of CD
        eocdView.setUint32(16, cdOffset, true); // Offset of CD
        eocdView.setUint16(20, 0, true); // Comment length
        // Mindent összefűzünk egyetlen Uint8Array-be
        const totalLength = currentOffset + cdSize + 22;
        const result = new Uint8Array(totalLength);
        let pos = 0;
        for (const lh of localHeaders) {
            result.set(lh, pos);
            pos += lh.length;
        }
        for (const cd of centralHeaders) {
            result.set(cd, pos);
            pos += cd.length;
        }
        result.set(eocd, pos);
        return result;
    }
}
