/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
#ifndef TWODFX_FIRMWARE_PAGE_H
#define TWODFX_FIRMWARE_PAGE_H
#include <stdint.h>
/* Independent desktop C99 implementation of public SHOW_FW content.
   Takes palette indices and framebuffer-local storage dimensions. */
void twodfx_firmware_page_render(uint8_t *colour, uint8_t *coverage,
                                 unsigned width, unsigned height, int tvc);
#endif
