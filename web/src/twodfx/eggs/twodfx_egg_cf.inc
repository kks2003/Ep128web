/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* 2dfx: Independent implementation of the *observable* CF timing diagnostic.
 * The public CF layout/colours are protocol constants, not MCU algorithms.
 * All drawing is performed by the ordinary 2DPT and resource renderer.
 */
static void egg_set_entry(twodfx_emu *d,unsigned slot,uint8_t opcode,
                          const uint8_t *payload,unsigned count) {
  twodfx_2dpt_entry *e=&d->shadow_2dpt[0][slot];
  memset(e,0,sizeof *e);
  e->opcode=opcode;
  e->nbytes=(uint8_t)count;
  if(count)memcpy(e->payload,payload,count);
}
static uint8_t egg_xywh_high(unsigned x,unsigned y,unsigned w,unsigned h) {
  return (uint8_t)((((x>>8)&3u)<<4)|(((y>>8)&1u)<<3)|
                   (((w>>8)&3u)<<1)|((h>>8)&1u));
}
/* Reset visible scene state, not resource RAM (a firmware requirement). */
static void egg_clean_scene(twodfx_emu *d) {
  memset(d->shadow_spt,0,sizeof d->shadow_spt);
  memset(d->active_spt,0,sizeof d->active_spt);
  memset(d->fonts,0,sizeof d->fonts);
  memset(d->bitmaps,0,sizeof d->bitmaps);
  memset(d->patterns,0,sizeof d->patterns);
  memset(d->tilesets,0,sizeof d->tilesets);
  memset(d->tilemaps,0,sizeof d->tilemaps);
  memset(d->active_fonts,0,sizeof d->active_fonts);
  memset(d->active_bitmaps,0,sizeof d->active_bitmaps);
  memset(d->active_patterns,0,sizeof d->active_patterns);
  memset(d->active_tilesets,0,sizeof d->active_tilesets);
  memset(d->active_tilemaps,0,sizeof d->active_tilemaps);
  twodfx_3d_reset(&d->scene3d);
  blank_entries(d);
  d->transparent=0;
  d->logo_visible=0;
  d->fps=50;
  d->overrun_visual=0;
  d->collision_reported=d->collision_pending=d->collision_ready=0;
  memset(d->raster_lines,0,sizeof d->raster_lines);
  d->raster_pending=0;
  d->engine=TWODFX_EMU_ENGINE_NORMAL;
  d->resource_job=TWODFX_RESOURCE_JOB_NONE;
  d->job_source=d->job_destination=d->job_output_bytes=0;
  d->job_format=0;
  d->render_enabled=1; /* public egg must show its own drawing */
}
static void egg_build_cf_scene(twodfx_emu *d) {
  uint8_t p[5];
  blank_entries(d);
  p[0]=0; /* both foreground and background colour = black */
  egg_set_entry(d,0,0x61u,p,1);
  p[0]=egg_xywh_high(83u,41u,605u,256u);
  p[1]=83u;p[2]=41u;p[3]=(uint8_t)605u;p[4]=(uint8_t)256u;
  egg_set_entry(d,1,0x67u,p,5);
  p[0]=egg_xywh_high(84u,49u,0u,0u);
  p[1]=84u;p[2]=49u;p[3]=15u;
  egg_set_entry(d,2,0x71u,p,4);
  egg_set_entry(d,3,0x7fu,NULL,0);
}
static void egg_activate_cf(twodfx_emu *d) {
  unsigned bar, row, pair;
  twodfx_bitmap_descriptor *b;
  if(d->egg_id!=15u || !egg_supported(d,d->egg_id)){
    egg_stop(d);return;
  }
  egg_clean_scene(d);
  d->transparent=1; /* 0 and 15 must both be opaque */
  b=&d->bitmaps[15];
  b->resource_address=0x5a0000u;b->width=604;b->height=240;b->valid=1;
  /* 16 bars, 15 identical rows/bar, 4-pixel repeating bit pattern. */
  for(bar=0;bar<16u;bar++)for(row=0;row<15u;row++){
    uint32_t addr=0x5a0000u+(uint32_t)(bar*15u+row)*302u;
    for(pair=0;pair<302u;pair++){
      unsigned x=pair*2u;
      unsigned a=(bar>>(3u-(x&3u)))&1u;
      unsigned c=(bar>>(3u-((x+1u)&3u)))&1u;
      d->ram[addr+pair]=(uint8_t)((a?15u:0u)|((c?15u:0u)<<4));
    }
  }
  egg_build_cf_scene(d);
  d->egg_pending=0;
}
static void egg_tick_cf(twodfx_emu *d) {
  /* Firmware refreshes this static diagnostic playlist on each scene tick. */
  egg_build_cf_scene(d);
  d->bitmaps[15].resource_address=0x5a0000u;
  d->bitmaps[15].width=604;
  d->bitmaps[15].height=240;
  d->bitmaps[15].valid=1;
}
