/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C2: unshifted primitives showcase. */
static void egg_activate_c2(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;egg_c2_scene(d,0);d->egg_pending=0u;
}
static void egg_tick_c2(twodfx_emu *d) {
  d->egg_frame++;egg_c2_scene(d,0);
}
