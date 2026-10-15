// Tests the card's file system (flash drive image, MSC commands) without any
// Z80 code: the parameters are placed into the 2 kB IO RAM the same way the
// card's ROM does it. Usage: card_fs_test flash-root.bin launcher.cas
#include "tvc256kpp_fs.hpp"
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
  CHECK(TVC256kppFS::mscCommand(OPENDIR, io) == 0x83);                // FR_NOT_READY
  io[0x10] = 1;                                                       // PSRAM drive: not formatted
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

  std::printf("%d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
