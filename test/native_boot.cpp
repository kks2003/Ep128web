// Boots the real TVC 64k+ ROMs (from ep128emu_roms-*.bin) natively, optionally
// with the TVC256k++ card, and dumps state: boot_harness pkg enabled seconds out.ppm
#include <cstdio>
#include <cstdlib>
#include <cstdint>
#include <sys/stat.h>
extern "C" {
const char *ep_last_error();
int ep_init(int);
int ep_set_machine_type(int);
int ep_reset_memory(int);
int ep_load_rom(int, const char *, int);
int ep_reset(int);
int ep_run(int);
int ep_pc();
int ep_read_memory(int);
void ep_write_memory(int, int);
void ep_set_key(int, int);
const uint32_t *ep_frame_buffer();
int ep_frame_width();
int ep_frame_height();
int ep_unpack_rom_package(const char *, const char *);
void ep_set_tvc_card256(int, int);
int ep_load_tvc_card_flash(const char *);
int ep_tvc_card_fs_stat(int);
void ep_audio_clear();
}
static void runMs(int ms) { for (int i = 0; i < ms / 20; i++) { ep_run(20000); ep_audio_clear(); } }
// key codes as in web/shell/ep128.js / test/smoke.js (TVC keyboard)
static int keyCode(char c)
{
  static const char *letters = "abcdefghijklmnopqrstuvwxyz";
  static const int lcodes[26] = {0x0E,0x02,0x03,0x0B,0x15,0x0C,0x0A,0x08,0x48,0x30,0x32,0x34,0x40,
                                 0x00,0x4A,0x4C,0x11,0x13,0x0D,0x14,0x10,0x04,0x16,0x05,0x12,0x06};
  static const int digits[10] = {0x2C,0x19,0x1E,0x1D,0x1B,0x1C,0x1A,0x18,0x28,0x2A};
  if (c >= 'a' && c <= 'z') return lcodes[c - 'a'];
  if (c >= '0' && c <= '9') return digits[c - '0'];
  if (c == ' ') return 0x46;
  if (c == '\n') return 0x3E;
  (void) letters;
  return -1;
}
static void typeText(const char *t)
{
  for (; *t; t++) {
    if (*t == '"') {            // shift + 2 on the Hungarian TVC layout
      ep_set_key(0x07, 1); runMs(60); ep_set_key(0x1E, 1); runMs(80); ep_set_key(0x1E, 0); runMs(40); ep_set_key(0x07, 0); runMs(60);
      continue;
    }
    int k = keyCode(*t);
    if (k < 0) continue;
    ep_set_key(k, 1); runMs(80); ep_set_key(k, 0); runMs(60);
  }
}
int main(int argc, char **argv)
{
  if (argc < 5) return 2;
  mkdir("/tmp/tvcroms", 0755);
  int slot = argc > 5 ? std::atoi(argv[5]) : 2;
  ep_set_tvc_card256(std::atoi(argv[2]), slot);
  if (ep_init(48000) != 0 || ep_set_machine_type(1) != 0) { std::fprintf(stderr, "init %s\n", ep_last_error()); return 1; }
  if (ep_unpack_rom_package(argv[1], "/tmp/tvcroms") < 10) { std::fprintf(stderr, "unpack %s\n", ep_last_error()); return 1; }
  if (const char *fl = std::getenv("CARD_FLASH")) {
    if (ep_load_tvc_card_flash(fl) != 0) { std::fprintf(stderr, "flash: %s\n", ep_last_error()); return 1; }
  }
  ep_reset_memory(128);
  const struct { int seg; const char *f; } roms[] = {{0, "tvc22_sys.rom"}, {2, "tvc22_ext.rom"}, {4, "tvcfileio.rom"}};
  for (auto &r : roms) {
    char p[256]; std::snprintf(p, sizeof p, "/tmp/tvcroms/%s", r.f);
    if (ep_load_rom(r.seg, p, 0) != 0) { std::fprintf(stderr, "rom %s: %s\n", r.f, ep_last_error()); return 1; }
  }
  ep_reset(1);
  runMs(std::atoi(argv[3]) * 1000);
  if (argc > 6) {            // press Enter once, as a user would
    ep_set_key(0x3E, 1); runMs(100); ep_set_key(0x3E, 0); runMs(std::atoi(argv[6]) * 1000);
  }
  if (argc > 7) { typeText(argv[7]); runMs((std::getenv("WAIT_AFTER") ? std::atoi(std::getenv("WAIT_AFTER")) : 3) * 1000); }
  std::printf("pc=%04x\n", ep_pc());
  std::printf("fs opens=%d bytes=%d\n", ep_tvc_card_fs_stat(0), ep_tvc_card_fs_stat(1));
  std::printf("redirect in/out=%02x/%02x ext vectors:", ep_read_memory(0x0B05), ep_read_memory(0x0B0D));
  for (int i = 0x21; i < 0x29; i++) std::printf(" %02x", ep_read_memory(i));
  std::printf("\nisr=%02x %02x %02x\n", ep_read_memory(0x38), ep_read_memory(0x39), ep_read_memory(0x3A));
  for (int a = 0x40; a < 0x100; a += 16) {
    std::printf("%04x:", a);
    for (int i = 0; i < 16; i++) std::printf(" %02x", ep_read_memory(a + i));
    std::printf("\n");
  }
  int w = ep_frame_width(), h = ep_frame_height();
  const uint32_t *fb = ep_frame_buffer();
  if (FILE *f = std::fopen(argv[4], "wb")) {
    std::fprintf(f, "P6\n%d %d\n255\n", w, h);
    for (int i = 0; i < w * h; i++) { uint32_t p = fb[i]; std::fputc(p & 255, f); std::fputc((p >> 8) & 255, f); std::fputc((p >> 16) & 255, f); }
    std::fclose(f);
  }
  return 0;
}
