// Ep128web: copied from kks2003/TVC-DiskManager 687900c (src/cas_parser.ts compiled with tsc), MIT, see LICENSE
export class CasParser {
    /**
     * Megvizsgálja, hogy a megadott byte-tömb TVC CAS vagy TVC program formátumú-e,
     * és ha igen, kinyeri a metaadatokat (fejléc, programfejléc, méret, autorun).
     */
    static parse(data) {
        if (!data || data.length < 16) {
            return null;
        }
        // 1. Eset: Szabványos 128-bájtos TVC CAS kazetta / lemez fejléc
        if (data.length >= 128 && (data[0] === 0x11 || data[0] === 0x01)) {
            const fileType = data[0];
            const copyProtected = data[1] !== 0;
            const numBlocks = data[2] | (data[3] << 8);
            const lastBlockLen = data[4] | (data[5] << 8);
            // Érvényesség ellenőrzés
            if (numBlocks > 0 && lastBlockLen >= 0 && lastBlockLen <= 128) {
                const exactLength = 128 + (numBlocks > 0 ? (numBlocks - 1) * 128 + lastBlockLen : 0);
                let hasProgramHeader = false;
                let headerOffset = 128;
                let programType;
                let programLength;
                let autoStart;
                // Ha van legalább 16 bájtnyi adat a 128 bájtos fejléc után:
                if (data.length >= 144) {
                    const ph0 = data[128];
                    const ph1 = data[129];
                    const pLen = data[130] | (data[131] << 8);
                    const pAuto = data[132];
                    // TVC 16-bájtos programfejléc: ph0 = 0x00, ph1 = 0x01 (program) vagy 0x00 (adat)
                    if (ph0 === 0x00 && (ph1 === 0x01 || ph1 === 0x00)) {
                        hasProgramHeader = true;
                        headerOffset = 128;
                        programType = ph1;
                        programLength = pLen;
                        autoStart = (pAuto === 0xFF || (pAuto !== 0x00 && pAuto !== undefined));
                    }
                }
                return {
                    fileType,
                    copyProtected,
                    numBlocks,
                    lastBlockLen,
                    exactLength,
                    hasProgramHeader,
                    headerOffset,
                    programType,
                    programLength,
                    autoStart
                };
            }
        }
        // 2. Eset: Közvetlen 16-bájtos TVC programfejléc a fájl legelején (offset 0, pl. VT-DOS közvetlen fájlok)
        if (data.length >= 16) {
            const ph0 = data[0];
            const ph1 = data[1];
            const pLen = data[2] | (data[3] << 8);
            const pAuto = data[4];
            if (ph0 === 0x00 && (ph1 === 0x01 || ph1 === 0x00) && pLen > 0 && pLen <= data.length + 128) {
                return {
                    fileType: 0x11,
                    copyProtected: false,
                    numBlocks: Math.ceil((16 + pLen) / 128),
                    lastBlockLen: (16 + pLen) % 128 || 128,
                    exactLength: 16 + pLen,
                    hasProgramHeader: true,
                    headerOffset: 0,
                    programType: ph1,
                    programLength: pLen,
                    autoStart: (pAuto === 0xFF || (pAuto !== 0x00 && pAuto !== undefined))
                };
            }
        }
        return null;
    }
    /**
     * Beállítja az AutoRun jelzést a fájl bájtjaiban (0xFF = engedélyezve, 0x00 = tiltva).
     * Visszatér true-val ha a beállítás sikeres volt.
     */
    static setAutoRun(fileBytes, enable) {
        const info = CasParser.parse(fileBytes);
        const autoVal = enable ? 0xFF : 0x00;
        if (info && info.hasProgramHeader) {
            const autoRunOffset = (info.headerOffset || 0) + 4;
            if (fileBytes.length > autoRunOffset) {
                fileBytes[autoRunOffset] = autoVal;
                info.autoStart = enable;
                return true;
            }
        }
        // Ha van 128-bájtos CAS fejléc, de a programfejléc még nem volt kitöltve:
        if (info && info.fileType === 0x11 && fileBytes.length >= 144) {
            fileBytes[128] = 0x00;
            fileBytes[129] = 0x01; // Program
            const pLen = Math.max(0, fileBytes.length - 144);
            fileBytes[130] = pLen & 0xFF;
            fileBytes[131] = (pLen >> 8) & 0xFF;
            fileBytes[132] = autoVal;
            info.hasProgramHeader = true;
            info.autoStart = enable;
            return true;
        }
        return false;
    }
    /**
     * Ellenőrzi, hogy a CAS fejléc és a 16-bájtos programfejléc értékei összhangban vannak-e a fájlmérettel.
     */
    static validateCasHeader(data, overrideLength) {
        const issues = [];
        const fileLen = overrideLength !== undefined ? overrideLength : data.length;
        const curBlocks = data.length >= 4 ? (data[2] | (data[3] << 8)) : 0;
        const curLastBlockLen = data.length >= 6 ? (data[4] | (data[5] << 8)) : 0;
        const expectedBlocks = Math.floor(fileLen / 128);
        const expectedLastBlockLen = fileLen % 128;
        if (curBlocks !== expectedBlocks || curLastBlockLen !== expectedLastBlockLen) {
            issues.push(`CAS blokkméret eltérés: a fejlécben ${curBlocks} blokk és ${curLastBlockLen} B utolsó blokk van, a fájlméret (${fileLen} B) alapján ${expectedBlocks} blokk és ${expectedLastBlockLen} B szükséges (TVC Error 231-et okozhat).`);
        }
        let hasProgramHeader = false;
        let curProgLen = 0;
        let expectedProgLen = Math.max(0, fileLen - 144);
        if (data.length >= 144 && data[128] === 0x00 && (data[129] === 0x01 || data[129] === 0x00)) {
            hasProgramHeader = true;
            curProgLen = data[130] | (data[131] << 8);
            if (curProgLen !== expectedProgLen) {
                issues.push(`Programfejléc méret eltérés: a fejlécben ${curProgLen} B van tárolva, de a fizikai adat ${expectedProgLen} B.`);
            }
        }
        return {
            isValid: issues.length === 0,
            hasProgramHeader,
            issues,
            curBlocks,
            curLastBlockLen,
            expectedBlocks,
            expectedLastBlockLen,
            curProgLen,
            expectedProgLen
        };
    }
    /**
     * Kijavítja a CAS fejlécet és a programfejlécet a CasRepair1.0 logikája szerint.
     * Megszünteti a TVC emulátorokban jelentkező Error 231 (Érvénytelen .CAS fejléc) hibát.
     */
    static repairCasHeader(data) {
        if (data.length < 128) {
            return { repaired: false, changes: ['A fájl túl rövid (< 128 bájt).'] };
        }
        const changes = [];
        const fileLen = data.length;
        // 1. Típusbyte ellenőrzése
        if (data[0] !== 0x11 && data[0] !== 0x01) {
            data[0] = 0x11;
            changes.push('Fájltípus beállítva 0x11-re (Unbuffered/Program).');
        }
        // 2. Blokkok száma és utolsó blokk hossza a CasRepair1.0 képlete szerint
        const newBlocks = Math.floor(fileLen / 128);
        const newLastBlockLen = fileLen % 128;
        const curBlocks = data[2] | (data[3] << 8);
        const curLastBlockLen = data[4] | (data[5] << 8);
        if (curBlocks !== newBlocks || curLastBlockLen !== newLastBlockLen) {
            data[2] = newBlocks & 0xFF;
            data[3] = (newBlocks >> 8) & 0xFF;
            data[4] = newLastBlockLen & 0xFF;
            data[5] = 0x00;
            changes.push(`CAS blokkadatok javítva: ${curBlocks} blk + ${curLastBlockLen} B → ${newBlocks} blk + ${newLastBlockLen} B.`);
        }
        // 3. 16-bájtos TVC programfejléc javítása
        if (data.length >= 144) {
            if (data[128] !== 0x00 || (data[129] !== 0x01 && data[129] !== 0x00)) {
                data[128] = 0x00;
                data[129] = 0x01; // Program típus
                changes.push('16-bájtos TVC programfejléc inicializálva a 128. bájttól.');
            }
            const newProgLen = Math.max(0, fileLen - 144);
            const curProgLen = data[130] | (data[131] << 8);
            if (curProgLen !== newProgLen) {
                data[130] = newProgLen & 0xFF;
                data[131] = (newProgLen >> 8) & 0xFF;
                changes.push(`Programméret javítva a 16-bájtos fejlécben: ${curProgLen} B → ${newProgLen} B.`);
            }
        }
        return {
            repaired: changes.length > 0,
            changes
        };
    }
    /**
     * TVC ROM FAF7 szerinti hardveres CRC-16 számítás (MUDDLE alapérték: 0x2927 vagy 0x0000)
     */
    static calculateTvcCrc16(data, initialCrc = 0x2927) {
        let crc = initialCrc & 0xFFFF;
        for (let i = 0; i < data.length; i++) {
            const byte = data[i];
            for (let bit = 7; bit >= 0; bit--) {
                const bitVal = (byte >> bit) & 1;
                const h = (crc >> 8) & 0xFF;
                const l = crc & 0xFF;
                const a = (bitVal ? 0x80 : 0x00) ^ h;
                const carry = (a & 0x80) !== 0;
                let newH = h;
                let newL = l;
                let carryOut = false;
                if (carry) {
                    newH ^= 0x08;
                    newL ^= 0x10;
                    carryOut = true;
                }
                let hl = (newH << 8) | newL;
                hl = ((hl << 1) + (carryOut ? 1 : 0)) & 0xFFFF;
                crc = hl;
            }
        }
        return crc;
    }
    /**
     * Készít egy érvényes 128 bájtos CAS fejlécet nyers bináris vagy program adathoz.
     */
    static createCasHeader(dataLength, isProgram = true, autoStart = false) {
        const header = new Uint8Array(128);
        header[0] = 0x11; // Unbuffered
        header[1] = 0x00; // Nem másolásvédett
        let numBlocks = 0;
        let lastBlockLen = 0;
        if (dataLength > 0) {
            numBlocks = Math.ceil(dataLength / 128);
            lastBlockLen = dataLength % 128;
            if (lastBlockLen === 0) {
                lastBlockLen = 128;
            }
        }
        header[2] = numBlocks & 0xFF;
        header[3] = (numBlocks >> 8) & 0xFF;
        header[4] = lastBlockLen & 0xFF;
        header[5] = (lastBlockLen >> 8) & 0xFF;
        return header;
    }
}
