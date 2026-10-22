/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* CD: full-stored-area bitmap and 20-second sprite-on/off stages.
 * Resource generation uses ordinary host arithmetic and 4-bit pixel packing.
 * The original hardware's rendering benchmark times are NOT emulated. */
static uint8_t egg_cd_colour(const twodfx_emu *d,unsigned x,unsigned y,
                             unsigned w,unsigned h) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned rx=tvc?0u:88u, ry=tvc?41u:16u;
  unsigned global_x=rx+x,global_y=ry+y;
  unsigned min_x=tvc?79u:88u,max_x=tvc?686u:811u;
  unsigned min_y=tvc?41u:18u,max_y=tvc?296u:303u;
  unsigned xx,yy;
  static const unsigned vlines[6]={0u,154u,246u,372u,392u,534u};
  static const unsigned hlines[6]={0u,62u,100u,132u,160u,224u};
  unsigned i;
  (void)w;(void)h;
  if(global_x<min_x || global_x>max_x || global_y<min_y || global_y>max_y)
    return tvc?1u:8u;
  xx=(global_x-min_x)*540u/(max_x-min_x+1u);
  yy=(global_y-min_y)*230u/(max_y-min_y+1u);
  uint8_t c=tvc?15u:7u;
  if((xx<154u && yy<62u)||(xx>=246u && xx<372u && yy>=100u)) c=tvc?3u:1u;
  else if((xx>=372u&&yy<86u)||(xx>=158u&&xx<246u&&yy>=66u&&yy<162u))c=tvc?9u:5u;
  else if((xx<122u&&yy>=160u)||(xx>=392u&&yy>=132u))c=tvc?7u:3u;
  else if(xx>=122u&&xx<246u&&yy>=162u)c=tvc?13u:5u;
  for(i=0u;i<6u;i++)if((xx>=vlines[i] && xx<vlines[i]+6u)||
                           (yy>=hlines[i] && yy<hlines[i]+6u))return tvc?1u:8u;
  if((xx>=122u&&xx<128u&&yy>=160u)||
     (xx>=246u&&xx<252u&&yy>=62u&&yy<100u)||
     (xx>=372u&&xx<392u&&yy>=86u&&yy<92u))return tvc?1u:8u;
  return c;
}
static void egg_cd_mondrian(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned w=tvc?704u:744u,h=tvc?256u:288u;
  unsigned stride=w/2u,x,y;
  uint32_t base=0x560000u;
  for(y=0u;y<h;y++)for(x=0u;x<w;x+=2u) {
    uint8_t a=egg_cd_colour(d,x,y,w,h), b=egg_cd_colour(d,x+1u,y,w,h);
    d->ram[base+y*stride+x/2u]=(uint8_t)(a|(b<<4));
  }
  d->bitmaps[11].resource_address=base;
  d->bitmaps[11].width=(uint16_t)w;
  d->bitmaps[11].height=(uint16_t)h;
  d->bitmaps[11].valid=1u;
}
static void egg_cd_face(twodfx_emu *d,unsigned id) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned body=tvc?(id?4u:6u):(id?4u:3u);
  unsigned highlight=tvc?7u:7u;
  unsigned dark=tvc?1u:8u;
  unsigned x,y;
  uint32_t base=0x610000u+id*0x10000u;
  for(y=0u;y<16u;y++)for(x=0u;x<16u;x+=2u){
    uint8_t values[2];unsigned p;
    for(p=0u;p<2u;p++){
      int xx=(int)(x+p)-7,yy=(int)y-7;
      unsigned k=(xx*xx+yy*yy<=58)?body:0u;
      if(k&& (xx*xx+yy*yy>45))k=highlight;
      if(((x+p==5u||x+p==10u) && (y==5u||y==6u))||
         (y==10u && x+p>=4u && x+p<=11u))k=dark;
      values[p]=(uint8_t)k;
    }
    d->ram[base+y*8u+x/2u]=(uint8_t)(values[0]|(values[1]<<4));
  }
}
static void egg_cd_scene(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned s=0u, x=tvc?0u:88u, y=tvc?41u:16u;
  unsigned stage=(d->egg_frame/1000u)&1u;
  uint8_t p[4]={egg_xywh_high(x,y,0u,0u),(uint8_t)x,(uint8_t)y,11u};
  blank_entries(d);
  memset(d->shadow_spt,0,sizeof d->shadow_spt);
  egg_draw_command(d,&s,0x71u,p,4u);
  egg_draw_colour(d,&s,7u,0u);
  egg_draw_xywh(d,&s,0x67u,96u,22u,36u,8u,1u);
  if(stage){
    egg_draw_colour(d,&s,4u,0u);
    egg_draw_xywh(d,&s,0x67u,140u,22u,36u,8u,1u);
    egg_c7_sprite(d,0u,232u,96u,16u,16u,0x610000u);
    egg_c7_sprite(d,1u,584u,176u,16u,16u,0x620000u);
    d->shadow_spt[0][6]=d->shadow_spt[1][6]=0xc0u;
  }
  egg_draw_end(d,&s);
}
static void egg_activate_cd(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  egg_cd_mondrian(d);egg_cd_face(d,0u);egg_cd_face(d,1u);
  egg_cd_scene(d);d->egg_pending=0u;
}
static void egg_tick_cd(twodfx_emu *d) {
  d->egg_frame++;
  if(d->egg_frame%1000u==0u)egg_cd_scene(d);
}
