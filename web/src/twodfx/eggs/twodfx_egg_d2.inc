/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* D2: animated XY-offset primitives showcase. */
static void egg_activate_d2(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;egg_c2_scene(d,1);d->egg_pending=0u;
}
static void egg_tick_d2(twodfx_emu *d) {
  d->egg_frame++;egg_c2_scene(d,1);
}
