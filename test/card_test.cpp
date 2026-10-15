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

// fast RAM address of the function parameter area (REG_FUNCTION_PARAM_START
// = 0, U2 = fast page 4)
static uint8_t *params(TVC256kpp &c) { return c.fastRam() + 4 * 0x4000; }

static int call(TVC256kpp &c, int func)
{
  wr(c, 0x20, 0xC1, 0);
  wr(c, 0x20, 0xC0, func);
  CHECK(rd(c, 0x20, 0xC0) == 0xFF);
  return rd(c, 0x20, 0xC2);
}

// runs a frame up to line n (0: first paper line) and returns its overlay
static const uint8_t *overlayLine(TVC256kpp &c, int n, int paperStart = 0)
{
  c.videoVSync();
  for (int i = 0; i < n; i++)
    c.videoLine(paperStart);
  c.videoLine(paperStart);
  return TVC256kpp::currentOverlay();
}

static void graphicsChecks(TVC256kpp &c)
{
  uint8_t *ram = c.fastRam();
  // power-on: font at $1000, screen RAM $0400 cleared, no overlay
  CHECK(rd(c, 0x20, 0xA3) == 2 && rd(c, 0x20, 0xA1) == 1);
  CHECK(ram[0x400] == 0x20 && ram[0x800] == 0x0F);
  CHECK(overlayLine(c, 0) == 0);
  CHECK(rd(c, 0x20, 0xA9) == 240);
  // print_string_ascii: "AB" -> screen codes 1, 2 in text colour 3
  params(c)[0] = 3;
  CHECK(call(c, 8) == 0);                       // set_text_color
  std::strcpy((char *) params(c), "AB");
  CHECK(call(c, 6) == 0);
  CHECK(ram[0x400] == 1 && ram[0x401] == 2 && ram[0x800] == 3);
  params(c)[0] = 0xFF;
  CHECK(call(c, 9) == 0 && params(c)[0] == 2 && params(c)[1] == 0);   // get_xy
  // 2 colour text mode: the 'A' glyph in colour 3 on the first line
  wr(c, 0x20, 0xA0, 1);
  const uint8_t *ov = overlayLine(c, 1, 100);   // glyph row 1
  CHECK(ov != 0);
  if (ov) {
    uint8_t g = ram[0x1000 + 1 * 8 + 1];
    int px = 0;
    while (px < 8 && !(g & (0x80 >> px)))
      px++;
    CHECK(px < 8 && ov[100 + px * 2] == 0x11 && ov[100 + px * 2 + 1] == 0x11);
    CHECK(ov[99] == 0xFF);                      // left of the paper
  }
  // bitmap mode: clear (transparent), then one dot
  wr(c, 0x20, 0xA0, 3);
  CHECK(call(c, 1) == 0 && ram[0x8000] == 0x88);
  CHECK(overlayLine(c, 0) == 0);
  params(c)[0] = 0x0C;
  CHECK(call(c, 22) == 0);                      // set_pen_color
  params(c)[0] = 10; params(c)[1] = 5;
  CHECK(call(c, 24) == 0);                      // set_dot_color (10, 5)
  CHECK(ram[0x8000 + 5 * 128 + 5] == 0xC8);
  ov = overlayLine(c, 5, 8);
  CHECK(ov && ov[8 + 20] == 0x44 && ov[8 + 21] == 0x44 && ov[8 + 22] == 0xFF);
  // multi execute: set_text_color(5), set_xy(4, 2), get_xy
  uint8_t prg[] = { 8, 5, 10, 4, 2, 9, 0, 0 };
  std::memcpy(params(c), prg, sizeof(prg));
  wr(c, 0x20, 0xC1, 0);
  wr(c, 0x20, 0xC6, 3);
  CHECK(rd(c, 0x20, 0xC6) == 0xFF && rd(c, 0x20, 0xC2) == 0);
  CHECK(params(c)[6] == 4 && params(c)[7] == 2);
  // a failing function stops the list: result = its index, code at [0]
  uint8_t prg2[] = { 8, 1, 0x7F };
  std::memcpy(params(c), prg2, sizeof(prg2));
  wr(c, 0x20, 0xC6, 2);
  CHECK(rd(c, 0x20, 0xC2) == 0x82);
  // sprites: two 2 colour balloons (data at fast RAM 0) at the top left,
  // overlapping -> sprite-sprite collision
  wr(c, 0x20, 0xA0, 0);
  wr(c, 0x20, 0x94, 0);                         // colour mode: 2 colours
  for (int i = 0; i < 2; i++) {
    wr(c, 0x20, 0x00 + i * 2, 24 + i * 4); wr(c, 0x20, 0x01 + i * 2, 0);
    wr(c, 0x20, 0x20 + i * 2, 21);         wr(c, 0x20, 0x21 + i * 2, 0);
    wr(c, 0x20, 0x40 + i, 15);
    wr(c, 0x20, 0x50 + i, 0);
  }
  wr(c, 0x20, 0x90, 3);                         // enable sprites 0 and 1
  CHECK(rd(c, 0x20, 0x90) == 3 && rd(c, 0x20, 0x70) == 1);
  ov = overlayLine(c, 1);                       // balloon row 1: 01 FF C0
  CHECK(ov && ov[6 * 2] == 0xFF && ov[7 * 2] == 0x55 && ov[(7 + 4) * 2] == 0x55);
  CHECK(rd(c, 0x20, 0x96) == 3);                // collision, cleared on read
  CHECK(rd(c, 0x20, 0x96) == 0);
  // collision interrupt at the end of the frame
  wr(c, 0x20, 0x9A, 3);
  overlayLine(c, 239);
  CHECK(c.irqActive());
  rd(c, 0x20, 0x96);
  CHECK(!c.irqActive());
  // vSID: a sawtooth tone at full volume makes the output move
  wr(c, 0x20, 0xE0 + 24, 15);                   // volume
  wr(c, 0x20, 0xE0 + 0, 0x00); wr(c, 0x20, 0xE0 + 1, 0x20);   // ~490 Hz
  wr(c, 0x20, 0xE0 + 5, 0x00); wr(c, 0x20, 0xE0 + 6, 0xF0);   // sustain 15
  wr(c, 0x20, 0xE0 + 4, 0x20);                  // gate off first (the firmware
  for (int i = 0; i < 100; i++) {               // starts the attack on a 0 -> 1 edge)
    int32_t l = 0, r = 0;
    c.renderAudio(l, r);
  }
  wr(c, 0x20, 0xE0 + 4, 0x21);                  // sawtooth + gate
  CHECK(rd(c, 0x20, 0xE0 + 4) == 0x21);
  {
    int32_t mn = 1 << 30, mx = -(1 << 30);
    for (int i = 0; i < 39062; i++) {           // 0.1 s
      int32_t l = 0, r = 0;
      c.renderAudio(l, r);
      if (i > 20000) { if (l < mn) mn = l; if (l > mx) mx = l; }
    }
    CHECK(mx - mn > 2000);
    CHECK(rd(c, 0x20, 0xE0 + 28) == 0);         // envelope 3: voice 3 is silent
  }
  wr(c, 0x20, 0xE0 + 4, 0x20);                  // gate off
  // USB mouse: speed $10 = 0.5; DX/DY clear on read
  TVC256kpp::mouseInput(10, -3, 1);
  CHECK(rd(c, 0x20, 0xD0) == 1 && rd(c, 0x20, 0xD1) == 1);
  CHECK(rd(c, 0x20, 0xD2) == 5 && rd(c, 0x20, 0xD3) == 0xFE);
  CHECK(rd(c, 0x20, 0xD2) == 0);
  TVC256kpp::mouseInput(4, 0, 0);
  CHECK(rd(c, 0x20, 0xD2) == 2 && rd(c, 0x20, 0xD1) == 0);
  wr(c, 0x20, 0xD5, 0x20);                      // speed 1.0
  TVC256kpp::mouseInput(7, 0, 0);
  CHECK(rd(c, 0x20, 0xD5) == 0x20 && rd(c, 0x20, 0xD2) == 7);
  wr(c, 0x20, 0xD5, 0x10);
  // warm reset switches the overlay off
  c.reset(false);
  CHECK(rd(c, 0x20, 0x90) == 0 && overlayLine(c, 1) == 0);
  // the TVC border colour (port $00, bits 7531 = IGRB) used by the scroll border
  c.handleWrite(0x00, 0x2A);                    // G, R, B
  CHECK(rd(c, 0x20, 0xA7) == 7);
  wr(c, 0x20, 0xA5, 0x80);
  ov = overlayLine(c, 10, 0);
  CHECK(ov && ov[0] == 0x15 && ov[15] == 0x15 && ov[16] == 0xFF);
  wr(c, 0x20, 0xA5, 0);
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
  graphicsChecks(c);
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
  // unknown function code: error result and "done"
  wr(c, 0x20, 0xC0, 0x7F);
  CHECK(rd(c, 0x20, 0xC0) == 0xFF && rd(c, 0x20, 0xC2) == 0xFF);
  // border colour is snooped but not consumed
  CHECK(!c.handleWrite(0x00, 0x05) && c.borderColor() == 5);
  // read-only registers
  wr(c, 0x20, 0xC3, 9);
  CHECK(rd(c, 0x20, 0xC3) == 0);

  // cold reset restores power-up paging
  c.reset(true);
  CHECK(rd(c, 0x20, 0xB0) == 4 && rd(c, 0x20, 0xB1) == 5);
  graphicsChecks(c);
  // slot 3 -> base $40
  c.setSlot(3);
  CHECK(c.handleRead(0x40, v) && !c.handleRead(0x20, v));
  CHECK(c.handleSlotROMRead(0xC000, 0xC000, v) && !c.handleSlotROMRead(0xC000, 0x4000, v));

  std::printf("%d checks, %d failures\n", checks, failures);
  return failures ? 1 : 0;
}
