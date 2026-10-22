/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C8: enhanced Pong using public WOW artwork, 2DPT, font and tile resources.
 * The core C7 game geometry/input model is shared intentionally; decorative
 * commands are independently expressed using the portable 2DPT helpers. */
#include "../assets/eggs/egg_C8_pong_wow_assets.h"
static void egg_c8_resources(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  const uint8_t *paddle1=tvc?egg_C8_tvc_left_paddle_raw:egg_C8_ep_left_paddle_raw;
  const uint8_t *paddle2=tvc?egg_C8_tvc_right_paddle_raw:egg_C8_ep_right_paddle_raw;
  const uint8_t *ball=tvc?egg_C8_tvc_ball_raw:egg_C8_ep_ball_raw;
  const uint8_t *patterns=tvc?egg_C8_tvc_patterns_raw:egg_C8_ep_patterns_raw;
  const uint8_t *tiles=tvc?egg_C8_tvc_tileset_raw:egg_C8_ep_tileset_raw;
  memcpy(d->ram+0x400000u,paddle1,288u);
  memcpy(d->ram+0x400400u,paddle2,288u);
  memcpy(d->ram+0x400800u,ball,36u);
  memcpy(d->ram+0x5d0000u,egg_C8_font_16x8_raw,2048u);
  memcpy(d->ram+0x5e4000u,patterns,256u);
  memcpy(d->ram+0x5e1000u,tiles,512u);
  memcpy(d->ram+0x5e0000u,egg_C8_title_string_raw,sizeof egg_C8_title_string_raw);
  memcpy(d->ram+0x5e0020u,egg_C8_p1_string_template_raw,sizeof egg_C8_p1_string_template_raw);
  memcpy(d->ram+0x5e0040u,egg_C8_p2_string_template_raw,sizeof egg_C8_p2_string_template_raw);
  memcpy(d->ram+0x5e0060u,egg_C8_hint_string_raw,sizeof egg_C8_hint_string_raw);
  d->fonts[1].resource_address=0x5d0000u;
  d->fonts[1].width_units=2u;d->fonts[1].height_units=1u;
  d->fonts[1].valid=1u;
  d->patterns[1].resource_address=0x5e4000u;d->patterns[1].valid=1u;
  d->tilesets[1].resource_address=0x5e1000u;d->tilesets[1].valid=1u;
  d->tilemaps[1].resource_address=0x5e3000u;
  d->tilemaps[1].width_cells=(uint16_t)(tvc?30u:39u);
  d->tilemaps[1].height_cells=(uint16_t)(tvc?24u:22u);
  d->tilemaps[1].tileset=1u;d->tilemaps[1].valid=1u;
}
static void egg_c8_map(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned cols=tvc?30u:39u,rows=tvc?24u:22u,x,y;
  for(y=0;y<rows;y++)for(x=0;x<cols;x++){
    unsigned t=0u;
    if(x==0u||x==cols-1u||y==0u||y==rows-1u)t=3u;
    else if(y==5u||y==20u)t=4u;
    else if(x==10u||x==21u||x==32u)t=5u;
    else if((x*3u+y*5u+(d->egg_frame>>2))%12u==0u)t=2u;
    else if(((x+y+(d->egg_frame>>4))&3u)==0u)t=1u;
    d->ram[0x5e3000u+y*cols+x]=(uint8_t)t;
  }
  d->ram[0x5e0020u+3u]=(uint8_t)('0'+d->pong_score_l);
  d->ram[0x5e0040u+3u]=(uint8_t)('0'+d->pong_score_r);
}
static void egg_c8_text(twodfx_emu *d,unsigned *s,unsigned x,unsigned y,unsigned addr){
  uint32_t base=0x5e0000u+addr;
  uint8_t p[7]={egg_xywh_high(x,y,0u,0u),(uint8_t)x,(uint8_t)y,
                1u,(uint8_t)base,(uint8_t)(base>>8),(uint8_t)(base>>16)};
  egg_draw_command(d,s,0x70u,p,7u);
}
static void egg_c8_scene(twodfx_emu *d) {
  unsigned x,y,w,h,s=0u,yy,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned dark=tvc?9u:8u,white=tvc?15u:7u;
  unsigned glow=tvc?13u:5u,green=tvc?5u:4u;
  unsigned cols=tvc?30u:39u,rows=tvc?24u:22u;
  uint8_t p[7];
  static const int8_t shx[8]={-3,2,-2,3,-2,2,-1,1};
  static const int8_t shy[8]={-1,1,1,-1,1,-1,1,-1};
  egg_c7_geometry(d,&x,&y,&w,&h);
  blank_entries(d);
  if(d->pong_flash>10u)egg_draw_offset(d,&s,shx[d->egg_frame&7u],shy[d->egg_frame&7u]);
  else egg_draw_offset(d,&s,0,0);
  egg_draw_colour(d,&s,dark,0u);
  egg_draw_xywh(d,&s,0x67u,x,y,w,h,1u);
  p[0]=(uint8_t)((1u<<3)|((((x+(tvc?10u:4u))>>8)&3u)<<1)|
                   (((y+18u)>>8)&1u));
  p[1]=(uint8_t)(x+(tvc?10u:4u));p[2]=(uint8_t)(y+18u);
  p[3]=0u;p[4]=0u;p[5]=(uint8_t)cols;p[6]=(uint8_t)rows;
  egg_draw_command(d,&s,0x73u,p,7u);
  /* Public pattern-bank stage: animated energy bands and three panels.
     Pattern-fill receives XYWH followed by descriptor ID and pattern index. */
  {
    uint8_t pat[7];
    unsigned j;
    const unsigned px[5]={x+10u,x+10u,x+24u,x+w-40u,x+w/2u-18u};
    const unsigned py[5]={y+4u,y+h-16u,y+52u,y+52u,y+52u};
    const unsigned pw[5]={w-20u,w-20u,16u,16u,36u};
    const unsigned ph[5]={12u,12u,h-104u,h-104u,h-104u};
    for(j=0u;j<5u;j++){
      pat[0]=egg_xywh_high(px[j],py[j],pw[j],ph[j]);
      pat[1]=(uint8_t)px[j];pat[2]=(uint8_t)py[j];
      pat[3]=(uint8_t)pw[j];pat[4]=(uint8_t)ph[j];
      pat[5]=1u;
      pat[6]=(uint8_t)(j==0u?((d->egg_frame>>3u)&3u):
                   j==1u?(((d->egg_frame>>3u)+1u)&3u):
                   j==4u?3u:2u);
      egg_draw_command(d,&s,0x72u,pat,7u);
    }
  }
  egg_draw_colour(d,&s,glow,0u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,2u);
  egg_draw_colour(d,&s,white,0u);
  for(yy=y+34u;yy+9u<y+h-24u;yy+=18u)
    egg_draw_xywh(d,&s,0x67u,x+w/2u-4u,yy,8u,9u,1u);
  egg_c8_text(d,&s,x+w/2u-32u,y+22u,0u);
  egg_draw_colour(d,&s,green,0u);
  egg_c8_text(d,&s,x+40u,y+22u,0x20u);
  egg_c8_text(d,&s,x+w-104u,y+22u,0x40u);
  egg_draw_colour(d,&s,white,0u);
  egg_c8_text(d,&s,x+w/2u-80u,y+h-14u,0x60u);
  egg_draw_end(d,&s);
  egg_c7_sprite(d,0u,x+8u,(unsigned)d->pong_left,12u,48u,0x400000u);
  egg_c7_sprite(d,1u,x+w-20u,(unsigned)d->pong_right,12u,48u,0x400400u);
  egg_c7_sprite(d,2u,(unsigned)d->pong_x,(unsigned)d->pong_y,12u,6u,0x400800u);
  if(d->pong_flash>10u){
    unsigned f=d->egg_frame&7u;
    static const int8_t sx[8]={-4,3,-2,4,-3,2,-1,1};
    static const int8_t sy[8]={-2,1,2,-1,1,-2,2,-1};
    unsigned i;
    for(i=0u;i<3u;i++){
      int xx=(int)d->shadow_spt[i][1]+sx[f];
      int yy2=(int)d->shadow_spt[i][2]+sy[f];
      d->shadow_spt[i][1]=(uint8_t)xx;
      d->shadow_spt[i][2]=(uint8_t)yy2;
    }
  }
}
static void egg_activate_c8(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  d->pong_prev=d->pong_input=d->pong_score_l=d->pong_score_r=0u;
  egg_c8_resources(d);egg_c7_reset_game(d);
  egg_c8_map(d);egg_c8_scene(d);d->egg_pending=0u;
}
static void egg_tick_c8(twodfx_emu *d) {
  d->egg_frame++;egg_c7_update(d);egg_c8_map(d);egg_c8_scene(d);
}
