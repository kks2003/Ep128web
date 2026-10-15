// Tests the card's file system (flash drive image, MSC commands) without any
// Z80 code: the parameters are placed into the 2 kB IO RAM the same way the
// card's ROM does it. Usage: card_fs_test flash-root.bin launcher.cas
#include "tvc256kpp_fs.hpp"
#include "card/card_shim.h"
#include "card/tvc-card.h"
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

static int failures = 0, checks = 0;
#define CHECK(c) do { checks++; if (!(c)) { failures++; \
  std::printf("FAIL line %d: %s\n", __LINE__, #c); } } while (0)

static uint8_t io[0x800];                 // $D800-$DFFF: params at +0x100, results at +0x200
static void putStr(int off, const char *s) { io[off] = uint8_t(std::strlen(s)); std::memcpy(&io[off + 1], s, std::strlen(s)); }
static std::string getStr(int off) { return std::string((const char *) &io[off + 1], io[off]); }
static uint32_t u32(int off) { return io[off] | (io[off + 1] << 8) | (io[off + 2] << 16) | (uint32_t(io[off + 3]) << 24); }

enum { OPEN = 1, CLOSE, READ, WRITE, OPENDIR, CLOSEDIR, READDIR, WRITE_SRC, READ_DEST, SEEK, GETCWD,
       CHDIR, MKDIR, DELETE_, RENAME, STAT, SYNC };

static std::vector<uint8_t> slurp(const char *path)
{
  std::vector<uint8_t> v;
  if (FILE *f = std::fopen(path, "rb")) {
    uint8_t b[65536]; size_t n;
    while ((n = std::fread(b, 1, sizeof b, f)) > 0) v.insert(v.end(), b, b + n);
    std::fclose(f);
  }
  return v;
}

static std::vector<std::string> list(const char *dir)
{
  std::vector<std::string> names;
  std::memset(&io[0x100], 0, 0x600);
  putStr(0x100, dir);
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0);
  uint8_t handle[4]; std::memcpy(handle, &io[0x200], 4);
  for (int i = 0; i < 200; i++) {
    std::memcpy(&io[0x100], handle, 4);
    CHECK(TVC256kppFS::mscCommand(READDIR, io) == 0);
    std::string n = getStr(0x200);
    if (n.empty()) break;
    names.push_back(n + (io[0x300] == 0x10 ? "/" : ""));
  }
  std::memcpy(&io[0x100], handle, 4);
  CHECK(TVC256kppFS::mscCommand(CLOSEDIR, io) == 0);
  return names;
}

