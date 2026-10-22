/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* CC: five 20-second diagnostic stages, with deliberately separated resource
 * addresses. Behaviour rebuilt against public stage definitions and artwork.
 * This reference exercises ordinary descriptors/sprites rather than MCU caches. */
#include "../assets/eggs/egg_CC_diag_assets.h"
static const uint32_t egg_cc_addresses[8]={0x000000u,0x010000u,0x03ffc0u,
  0x040000u,0x100000u,0x200000u,0x400000u,0x7ff000u};
static const uint8_t *const egg_cc_address_art[8]={
  egg_CC_address_sprite0_raw,egg_CC_address_sprite1_raw,
  egg_CC_address_sprite2_raw,egg_CC_address_sprite3_raw,
  egg_CC_address_sprite4_raw,egg_CC_address_sprite5_raw,
  egg_CC_address_sprite6_raw,egg_CC_address_sprite7_raw};
static void egg_cc_stage(twodfx_emu *d,unsigned phase) {
  unsigned i,s=0u,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned x=tvc?0u:88u,y=tvc?41u:16u;
  const unsigned bg=tvc?1u:8u;
  blank_entries(d);memset(d->shadow_spt,0,sizeof d->shadow_spt);
  egg_draw_colour(d,&s,bg,0u);
  egg_draw_xywh(d,&s,0x67u,x,y,tvc?704u:744u,tvc?256u:288u,1u);
  egg_draw_colour(d,&s,7u,0u);
  egg_draw_xywh(d,&s,0x66u,x+8u,y+6u,tvc?688u:728u,tvc?244u:276u,2u);
  egg_draw_colour(d,&s,(unsigned)(phase+2u),0u);
  egg_draw_xywh(d,&s,0x67u,x+8u,y+6u,24u,8u,1u);
  for(i=0u;i<5u;i++) {
    egg_draw_colour(d,&s,i<=phase?7u:3u,0u);
    egg_draw_xywh(d,&s,0x67u,x+48u+i*18u,y+6u,12u,8u,1u);
  }
  if(phase==0u){
    for(i=0u;i<8u;i++) {
      const uint32_t a=egg_cc_addresses[i];
      memcpy(d->ram+a,egg_cc_address_art[i],384u);
      egg_c7_sprite(d,i,x+32u+(i%4u)*158u,
                         y+36u+(i/4u)*100u,32u,24u,a);
    }
    for(i=0u;i<4u;i++) {
      const uint32_t a=0x000120u+i*0x100000u;
      const uint8_t *art= i==0u?egg_CC_stage0_cache_sprite0_raw:
        i==1u?egg_CC_stage0_cache_sprite1_raw:
        i==2u?egg_CC_stage0_cache_sprite2_raw:egg_CC_stage0_cache_sprite3_raw;
      memcpy(d->ram+a,art,384u);
      egg_c7_sprite(d,i+8u,x+72u+i*145u,y+184u,32u,24u,a);
    }
  }else if(phase==1u){
    memcpy(d->ram+0x500000u,egg_CC_transform_arrow_raw,
           sizeof egg_CC_transform_arrow_raw);
    for(i=0u;i<16u;i++) {
      egg_c7_sprite(d,i,x+28u+(i%8u)*79u,y+44u+(i/8u)*112u,
                    32u,24u,0x500000u);
      d->shadow_spt[i][6]=(uint8_t)((i&15u)<<4);
    }
  }else if(phase==2u){
    memcpy(d->ram+0x510000u,egg_CC_clipping_sprite_raw,
           sizeof egg_CC_clipping_sprite_raw);
    for(i=0u;i<16u;i++) {
      int xx=(int)x-24+(int)(i%8u)*104;
      int yy=(int)y-18+(int)(i/8u)*247;
      if(xx<0)xx=0;
      if(yy<0)yy=0;
      egg_c7_sprite(d,i,(unsigned)xx,(unsigned)yy,64u,48u,0x510000u);
      d->shadow_spt[i][6]=(uint8_t)(((i>>1)&3u)<<4);
    }
  }else if(phase==3u){
    unsigned u;
    memcpy(d->ram+0x520000u,egg_CC_mixed_sprite_raw,
           sizeof egg_CC_mixed_sprite_raw);
    for(i=0u;i<8u;i++) {
      egg_c7_sprite(d,i,x+60u+i*76u,y+72u,32u,32u,0x520000u);
      if(i&1u)d->shadow_spt[i][6]=0x40u;
    }
    d->patterns[3].resource_address=0x540000u;d->patterns[3].valid=1u;
    for(i=0u;i<64u;i++)d->ram[0x540000u+i]=(uint8_t)((i&1u)?0x27u:0x72u);
    for(u=0u;u<3u;u++){
      egg_draw_extended(d,&s,0x72u,x+80u+u*185u,y+140u,144u,72u,1u,3u,0u);
    }
    memcpy(d->ram+0x550000u,egg_CC_blit_bitmap_raw,
           sizeof egg_CC_blit_bitmap_raw);
    /* Bitmap asset is used with public descriptor and ordinary BLIT. */
    d->bitmaps[20].resource_address=0x550000u;
    d->bitmaps[20].width=64u;d->bitmaps[20].height=32u;d->bitmaps[20].valid=1u;
    {
      uint8_t p[4]={egg_xywh_high(x+260u,y+106u,0u,0u),
       (uint8_t)(x+260u),(uint8_t)(y+106u),20u};
      egg_draw_command(d,&s,0x71u,p,4u);
    }
  }else{
    /* Public compressed-ZX1 asset. Decode via portable resource pipeline. */
    memcpy(d->ram+0x530000u,egg_CC_diag_zx1_sprite_stream,
           sizeof egg_CC_diag_zx1_sprite_stream);
    if(d->resource_job==TWODFX_RESOURCE_JOB_NONE){
      /* Reuse the emulated resource worker: BUSY suspends publication until
       * the decompression completes on a later VSYNC (not elapsed MCU time). */
      d->job_source=0x530000u;
      d->job_destination=0x531000u;
      d->job_format=0u;
      d->job_output_bytes=0u;
      d->resource_job=TWODFX_RESOURCE_JOB_BUSY;
    }
    if(d->resource_job==TWODFX_RESOURCE_JOB_SUCCESS &&
       d->job_output_bytes==64u){
      egg_c7_sprite(d,0u,x+200u,y+100u,16u,8u,0x531000u);
      d->shadow_spt[0][6]=0xc0u;
    }
  }
  egg_draw_end(d,&s);
}
static void egg_activate_cc(twodfx_emu *d){
  egg_clean_scene(d);d->egg_frame=0u;egg_cc_stage(d,0u);d->egg_pending=0u;
}
static void egg_tick_cc(twodfx_emu *d){
  d->egg_frame++;
  if(d->egg_frame%1000u==0u){
    d->resource_job=TWODFX_RESOURCE_JOB_NONE;
    egg_cc_stage(d,(d->egg_frame/1000u)%5u);
  }else if(d->egg_frame%5000u>=4000u &&
           d->resource_job==TWODFX_RESOURCE_JOB_SUCCESS &&
           !(d->shadow_spt[0][0]&0x80u))
    egg_cc_stage(d,4u);
}
