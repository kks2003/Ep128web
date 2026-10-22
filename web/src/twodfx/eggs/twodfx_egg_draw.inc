/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* Portable egg scene construction, using the documented 2DPT wire format.
 * Engine-internal helper; this is NOT code lifted from RP2354B firmware.
 * All commands go through the ordinary BG renderer and frame publication.
 */
static void egg_draw_command(twodfx_emu *d, unsigned *slot, uint8_t opcode,
                             const uint8_t *payload, unsigned size) {
  if (*slot < 255u) egg_set_entry(d,(*slot)++,opcode,payload,size);
}
static void egg_draw_colour(twodfx_emu *d,unsigned *slot,unsigned fg,unsigned bg) {
  uint8_t p=(uint8_t)(((fg&15u)<<4)|(bg&15u));
  egg_draw_command(d,slot,0x61u,&p,1u);
}
static void egg_draw_xywh(twodfx_emu *d,unsigned *slot,uint8_t opcode,
                          unsigned x,unsigned y,unsigned w,unsigned h,
                          unsigned stroke) {
  uint8_t p[5];
  p[0]=(uint8_t)(egg_xywh_high(x,y,w,h)|(((stroke ? stroke : 1u)-1u)&3u)<<6);
  p[1]=(uint8_t)x;p[2]=(uint8_t)y;p[3]=(uint8_t)w;p[4]=(uint8_t)h;
  egg_draw_command(d,slot,opcode,p,5u);
}
static void egg_draw_extended(twodfx_emu *d,unsigned *slot,uint8_t opcode,
                              unsigned x,unsigned y,unsigned w,unsigned h,
                              unsigned stroke,uint8_t a,uint8_t b) {
  uint8_t p[7];
  p[0]=(uint8_t)(egg_xywh_high(x,y,w,h)|(((stroke ? stroke : 1u)-1u)&3u)<<6);
  p[1]=(uint8_t)x;p[2]=(uint8_t)y;p[3]=(uint8_t)w;p[4]=(uint8_t)h;
  p[5]=a;p[6]=b;
  egg_draw_command(d,slot,opcode,p,7u);
}
static void egg_draw_offset(twodfx_emu *d,unsigned *slot,int x,int y) {
  uint8_t p[2]={(uint8_t)(int8_t)x,(uint8_t)(int8_t)y};
  egg_draw_command(d,slot,0x6eu,p,2u);
}
static void egg_draw_end(twodfx_emu *d,unsigned *slot) {
  egg_draw_command(d,slot,0x7fu,NULL,0u);
}
static unsigned egg_scale(unsigned value,unsigned range,unsigned basis) {
  return (value*range+basis/2u)/basis;
}
/* Design-space rectangle for demonstrations (public BASIC-safe coordinates). */
typedef struct {unsigned x,y,w,h;} egg_scene_rect;
static egg_scene_rect egg_scene(const twodfx_emu *d) {
  egg_scene_rect r;
  if(d->machine==TWODFX_EMU_TVC) {r.x=126;r.y=49;r.w=512;r.h=240;}
  else {r.x=124;r.y=38;r.w=640;r.h=225;}
  return r;
}
static unsigned egg_scene_x(egg_scene_rect r,unsigned design) {
  return r.x+egg_scale(design,r.w-1u,743u);
}
static unsigned egg_scene_y(egg_scene_rect r,unsigned design) {
  return r.y+egg_scale(design,r.h-1u,287u);
}
static unsigned egg_scene_w(egg_scene_rect r,unsigned design) {
  unsigned q=egg_scale(design,r.w,744u);return q?q:1u;
}
static unsigned egg_scene_h(egg_scene_rect r,unsigned design) {
  unsigned q=egg_scale(design,r.h,288u);return q?q:1u;
}
