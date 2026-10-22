/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C4: exact versus transparent bitmap showcase. Original public prebuilt
 * ZX1 banks are loaded by the shared bounded decoder, never MCU blitters. */
#include "../assets/eggs/egg_C4_blit_assets.h"
typedef struct egg_c4_bank {const uint8_t *bytes;size_t length;} egg_c4_bank;
static const egg_c4_bank egg_c4_ep[4]={
  {egg_C4_object0_enterprise_animation_zx1,sizeof egg_C4_object0_enterprise_animation_zx1},
  {egg_C4_object1_enterprise_animation_zx1,sizeof egg_C4_object1_enterprise_animation_zx1},
  {egg_C4_object2_enterprise_animation_zx1,sizeof egg_C4_object2_enterprise_animation_zx1},
  {egg_C4_object3_enterprise_animation_zx1,sizeof egg_C4_object3_enterprise_animation_zx1}
};
static const egg_c4_bank egg_c4_tvc[4]={
  {egg_C4_object0_tvc_animation_zx1,sizeof egg_C4_object0_tvc_animation_zx1},
  {egg_C4_object1_tvc_animation_zx1,sizeof egg_C4_object1_tvc_animation_zx1},
  {egg_C4_object2_tvc_animation_zx1,sizeof egg_C4_object2_tvc_animation_zx1},
  {egg_C4_object3_tvc_animation_zx1,sizeof egg_C4_object3_tvc_animation_zx1}
};
static void egg_c4_blit(twodfx_emu *d,unsigned *s,unsigned x,unsigned y,unsigned id,int transparent) {
  uint8_t p[4];
  p[0]=(uint8_t)(egg_xywh_high(x,y,0u,0u)|(transparent?0x80u:0u));
  p[1]=(uint8_t)x;p[2]=(uint8_t)y;p[3]=(uint8_t)id;
  egg_draw_command(d,s,0x71u,p,4u);
}
/* First outward run uses four pixels/tick; after the first bounce the
 * endpoints alternate at two pixels/tick. This is derived from the public
 * motion contract, not from any MCU per-frame loop. */
static unsigned egg_c4_moving_offset(unsigned frame,unsigned width){
  const unsigned span=width-128u-48u;
  const unsigned outbound=(span+3u)/4u;
  const unsigned base=frame<outbound?frame*4u:span;
  unsigned phase,period;
  if(frame<=outbound)return base>span?span:base;
  phase=frame-outbound;
  period=2u*((span+1u)/2u);
  phase%=period;
  if(phase*2u<=span)return span-phase*2u;
  return (phase*2u-span);
}
static void egg_c4_scene(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned x=tvc?126u:124u,y=tvc?49u:38u,w=tvc?512u:640u,h=tvc?240u:225u;
  unsigned s=0u,i;
  unsigned phase=(d->egg_frame>>1u)&63u;
  blank_entries(d);
  for(i=0;i<4u;i++){
    twodfx_bitmap_descriptor *b=&d->bitmaps[i];
    b->resource_address=0x550000u+i*262144u+phase*4096u;
    b->width=128u;b->height=64u;b->valid=1u;
  }
  egg_draw_colour(d,&s,tvc?1u:8u,tvc?5u:2u);
  egg_draw_xywh(d,&s,0x67u,x,y,w,h,1u);
  egg_draw_colour(d,&s,tvc?15u:4u,0u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,2u);
  egg_draw_colour(d,&s,tvc?13u:5u,0u);
  for(i=0;i<8u;i++)egg_draw_xywh(d,&s,0x63u,x+16u,y+24u+i*22u,
                                    x+w-16u,y+h-24u-i*12u,1u);
  if(tvc){
    for(i=0u;i<3u;i++){
      unsigned px=x+16u+176u*i;
      egg_c4_blit(d,&s,px,y+18u,i,0);
      egg_c4_blit(d,&s,px,y+88u,i,1);
    }
    egg_c4_blit(d,&s,x+24u+egg_c4_moving_offset(d->egg_frame,w),y+158u,3u,1);
  }else{
    const unsigned xx[4]={26u,180u,334u,488u};
    const unsigned xt[3]={64u,256u,448u};
    for(i=0;i<4u;i++)egg_c4_blit(d,&s,x+xx[i],y+10u,i,0);
    for(i=0;i<3u;i++)egg_c4_blit(d,&s,x+xt[i],y+84u,i,1);
    egg_c4_blit(d,&s,x+24u+egg_c4_moving_offset(d->egg_frame,w),y+154u,3u,1);
  }
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_draw_xywh(d,&s,0x67u,x+2u+((d->egg_frame*3u)%(w-12u)),y+2u,10u,5u,1u);
  egg_draw_end(d,&s);
}
static void egg_activate_c4(twodfx_emu *d) {
  egg_clean_scene(d);
  d->egg_frame=0u;d->egg_stage=0u;
  d->egg_pending=0u;
}
static void egg_tick_c4(twodfx_emu *d) {
  if(d->egg_stage<4u){
    const egg_c4_bank *b=(d->machine==TWODFX_EMU_TVC?egg_c4_tvc:egg_c4_ep)+d->egg_stage;
    uint32_t size=0u;
    if(b->length>TWODFX_EMU_RESOURCE_BYTES-0x7d8000u){d->egg_stage=7u;return;}
    memcpy(d->ram+0x7d8000u,b->bytes,b->length);
    if(!zx1_decompress(d,0x7d8000u,0x550000u+(uint32_t)d->egg_stage*262144u,0u,&size)||
       size!=262144u){d->egg_stage=7u;return;}
    d->egg_stage++;
    if(d->egg_stage==4u)egg_c4_scene(d);
  }else if(d->egg_stage==4u){d->egg_frame++;egg_c4_scene(d);}
}
