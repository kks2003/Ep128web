/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* 2dfx: independently written TVC D0 tearing-test behavior.
 * Scene and timing constants are part of the public 2dfx observable demo.
 * Uses ordinary BG 2DPT SET_COLOR/FILL_RECT/RET and VSYNC publication.
 */
#define D0_MODE_FRAMES 1250u /* 25s at 50 accepted frames per second */

static void d0_full_frame(twodfx_emu *d, uint8_t colour) {
  uint8_t p[5];
  blank_entries(d);
  p[0]=(uint8_t)(colour << 4); /* SET_COLOR fg, bg=black */
  egg_set_entry(d,0,0x61u,p,1);
  p[0]=egg_xywh_high(0u,41u,704u,256u);
  p[1]=0u;p[2]=41u;p[3]=(uint8_t)704u;p[4]=0u;
  egg_set_entry(d,1,0x67u,p,5);
  egg_set_entry(d,2,0x7fu,NULL,0);
}
static void d0_split_frame(twodfx_emu *d, unsigned boundary) {
  uint8_t p[5];
  blank_entries(d);
  p[0]=0u;
  egg_set_entry(d,0,0x61u,p,1);
  p[0]=egg_xywh_high(0u,41u,704u,256u);
  p[1]=0u;p[2]=41u;p[3]=(uint8_t)704u;p[4]=0u;
  egg_set_entry(d,1,0x67u,p,5);
  if(boundary < 704u) {
    p[0]=0xf0u; /* fg white, bg black */
    egg_set_entry(d,2,0x61u,p,1);
    p[0]=egg_xywh_high(boundary,41u,704u-boundary,256u);
    p[1]=(uint8_t)boundary;p[2]=41u;
    p[3]=(uint8_t)(704u-boundary);p[4]=0u;
    egg_set_entry(d,3,0x67u,p,5);
    egg_set_entry(d,4,0x7fu,NULL,0);
  } else egg_set_entry(d,2,0x7fu,NULL,0);
}
static void egg_activate_d0(twodfx_emu *d) {
  if(d->egg_id!=16u || !egg_supported(d,d->egg_id)) {
    egg_stop(d);return;
  }
  egg_clean_scene(d);
  d->fps=50u;
  d->d0_mode=0u;
  d->d0_mode_ticks=0u;
  d->d0_flash_phase=0u;
  d->d0_boundary=80u;
  d->d0_boundary_step=16;
  d->d0_set_key_next_tick=1u;
  d0_full_frame(d,2u);
  d->egg_pending=0u;
}
static void egg_tick_d0(twodfx_emu *d) {
  if(d->d0_set_key_next_tick) {
    d->transparent=1u;
    d->d0_set_key_next_tick=0u;
  }
  if(d->d0_mode==0u) {
    d0_full_frame(d,d->d0_flash_phase?13u:2u);
    d->d0_flash_phase^=1u;
  } else {
    int next;
    d0_split_frame(d,d->d0_boundary);
    next=(int)d->d0_boundary+(int)d->d0_boundary_step;
    if(next>=688) { d->d0_boundary=688u;d->d0_boundary_step=-16; }
    else if(next<=80) { d->d0_boundary=80u;d->d0_boundary_step=16; }
    else d->d0_boundary=(uint16_t)next;
  }
  d->d0_mode_ticks++;
  if(d->d0_mode_ticks==D0_MODE_FRAMES) {
    d->d0_mode_ticks=0u;
    if(d->d0_mode==0u) {
      d->d0_mode=1u;
      d->d0_boundary=80u;
      d->d0_boundary_step=16;
    } else {
      d->d0_mode=0u;
      d->d0_flash_phase=0u;
    }
  }
}
