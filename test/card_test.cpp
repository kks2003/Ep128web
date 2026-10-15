// Unit test for the TVC256k++ card model (no emulator needed).
// Built and run by test/native_card_test.py
#include "tvc256kpp.hpp"
#include <cstdio>
#include <cstring>

static int failures = 0, checks = 0;
#define CHECK(c) do { checks++; if (!(c)) { failures++; \
  std::printf("FAIL line %d: %s\n", __LINE__, #c); } } while (0)

static int pagingEvents = 0;
static void onPaging(void *) { pagingEvents++; }

static void wr(TVC256kpp &c, int base, int reg, int v)
{
  uint8_t d;
  CHECK(c.handleWrite(base, reg));
  CHECK(c.handleWrite(base + 1, v));
  (void) d;
}
static int rd(TVC256kpp &c, int base, int reg)
{
  uint8_t v = 0xAA;
  CHECK(c.handleWrite(base, reg));
  CHECK(c.handleRead(base + 1, v));
  return v;
}

int main()
{
  TVC256kpp c;
  c.setPagingCallback(onPaging, 0);
  uint8_t v;

  // disabled card does not answer
  CHECK(!c.handleRead(0x20, v));
  CHECK(!c.handleSlotROMRead(0xC000, 0x4000, v));
  c.setEnabled(true);
  c.setSlot(1);
  CHECK(c.getSlot() == 1);

  // port decoding: slot 1 -> base $20, ports +0,+1,+2,+4,+5,+6
  for (int p = 0x20; p <= 0x2F; p++) {
    bool mine = (p == 0x20 || p == 0x21 || p == 0x22 ||
                 p == 0x24 || p == 0x25 || p == 0x26);
    CHECK(c.handleRead(p, v) == mine);
  }
  CHECK(!c.handleRead(0x10, v) && !c.handleRead(0x30, v));

  // identification: firmware version via auto-increment
  c.handleWrite(0x20, 0xC3);
  c.handleRead(0x21, v); CHECK(v == 0);
  c.handleRead(0x21, v); CHECK(v == 24);
  c.handleRead(0x20, v); CHECK(v == 0xC5);
  // increment register: default 1, settable
  c.handleRead(0x22, v); CHECK(v == 1);
  c.handleWrite(0x22, 2);
  c.handleWrite(0x20, 0x00);
  c.handleWrite(0x21, 0x11);
  c.handleWrite(0x21, 0x22);
  CHECK(rd(c, 0x20, 0x00) == 0x11);
  c.handleWrite(0x22, 1);
  CHECK(rd(c, 0x20, 0x01) == 0);
  CHECK(rd(c, 0x20, 0x02) == 0x22);
  // second port set is independent
  c.handleWrite(0x20, 0x40);
  c.handleWrite(0x24, 0xC4);
  c.handleRead(0x25, v); CHECK(v == 24);
  c.handleRead(0x20, v); CHECK(v == 0x40);

  // power-up paging: U2 = fast page 4, U3 = fast page 5
  CHECK(rd(c, 0x20, 0xB0) == 4 && rd(c, 0x20, 0xB1) == 5);
  CHECK(c.getPage(0) == c.fastRam() + 4 * 0x4000);
  CHECK(c.getPage(1) == c.fastRam() + 5 * 0x4000);
  CHECK(rd(c, 0x20, 0xB6) == 8);                 // PSRAM size in MB

  // fast RAM paging, upper bits ignored, $FF = TVC's own RAM
  int ev = pagingEvents;
  wr(c, 0x20, 0xB0, 0xA7);
  CHECK(pagingEvents == ev + 1);
  CHECK(c.getPage(0) == c.fastRam() + 7 * 0x4000);
  c.getPage(0)[0x123] = 0x5A;
  wr(c, 0x20, 0xB0, 0xFF);
  CHECK(c.getPage(0) == 0);
  wr(c, 0x20, 0xB0, 7);
  CHECK(c.getPage(0)[0x123] == 0x5A);

  // PSRAM paging: write-back and reload, page 0x102 (needs high bit)
  wr(c, 0x20, 0xB3, 1);
  wr(c, 0x20, 0xB2, 0x02);
  CHECK(rd(c, 0x20, 0xB0) == 0x10);
  uint8_t *p = c.getPage(0);
  CHECK(p != 0 && p != c.fastRam() + 7 * 0x4000);
  p[0] = 0xDE; p[0x3FFF] = 0xAD;
  wr(c, 0x20, 0xB3, 0);
  wr(c, 0x20, 0xB2, 0x03);                       // another page: write back
  CHECK(c.getPage(0)[0] == 0);
  wr(c, 0x20, 0xB3, 1);
  wr(c, 0x20, 0xB2, 0x02);                       // back again
  CHECK(c.getPage(0)[0] == 0xDE && c.getPage(0)[0x3FFF] == 0xAD);
  CHECK(c.psram()[0x102 * 0x4000] == 0xDE);       // flushed view
  // U3 uses its own buffer ($11)
  wr(c, 0x20, 0xB5, 0);
  wr(c, 0x20, 0xB4, 0x02);
  CHECK(rd(c, 0x20, 0xB1) == 0x11);
  CHECK(c.getPage(1) != c.getPage(0));
  // switching U2 to fast RAM keeps the cached PSRAM page for later
  wr(c, 0x20, 0xB0, 1);
  wr(c, 0x20, 0xB3, 1);
  wr(c, 0x20, 0xB2, 0x02);
  CHECK(c.getPage(0)[0] == 0xDE);

  // IO ROM
  CHECK(c.handleSlotROMRead(0xC000, 0x4000, v) && v == 'M');
  c.handleSlotROMRead(0xC001, 0x4000, v); CHECK(v == 'O');
  c.handleSlotROMRead(0xC004, 0x4000, v); CHECK(v == 6);
  c.handleSlotROMRead(0xC00B, 0x4000, v); CHECK(v == 0x2E);
  c.handleSlotROMRead(0xC00C, 0x4000, v); CHECK(v == 0xC0);
  c.handleSlotROMRead(0xC00D, 0x4000, v); CHECK(v == 16);   // functions
  CHECK(!c.handleSlotROMRead(0xC000, 0x8000, v));            // other slot
  CHECK(!c.handleSlotROMRead(0xC000, 0x0000, v));
  uint8_t p0; c.handleSlotROMRead(0xC100, 0x4000, p0);
  wr(c, 0x20, 0xB7, 1);
  CHECK(rd(c, 0x20, 0xB7) == 1);
  uint8_t p1; c.handleSlotROMRead(0xC100, 0x4000, p1);
  CHECK(p0 != p1);                                            // page 1 differs
  wr(c, 0x20, 0xB7, 7);                                       // ignored
  CHECK(rd(c, 0x20, 0xB7) == 1);
  wr(c, 0x20, 0xB7, 0);
  // the area above $D800 is RAM
  CHECK(c.handleSlotROMWrite(0xD900, 0x4000, 0x77));
  c.handleSlotROMRead(0xD900, 0x4000, v); CHECK(v == 0x77);
  c.handleSlotROMWrite(0xC000, 0x4000, 0x00);                // ROM: ignored
  c.handleSlotROMRead(0xC000, 0x4000, v); CHECK(v == 'M');
  // REG_DRIVE_SELECT is mirrored at $D810
  wr(c, 0x20, 0xC5, 2);
  c.handleSlotROMRead(0xD810, 0x4000, v); CHECK(v == 2);
  c.handleSlotROMWrite(0xD810, 0x4000, 1);
  CHECK(rd(c, 0x20, 0xC5) == 1);
  // unimplemented function call reports error and "done"
  wr(c, 0x20, 0xC0, 0x19);
  CHECK(rd(c, 0x20, 0xC0) == 0xFF && rd(c, 0x20, 0xC2) != 0);
  // border colour is snooped but not consumed
  CHECK(!c.handleWrite(0x00, 0x05) && c.borderColor() == 5);
  // read-only registers
  wr(c, 0x20, 0xC3, 9);
  CHECK(rd(c, 0x20, 0xC3) == 0);

  // cold reset restores power-up paging
  c.reset(true);
  CHECK(rd(c, 0x20, 0xB0) == 4 && rd(c, 0x20, 0xB1) == 5);
  // slot 3 -> base $40
  c.setSlot(3);
  CHECK(c.handleRead(0x40, v) && !c.handleRead(0x20, v));
  CHECK(c.handleSlotROMRead(0xC000, 0xC000, v) && !c.handleSlotROMRead(0xC000, 0x4000, v));

  std::printf("%d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
