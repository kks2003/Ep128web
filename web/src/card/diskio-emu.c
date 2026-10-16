/* FatFS disk I/O for the emulated TVC256k++ card, in place of the firmware's
 * lib/fatfs/source/diskio_usb.c. Physical drive 0 is the USB pendrive (an
 * image in memory, see tvc256kpp_fs.cpp), drive 1 the mounted .dsk image;
 * the DSK part is the firmware's code (MIT, rppicomidi / Vass Sandor).
 * Part of Ep128web, GPL-2.0-or-later. */
#include "card_shim.h"
#include "fatfs/diskio.h"

#define DRIVE_USB 0
#define DRIVE_DSK 1
#define DSK_SECTOR_SIZE 512

extern uint8_t dsk_file_type;
extern FIL dsk_file_usb;
extern lfs_file_t dsk_file_lfs;
extern lfs_t *dsk_lfs_fs;

/* the pendrive: sectors of 512 bytes, NULL if no pendrive is plugged in */
uint8_t *card_usb_image = NULL;
uint32_t card_usb_sectors = 0;
uint32_t card_usb_writes = 0;       /* counts sector writes (the page saves the files) */

DSTATUS disk_status(BYTE pdrv)
{
    if (pdrv == DRIVE_DSK)
        return dsk_file_type ? 0 : STA_NOINIT | STA_NODISK;
    if (pdrv == DRIVE_USB)
        return card_usb_image ? 0 : STA_NOINIT | STA_NODISK;
    return STA_NOINIT | STA_NODISK;
}

DSTATUS disk_initialize(BYTE pdrv)
{
    if (pdrv == DRIVE_DSK)
        return dsk_file_type ? 0 : STA_NODISK;
    if (pdrv == DRIVE_USB)
        return card_usb_image ? 0 : STA_NOINIT | STA_NODISK;
    return STA_NOINIT;
}

DRESULT disk_read(BYTE pdrv, BYTE *buff, LBA_t sector, UINT count)
{
    if (pdrv == DRIVE_DSK) {
        UINT bytes_read;
        FSIZE_t offset;
        lfs_ssize_t n;
        switch (dsk_file_type) {
        case 1: /* USB drive mounted as .dsk file */
            offset = (FSIZE_t) sector * DSK_SECTOR_SIZE;
            if (f_lseek(&dsk_file_usb, offset) != FR_OK)
                return RES_ERROR;
            if (f_read(&dsk_file_usb, buff, count * DSK_SECTOR_SIZE, &bytes_read) != FR_OK)
                return RES_ERROR;
            return (bytes_read == count * DSK_SECTOR_SIZE) ? RES_OK : RES_ERROR;
        case 2:
        case 3:
            offset = (FSIZE_t) sector * DSK_SECTOR_SIZE;
            if (lfs_file_seek(dsk_lfs_fs, &dsk_file_lfs, offset, LFS_SEEK_SET) < 0)
                return RES_ERROR;
            n = lfs_file_read(dsk_lfs_fs, &dsk_file_lfs, buff, count * DSK_SECTOR_SIZE);
            return (n == (lfs_ssize_t) (count * DSK_SECTOR_SIZE)) ? RES_OK : RES_ERROR;
        default:
            return RES_NOTRDY;
        }
    }
    if (pdrv == DRIVE_USB) {
        if (!card_usb_image)
            return RES_NOTRDY;
        if (sector + count > card_usb_sectors)
            return RES_PARERR;
        memcpy(buff, card_usb_image + (size_t) sector * 512, (size_t) count * 512);
        return RES_OK;
    }
    return RES_PARERR;
}

DRESULT disk_write(BYTE pdrv, const BYTE *buff, LBA_t sector, UINT count)
{
    if (pdrv == DRIVE_DSK) {
        UINT bytes_written;
        FSIZE_t offset;
        lfs_ssize_t n;
        switch (dsk_file_type) {
        case 1:
            offset = (FSIZE_t) sector * DSK_SECTOR_SIZE;
            if (f_lseek(&dsk_file_usb, offset) != FR_OK)
                return RES_ERROR;
            if (f_write(&dsk_file_usb, buff, count * DSK_SECTOR_SIZE, &bytes_written) != FR_OK)
                return RES_ERROR;
            return (bytes_written == count * DSK_SECTOR_SIZE) ? RES_OK : RES_ERROR;
        case 2:
        case 3:
            offset = (FSIZE_t) sector * DSK_SECTOR_SIZE;
            if (lfs_file_seek(dsk_lfs_fs, &dsk_file_lfs, offset, LFS_SEEK_SET) < 0)
                return RES_ERROR;
            n = lfs_file_write(dsk_lfs_fs, &dsk_file_lfs, buff, count * DSK_SECTOR_SIZE);
            return (n == (lfs_ssize_t) (count * DSK_SECTOR_SIZE)) ? RES_OK : RES_ERROR;
        default:
            return RES_NOTRDY;
        }
    }
    if (pdrv == DRIVE_USB) {
        if (!card_usb_image)
            return RES_NOTRDY;
        if (sector + count > card_usb_sectors)
            return RES_PARERR;
        memcpy(card_usb_image + (size_t) sector * 512, buff, (size_t) count * 512);
        card_usb_writes++;
        return RES_OK;
    }
    return RES_PARERR;
}

DRESULT disk_ioctl(BYTE pdrv, BYTE cmd, void *buff)
{
    if (pdrv == DRIVE_DSK) {
        if (!dsk_file_type)
            return RES_NOTRDY;
        switch (cmd) {
        case CTRL_SYNC:
            if (dsk_file_type == 1)
                return f_sync(&dsk_file_usb) == FR_OK ? RES_OK : RES_ERROR;
            return lfs_file_sync(dsk_lfs_fs, &dsk_file_lfs) >= 0 ? RES_OK : RES_ERROR;
        case GET_SECTOR_SIZE:
            *(WORD *) buff = DSK_SECTOR_SIZE;
            return RES_OK;
        case GET_SECTOR_COUNT:
            if (dsk_file_type == 1) {
                *(LBA_t *) buff = f_size(&dsk_file_usb) / DSK_SECTOR_SIZE;
                return RES_OK;
            } else {
                lfs_soff_t size = lfs_file_size(dsk_lfs_fs, &dsk_file_lfs);
                if (size < 0)
                    return RES_ERROR;
                *(LBA_t *) buff = (LBA_t) (size / DSK_SECTOR_SIZE);
                return RES_OK;
            }
        case GET_BLOCK_SIZE:
            *(DWORD *) buff = 1;
            return RES_OK;
        default:
            return RES_PARERR;
        }
    }
    if (pdrv == DRIVE_USB) {
        if (!card_usb_image)
            return RES_NOTRDY;
        switch (cmd) {
        case CTRL_SYNC:
            return RES_OK;
        case GET_SECTOR_COUNT:
            *(LBA_t *) buff = card_usb_sectors;
            return RES_OK;
        case GET_SECTOR_SIZE:
            *(WORD *) buff = 512;
            return RES_OK;
        case GET_BLOCK_SIZE:
            *(DWORD *) buff = 1;
            return RES_OK;
        default:
            return RES_PARERR;
        }
    }
    return RES_PARERR;
}
