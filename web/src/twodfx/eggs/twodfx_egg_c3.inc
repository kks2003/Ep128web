/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C3: portable text/font showcase. Public ZX1 font banks are decompressed
 * through the common resource decoder, one bank per accepted scene tick.
 * No MCU staging buffer, DMA or special-purpose font raster path. */
#include "../assets/eggs/egg_C3_text_assets.h"

typedef struct egg_c3_bank {
  const uint8_t *compressed;
  size_t bytes;
  uint32_t address;
  uint8_t width_units, height_units;
} egg_c3_bank;
static const egg_c3_bank egg_c3_banks[5] = {
  {egg_C3_font_narrow_zx1,sizeof egg_C3_font_narrow_zx1,0x5c0000u,1u,1u},
  {egg_C3_font_normal_zx1,sizeof egg_C3_font_normal_zx1,0x5c0400u,2u,1u},
  {egg_C3_font_wide_zx1,sizeof egg_C3_font_wide_zx1,0x5c0c00u,4u,1u},
  {egg_C3_font_tall_zx1,sizeof egg_C3_font_tall_zx1,0x5c1c00u,2u,2u},
  {egg_C3_font_big_zx1,sizeof egg_C3_font_big_zx1,0x5c2c00u,4u,2u}
};
static const uint32_t egg_c3_string_addresses[9] = {
  0x5f0000u,0x5f0040u,0x5f0080u,0x5f00c0u,0x5f0100u,
  0x5f0140u,0x5f0180u,0x5f01c0u,0x5f0200u
};
static void egg_c3_copy_string(twodfx_emu *d,unsigned index,const uint8_t *text,size_t length) {
  if(index<9u && length<=64u)memcpy(d->ram+egg_c3_string_addresses[index],text,length);
}
static void egg_c3_counter(twodfx_emu *d) {
  uint8_t text[sizeof egg_C3_string_counter_initial_raw];
  unsigned n=(unsigned)(d->egg_frame%10000u);
  memcpy(text,egg_C3_string_counter_initial_raw,sizeof text);
  text[6]=(uint8_t)('0'+(n/1000u)%10u);
  text[7]=(uint8_t)('0'+(n/100u)%10u);
  text[8]=(uint8_t)('0'+(n/10u)%10u);
  text[9]=(uint8_t)('0'+n%10u);
  egg_c3_copy_string(d,8u,text,sizeof text);
}
static void egg_c3_draw_text(twodfx_emu *d,unsigned *slot,unsigned x,unsigned y,
                             unsigned font,unsigned string) {
  uint32_t addr=egg_c3_string_addresses[string];
  uint8_t p[7]={egg_xywh_high(x,y,0u,0u),(uint8_t)x,(uint8_t)y,
                (uint8_t)font,(uint8_t)addr,(uint8_t)(addr>>8),(uint8_t)(addr>>16)};
  egg_draw_command(d,slot,0x70u,p,7u);
}
static void egg_c3_scene(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned x=tvc?126u:124u,y=tvc?49u:38u,w=tvc?512u:640u,h=tvc?240u:225u;
  unsigned bx=x+12u, s=0u;
  blank_entries(d);
  egg_draw_colour(d,&s,tvc?1u:8u,0u);
  egg_draw_xywh(d,&s,0x67u,x,y,w,h,1u);
  egg_draw_colour(d,&s,tvc?15u:4u,0u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,2u);
  egg_draw_xywh(d,&s,0x63u,x,76u,x+w-1u,76u,1u);
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_c3_draw_text(d,&s,x+(w-288u)/2u,54u,4u,0u);
  egg_draw_colour(d,&s,tvc?7u:6u,0u);
  egg_c3_draw_text(d,&s,bx,86u,1u,1u);
  egg_draw_colour(d,&s,tvc?9u:5u,0u);
  egg_c3_draw_text(d,&s,bx,102u,0u,2u);
  egg_draw_colour(d,&s,tvc?13u:5u,0u);
  egg_c3_draw_text(d,&s,bx,118u,2u,3u);
  egg_draw_colour(d,&s,tvc?3u:4u,0u);
  egg_c3_draw_text(d,&s,bx,142u,3u,4u);
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_c3_draw_text(d,&s,bx,170u,4u,5u);
  egg_draw_colour(d,&s,tvc?7u:6u,0u);
  egg_c3_draw_text(d,&s,bx,202u,1u,6u);
  egg_draw_colour(d,&s,tvc?15u:7u,2u);
  egg_c3_draw_text(d,&s,bx,222u,1u,7u);
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_c3_draw_text(d,&s,bx,244u,1u,8u);
  egg_draw_end(d,&s);
}
static void egg_activate_c3(twodfx_emu *d) {
  egg_clean_scene(d);
  d->egg_frame=0u; d->egg_stage=0u;
  egg_c3_copy_string(d,0u,egg_C3_string_title_raw,sizeof egg_C3_string_title_raw);
  egg_c3_copy_string(d,1u,egg_C3_string_normal_raw,sizeof egg_C3_string_normal_raw);
  egg_c3_copy_string(d,2u,egg_C3_string_narrow_raw,sizeof egg_C3_string_narrow_raw);
  egg_c3_copy_string(d,3u,egg_C3_string_wide_raw,sizeof egg_C3_string_wide_raw);
  egg_c3_copy_string(d,4u,egg_C3_string_tall_raw,sizeof egg_C3_string_tall_raw);
  egg_c3_copy_string(d,5u,egg_C3_string_big_raw,sizeof egg_C3_string_big_raw);
  egg_c3_copy_string(d,6u,egg_C3_string_transparent_raw,sizeof egg_C3_string_transparent_raw);
  egg_c3_copy_string(d,7u,egg_C3_string_filled_raw,sizeof egg_C3_string_filled_raw);
  egg_c3_counter(d);
  d->egg_pending=0u;
}
static void egg_tick_c3(twodfx_emu *d) {
  if(d->egg_stage<5u){
    const egg_c3_bank *b=&egg_c3_banks[d->egg_stage];
    uint32_t size=0u;
    const uint32_t expected=128u*(uint32_t)b->width_units*8u*b->height_units;
    memcpy(d->ram+0x7d0000u,b->compressed,b->bytes);
    if(!zx1_decompress(d,0x7d0000u,b->address,0u,&size)||size!=expected){
      d->egg_stage=7u;return;
    }
    d->fonts[d->egg_stage].valid=1u;
    d->fonts[d->egg_stage].resource_address=b->address;
    d->fonts[d->egg_stage].width_units=b->width_units;
    d->fonts[d->egg_stage].height_units=b->height_units;
    d->egg_stage++;
    if(d->egg_stage==5u)egg_c3_scene(d);
  }else if(d->egg_stage==5u){
    d->egg_frame=(d->egg_frame+1u)%10000u;
    egg_c3_counter(d);
  }
}
