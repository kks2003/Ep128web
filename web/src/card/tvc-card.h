/* Interface between the emulated TVC256k++ card (tvc256kpp.cpp) and the
 * vendored card firmware code (graphics, built-in functions, registers).
 * Part of Ep128web, GPL-2.0-or-later. */
#ifndef TVC_CARD_H
#define TVC_CARD_H

#include <stdint.h>
#include <stdbool.h>

/* the firmware is built for this board (colour bit order, see tvc-graphics.c) */
#define BOARD_RP2350A_PROTOTYPE 0
#define BOARD_RP2350B_PROTOTYPE 0
#define BOARD_PCB_WEACT_RP2350B_PROTOTYPE_REV0 0
#define BOARD_WAVESHARE_RP2350B_PROTOTYPE_V0   0
#define BOARD_PCB_WEACT_RP2350B_PROTOTYPE_REV1 0
#define BOARD_PCB_WEACT_RP2350B_PROTOTYPE_REV2 1

#ifdef __cplusplus
extern "C" {
#endif

/* power-on state of the graphics, the registers and the built-in functions */
void card_power_on(void);
/* TVC reset: the overlay is switched off, the sprites are disabled */
void card_reset(void);

/* register file, without the memory, drive, USB and SID registers that the
 * C++ side handles */
uint8_t card_reg_read(uint8_t r);
void card_reg_write(uint8_t r, uint8_t v);
/* the TVC's border colour port ($00) */
void card_border_write(uint8_t v);

/* video timing: start of a frame (VSYNC), then one call per TVC line with
 * paper. Returns the 256 overlay pixels of the line (bit 4 set: transparent,
 * otherwise IRGB colour in bits 3..0), or NULL if nothing is drawn. */
void card_gfx_vsync(void);
const uint8_t *card_gfx_line(void);

/* the card's /INT output (sprite collision interrupts) */
extern volatile bool card_int_active;

/* paging state that the built-in functions use to find their parameters:
 * 0..15 fast RAM page, 16/17 PSRAM window, 255 not mapped */
extern uint8_t currentP2;
extern uint8_t currentP3;

/* power-on contents of the fast RAM (tvc-card-data.c) */
extern const uint8_t card_font_data[2048];
extern const uint8_t card_bitmap_data[240 * 128];

#ifdef __cplusplus
}
#endif

#endif
