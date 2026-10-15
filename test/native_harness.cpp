// Native test driver: runs a tiny Z80 program (instead of the TVC system ROM)
// in the TVC64VM of the web build and dumps memory at $8000.
// See test/native_card_test.py for the build and the checks.
#include <cstdio>
#include <cstdlib>
#include <cstdint>
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
void ep_set_tvc_card256(int, int);
}
int main(int argc, char **argv)
{
  if (argc < 4) { std::fprintf(stderr, "usage: %s rom enabled slot\n", argv[0]); return 2; }
  ep_set_tvc_card256(std::atoi(argv[2]), std::atoi(argv[3]));
  if (ep_init(48000) != 0 || ep_set_machine_type(1) != 0) {
    std::fprintf(stderr, "init: %s\n", ep_last_error()); return 1; }
  ep_reset_memory(128);
  if (ep_load_rom(0, argv[1], 0) != 0) {
    std::fprintf(stderr, "rom: %s\n", ep_last_error()); return 1; }
  ep_reset(1);
  for (int i = 0; i < 20; i++)
    ep_run(20000);
  std::printf("pc=%04x\n", ep_pc());
  for (int i = 0; i < 16; i++)
    std::printf("%02x ", ep_read_memory(0x8000 + i));
  std::printf("\n");
  return 0;
}