int main(int argc, char **argv)
{
  if (argc < 3) { std::fprintf(stderr, "usage: %s flash.bin launcher.cas\n", argv[0]); return 2; }
  std::vector<uint8_t> image = slurp(argv[1]), expected = slurp(argv[2]);
  static std::vector<uint8_t> psram(8 << 20);
  TVC256kppFS::attachPsram(&psram[0], 8);

  CHECK(!TVC256kppFS::flashValid());
  CHECK(!TVC256kppFS::loadFlashImage(&image[0], 1000));              // not an image
  CHECK(TVC256kppFS::loadFlashImage(&image[0], image.size()));
  CHECK(TVC256kppFS::flashValid());

  io[0x10] = 2;                                                       // drive: flash
  // directory listing of the root
  std::vector<std::string> root = list("/");
  bool hasGames = false, hasLauncher = false;
  for (auto &n : root) { hasGames |= (n == "games/"); hasLauncher |= (n == "launcher.cas"); }
  CHECK(hasGames && hasLauncher);
  CHECK(list("/games").size() > 10);

  // open + read launcher.cas completely (the card skips the 128 byte CAS header)
  std::memset(&io[0x100], 0, 0x600);
  io[0x100] = 0x01; io[0x101] = 0x11; putStr(0x102, "launcher");     // no extension: first matching .cas
  CHECK(TVC256kppFS::mscCommand(OPEN, io) == 0);
  uint8_t handle[4]; std::memcpy(handle, &io[0x200], 4);
  uint32_t size = u32(0x204);
  CHECK(getStr(0x208) == "launcher.cas");
  CHECK(expected.size() > 128 && size == expected.size() - 128);
  std::vector<uint8_t> got;
  for (int i = 0; i < 100; i++) {
    std::memset(&io[0x100], 0, 0x600);
    std::memcpy(&io[0x100], handle, 4);
    io[0x104] = 0x00; io[0x105] = 0x04;                               // 1024 bytes
    uint8_t r = TVC256kppFS::mscCommand(READ, io);
    unsigned n = io[0x200] | (io[0x201] << 8);
    if (r != 0) { CHECK(r == 0xA9 && n == 0); break; }          // end of file: LFS_ERR_END_OF_FILE + $80
    CHECK(n > 0);
    got.insert(got.end(), &io[0x202], &io[0x202] + n);
  }
  CHECK(got.size() == size);
  CHECK(got.size() == expected.size() - 128 && std::memcmp(&got[0], &expected[128], got.size()) == 0);
  // seek back and read the first bytes again
  std::memset(&io[0x100], 0, 0x600);
  std::memcpy(&io[0x100], handle, 4);                                 // position 0
  CHECK(TVC256kppFS::mscCommand(SEEK, io) == 0);
  std::memcpy(&io[0x100], handle, 4); io[0x104] = 16; io[0x105] = 0;
  CHECK(TVC256kppFS::mscCommand(READ, io) == 0 && io[0x200] == 16);
  CHECK(std::memcmp(&io[0x202], &expected[0], 16) == 0);              // seek is absolute: raw file incl. CAS header
  std::memcpy(&io[0x100], handle, 4);
  CHECK(TVC256kppFS::mscCommand(CLOSE, io) == 0);
  CHECK(TVC256kppFS::stat(0) == 1 && TVC256kppFS::stat(1) >= size);

  // directories: chdir, cwd
  std::memset(&io[0x100], 0, 0x600);
  putStr(0x100, "games");
  CHECK(TVC256kppFS::mscCommand(CHDIR, io) == 0);
  std::memset(&io[0x100], 0, 0x600);
  CHECK(TVC256kppFS::mscCommand(GETCWD, io) == 0 && getStr(0x200) == "/games/");
  std::memset(&io[0x100], 0, 0x600);
  io[0x100] = 0x01; io[0x101] = 0x11; putStr(0x102, "aircraft");     // relative to /games
  CHECK(TVC256kppFS::mscCommand(OPEN, io) == 0 && getStr(0x208) == "aircraft.cas");
  std::memcpy(handle, &io[0x200], 4);
  std::memcpy(&io[0x100], handle, 4);
  CHECK(TVC256kppFS::mscCommand(CLOSE, io) == 0);

  // errors: missing file, read-only flash, drives that are not emulated
  std::memset(&io[0x100], 0, 0x600);
  io[0x100] = 0x01; io[0x101] = 0x11; putStr(0x102, "no-such-file");
  CHECK(TVC256kppFS::mscCommand(OPEN, io) != 0);
  std::memset(&io[0x100], 0, 0x600);
  CHECK(TVC256kppFS::mscCommand(WRITE, io) == 0x8A);                  // FR_WRITE_PROTECTED
  CHECK(TVC256kppFS::mscCommand(MKDIR, io) != 0);
  io[0x10] = 0;                                                       // USB drive: none
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) >= 0x80);
  io[0x10] = 1;                                                       // PSRAM drive: not formatted
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0x83);

  // the same through the card's built-in functions (REG_FUNCTION_EXECUTE),
  // parameters in fast RAM page 4 (U2)
  card_power_on();
  currentP2 = 4;
  uint8_t *par = &TVC_RAM[4 * 0x4000];
  auto func = [&](int f) { card_reg_write(0xC1, 0); card_reg_write(0xC0, uint8_t(f));
                           CHECK(card_reg_read(0xC0) == 0xFF); return card_reg_read(0xC2); };
  TVC_ROM[0x1810] = 2;                                                // flash
  par[0] = 1; par[1] = '/';
  CHECK(func(0x8C) == 0);                                             // chdir back to the root
  par[0] = 0x01; par[1] = 0x11; par[2] = 8; std::memcpy(&par[3], "launcher", 8);
  CHECK(func(0x81) == 0);                                             // open file
  CHECK(par[8] == 12 && std::memcmp(&par[9], "launcher.cas", 12) == 0);
  uint32_t fsize = par[4] | (par[5] << 8) | (par[6] << 16);
  CHECK(fsize == expected.size() - 128);
  uint8_t fh[4]; std::memcpy(fh, par, 4);
  par[4] = 100; par[5] = 0;
  CHECK(func(0x83) == 0);                                             // read 100 bytes
  CHECK((par[4] | (par[5] << 8)) == 100 && std::memcmp(&par[6], &expected[128], 100) == 0);
  std::memcpy(par, fh, 4);
  CHECK(func(0x82) == 0);                                             // close
  // PSRAM drive from a function: create (34), position after it (35), delete (36)
  par[0] = 32; par[1] = 0;
  CHECK(func(34) == 0 && TVC_ROM[0x1824] == 1);
  std::memset(par, 0, 4);
  CHECK(func(35) == 0 && (par[0] | (par[1] << 8) | (par[2] << 16)) == 32 * 4096);
  // write a file on it and read it back (functions 0x81, 0x84, 0x82, 0x83)
  TVC_ROM[0x1810] = 1;
  par[0] = 0x0B; par[1] = 0x01; par[2] = 5; std::memcpy(&par[3], "x.bin", 5);   // the firmware needs FA_READ
  CHECK(func(0x81) == 0);
  std::memcpy(fh, par, 4);
  par[4] = 5; par[5] = 0; std::memcpy(&par[6], "HELLO", 5);
  CHECK(func(0x84) == 0);
  std::memcpy(par, fh, 4);
  CHECK(func(0x82) == 0);
  par[0] = 0x01; par[1] = 0x01; par[2] = 5; std::memcpy(&par[3], "x.bin", 5);
  CHECK(func(0x81) == 0 && par[4] == 5);
  par[4] = 16; par[5] = 0;
  CHECK(func(0x83) == 0 && par[4] == 5 && std::memcmp(&par[6], "HELLO", 5) == 0);
  std::memcpy(par, fh, 4);
  CHECK(func(0x82) == 0);
  CHECK(func(36) == 0 && TVC_ROM[0x1824] == 0);
  io[0x10] = 1;
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0x83);

  // PSRAM drive: format, then make a directory and see it
  CHECK(TVC256kppFS::formatPsramDrive(64));
  io[0x10] = 1;
  std::memset(&io[0x100], 0, 0x600);
  putStr(0x100, "demo");
  CHECK(TVC256kppFS::mscCommand(MKDIR, io) == 0);
  std::vector<std::string> ps = list("/");
  CHECK(ps.size() == 1 && ps[0] == "demo/");
  TVC256kppFS::resetPsramDrive();
  io[0x10] = 1;
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0x83);

  // USB pendrive: plug in an empty one, copy a file, list and read it back
  CHECK(TVC256kppFS::usbAttach(2) && TVC256kppFS::usbPresent());
  CHECK(TVC256kppFS::putUsbFile("Hello.cas", &expected[0], expected.size()));
  io[0x10] = 0;
  std::vector<std::string> uf = list(".");
  CHECK(uf.size() == 1 && (uf[0] == "HELLO.CAS" || uf[0] == "Hello.cas"));
  std::memset(&io[0x100], 0, 0x600);
  io[0x100] = 0x01; io[0x101] = 0x11; putStr(0x102, "hello");
  CHECK(TVC256kppFS::mscCommand(OPEN, io) == 0);
  CHECK(u32(0x204) == expected.size() - 128);
  std::memcpy(handle, &io[0x200], 4);
  std::memset(&io[0x100], 0, 0x600);
  std::memcpy(&io[0x100], handle, 4); io[0x104] = 64; io[0x105] = 0;
  CHECK(TVC256kppFS::mscCommand(READ, io) == 0 && io[0x200] == 64);
  CHECK(std::memcmp(&io[0x202], &expected[128], 64) == 0);
  std::memcpy(&io[0x100], handle, 4);
  CHECK(TVC256kppFS::mscCommand(CLOSE, io) == 0);
  // DSK drive: that pendrive's image as a .dsk file on the PSRAM drive,
  // mounted (MSC_MOUNT_DSK) and listed as drive 3
  size_t imgSize = 0;
  const uint8_t *img = TVC256kppFS::usbImage(imgSize);
  std::vector<uint8_t> dsk(img, img + imgSize);
  TVC256kppFS::usbDetach();
  CHECK(!TVC256kppFS::usbPresent());
  CHECK(TVC256kppFS::putPsramFile("disk.dsk", &dsk[0], dsk.size()));
  io[0x10] = 1;
  std::memset(&io[0x100], 0, 0x600);
  putStr(0x100, "disk.dsk");
  CHECK(TVC256kppFS::mscCommand(0x12, io) == 0 && io[0x25] == 1);    // MSC_MOUNT_DSK
  io[0x10] = 3;
  std::vector<std::string> df = list(".");
  CHECK(df.size() == 1 && (df[0] == "HELLO.CAS" || df[0] == "Hello.cas"));
  CHECK(TVC256kppFS::mscCommand(0x13, io) == 0 && io[0x25] == 0);    // MSC_UMOUNT_DSK
  TVC256kppFS::resetPsramDrive();

  // built-in function 15 (launcher: "load dir to PSRAM"): a directory of
  // the pendrive is copied to a freshly formatted PSRAM drive
  {
    CHECK(TVC256kppFS::usbAttach(2));
    card_power_on();
    currentP2 = 4;
    uint8_t *par = &TVC_RAM[4 * 0x4000];
    io[0x10] = 0;
    std::memset(&io[0x100], 0, 0x600);
    putStr(0x100, "games");
    CHECK(TVC256kppFS::mscCommand(MKDIR, io) == 0);
    CHECK(TVC256kppFS::putUsbFile("games/a.cas", &expected[0], expected.size()));
    CHECK(TVC256kppFS::putUsbFile("games/b.cas", &expected[0], 300));
    TVC_ROM[0x1810] = 0;
    par[0] = 5; std::memcpy(&par[1], "games", 5); par[6] = 0;    // no progress display
    card_reg_write(0xC1, 0); card_reg_write(0xC0, 15);
    CHECK(card_reg_read(0xC2) == 0 && par[0] == 2);                   // 2 files copied
    CHECK(TVC_ROM[0x1824] == 1 && TVC_ROM[0x1810] == 1);              // PSRAM drive, selected
    io[0x10] = 1;
    std::vector<std::string> pl = list("/");
    CHECK(pl.size() == 2);
    TVC256kppFS::usbDetach();
    TVC256kppFS::resetPsramDrive();
  }
  // a file copied to the PSRAM drive by the web page (formats the drive)
  CHECK(TVC256kppFS::putPsramFile("Game.CAS", &expected[0], expected.size()));
  io[0x10] = 1;
  std::vector<std::string> pf = list("/");
  CHECK(pf.size() == 1 && pf[0] == "game.cas");
  // the card reboots (cold reset): flash drive back in the root directory
  io[0x10] = 2;
  std::memset(&io[0x100], 0, 0x600);
  putStr(0x100, "games");
  CHECK(TVC256kppFS::mscCommand(CHDIR, io) == 0);
  TVC256kppFS::powerOn();
  CHECK(TVC256kppFS::mscCommand(GETCWD, io) == 0 && getStr(0x200) == "/");
  io[0x10] = 1;
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0x83);              // PSRAM drive gone

  std::printf("%d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
