/* The TVC256k++ card's vSID output timing for the emulator, replacing the
 * firmware's tvc-sound.c (PWM, DMA and timer IRQ). As on the card, the SID
 * runs at 985 kHz (336 MHz / 341) and a sample is taken every 24 SID clocks
 * (41 kHz) with prepare_unfiltered_output(); register writes take effect at
 * their position within the sample period. Part of Ep128web, GPL-2.0-or-later. */
#include "tvc-card.h"
#include "tvc-sid.h"

extern uint8_t SID[];

static uint32_t sidPos = 0;      /* SID clocks since the last sample, 16.16 */
static int sidDone = 0;          /* clocks already calculated in this period */

void card_sid_power_on(void)
{
    reset_SID();
    sidPos = 0;
    sidDone = 0;
    prepare_unfiltered_output();
}

void card_sid_write(uint8_t addr, uint8_t value)
{
    int now = (int) (sidPos >> 16);
    if (now > sidDone) {
        calculate_SID_voices((uint16_t) (now - sidDone));
        sidDone = now;
    }
    setregister_SID(addr & 0x1f, value);
}

uint8_t card_sid_read(uint8_t addr)
{
    return SID[addr & 0x1f];
}

uint16_t card_sid_clock(uint32_t clocks16)
{
    sidPos += clocks16;
    while (sidPos >= (24U << 16)) {
        if (sidDone < 24)
            calculate_SID_voices((uint16_t) (24 - sidDone));
        sidDone = 0;
        sidPos -= (24U << 16);
        prepare_unfiltered_output();
    }
    return main_volume;
}
