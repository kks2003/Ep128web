/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C7: independently written portable Pong game using ordinary 2DPT and SPB.
 * Observable dimensions, input bits, speeds and field geometry are public.
 * No platform timing, frame-compression or MCU raster optimizations.
 */
static void egg_c7_geometry(const twodfx_emu *d,unsigned *x,unsigned *y,
                             unsigned *w,unsigned *h) {
  if(d->machine==TWODFX_EMU_TVC){*x=132u;*y=53u;*w=500u;*h=232u;}
  else {*x=128u;*y=48u;*w=634u;*h=212u;}
}
static void egg_c7_round(twodfx_emu *d,int direction) {
  unsigned x,y,w,h;
  egg_c7_geometry(d,&x,&y,&w,&h);
  d->pong_x=(int16_t)(x+w/2u-6u);d->pong_y=(int16_t)(y+h/2u-3u);
  d->pong_dx=(int16_t)(direction<0?-4:4);
  d->pong_dy=3;
  d->pong_serve=30u;
}
static void egg_c7_reset_game(twodfx_emu *d) {
  unsigned x,y,w,h;egg_c7_geometry(d,&x,&y,&w,&h);
  (void)x;(void)w;
  d->pong_left=d->pong_right=(int16_t)(y+h/2u-24u);
  d->pong_score_l=d->pong_score_r=d->pong_flash=0u;
  egg_c7_round(d,1);
}
static void egg_c7_sprite(twodfx_emu *d,unsigned id,unsigned x,unsigned y,
                          unsigned w,unsigned h,unsigned addr) {
  uint8_t *p=d->shadow_spt[id];
  p[0]=(uint8_t)(0x80u|(((x>>8)&3u)<<4)|(((y>>8)&1u)<<3)|
                (((w>>8)&3u)<<1)|((h>>8)&1u));
  p[1]=(uint8_t)x;p[2]=(uint8_t)y;
  p[3]=(uint8_t)addr;p[4]=(uint8_t)(addr>>8);
  p[5]=(uint8_t)(addr>>16);p[6]=0u;
  p[7]=(uint8_t)w;p[8]=(uint8_t)h;
}
static void egg_c7_assets(twodfx_emu *d) {
  unsigned i;
  uint8_t colour=d->machine==TWODFX_EMU_TVC?15u:7u;
  uint8_t byte=(uint8_t)(colour*17u);
  for(i=0;i<288u;i++){
    d->ram[0x400000u+i]=byte;
    d->ram[0x400400u+i]=byte;
  }
  for(i=0;i<36u;i++)d->ram[0x400800u+i]=byte;
}
static void egg_c7_digit(twodfx_emu *d,unsigned *s,unsigned x,unsigned y,unsigned digit) {
  static const uint8_t map[10]={0x3f,0x06,0x5b,0x4f,0x66,
                                0x6d,0x7d,0x07,0x7f,0x6f};
  unsigned m=map[digit%10u];
  if(m&1u)egg_draw_xywh(d,s,0x67u,x+8u,y,48u,4u,1);
  if(m&2u)egg_draw_xywh(d,s,0x67u,x+56u,y+4u,8u,16u,1);
  if(m&4u)egg_draw_xywh(d,s,0x67u,x+56u,y+24u,8u,16u,1);
  if(m&8u)egg_draw_xywh(d,s,0x67u,x+8u,y+40u,48u,4u,1);
  if(m&16u)egg_draw_xywh(d,s,0x67u,x,y+24u,8u,16u,1);
  if(m&32u)egg_draw_xywh(d,s,0x67u,x,y+4u,8u,16u,1);
  if(m&64u)egg_draw_xywh(d,s,0x67u,x+8u,y+20u,48u,4u,1);
}
static void egg_c7_draw(twodfx_emu *d) {
  unsigned x,y,w,h,s=0u, yy;
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned flash=d->pong_flash>8u;
  unsigned fc=tvc?(flash?2u:14u):(flash?5u:6u);
  unsigned sc=tvc?(flash?2u:4u):(flash?5u:4u);
  egg_c7_geometry(d,&x,&y,&w,&h);
  blank_entries(d);
  if(flash){
    static const int8_t sx[8]={-4,3,-3,4,-2,2,-1,1};
    static const int8_t sy[8]={-2,1,2,-1,1,-2,1,-1};
    unsigned f=d->egg_frame&7u;
    egg_draw_offset(d,&s,sx[f],sy[f]);
  } else egg_draw_offset(d,&s,0,0);
  egg_draw_colour(d,&s,fc,0u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,1u);
  for(yy=y+12u; yy+10u<y+h-12u; yy+=20u)
    egg_draw_xywh(d,&s,0x67u,x+w/2u-3u,yy,6u,10u,1u);
  egg_draw_colour(d,&s,sc,0u);
  egg_c7_digit(d,&s,x+w/2u-108u,y+24u,d->pong_score_l);
  egg_c7_digit(d,&s,x+w/2u+44u,y+24u,d->pong_score_r);
  egg_draw_end(d,&s);
  egg_c7_sprite(d,0u,x+8u,(unsigned)d->pong_left,12u,48u,0x400000u);
  egg_c7_sprite(d,1u,x+w-20u,(unsigned)d->pong_right,12u,48u,0x400400u);
  egg_c7_sprite(d,2u,(unsigned)d->pong_x,(unsigned)d->pong_y,12u,6u,0x400800u);
}
static void egg_c7_update(twodfx_emu *d) {
  unsigned x,y,w,h;
  uint8_t key;
  int miny,maxy;
  egg_c7_geometry(d,&x,&y,&w,&h);
  while(d->egg_tail!=d->egg_head){
    key=d->egg_fifo[d->egg_tail];
    d->egg_tail=(uint8_t)((d->egg_tail+1u)&63u);
    d->pong_input=key;
  }
  if((d->pong_input&0x80u)&&!(d->pong_prev&0x80u))egg_c7_reset_game(d);
  d->pong_prev=d->pong_input;
  if(d->pong_input&0x08u)d->pong_left-=5;
  if(d->pong_input&0x04u)d->pong_left+=5;
  if(d->pong_input&0x02u)d->pong_right-=5;
  if(d->pong_input&0x01u)d->pong_right+=5;
  miny=(int)y+10;maxy=(int)(y+h)-10-48;
  if(d->pong_left<miny)d->pong_left=(int16_t)miny;
  if(d->pong_left>maxy)d->pong_left=(int16_t)maxy;
  if(d->pong_right<miny)d->pong_right=(int16_t)miny;
  if(d->pong_right>maxy)d->pong_right=(int16_t)maxy;
  if(d->pong_flash)d->pong_flash--;
  if(d->pong_serve){d->pong_serve--;return;}
  d->pong_x+=d->pong_dx;d->pong_y+=d->pong_dy;
  if(d->pong_y<=(int)y+4){d->pong_y=(int16_t)(y+4);d->pong_dy=(int16_t)-d->pong_dy;}
  if(d->pong_y>=(int)(y+h-10u)){
    d->pong_y=(int16_t)(y+h-10u);d->pong_dy=(int16_t)-d->pong_dy;
  }
  if(d->pong_dx<0 && d->pong_x<(int)(x+20u) && d->pong_x+12>(int)x+8 &&
     d->pong_y<(int)d->pong_left+48 && d->pong_y+6>d->pong_left) {
    int hit=d->pong_y+3-d->pong_left-24;
    d->pong_x=(int16_t)(x+20u);d->pong_dx=4;
    d->pong_dy=(int16_t)(hit/8);
    if(!d->pong_dy)d->pong_dy=(int16_t)(hit<0?-1:1);
  }
  if(d->pong_dx>0 && d->pong_x+12>(int)(x+w-20u) && d->pong_x<(int)(x+w-8u) &&
     d->pong_y<(int)d->pong_right+48 && d->pong_y+6>d->pong_right) {
    int hit=d->pong_y+3-d->pong_right-24;
    d->pong_x=(int16_t)(x+w-32u);d->pong_dx=-4;
    d->pong_dy=(int16_t)(hit/8);
    if(!d->pong_dy)d->pong_dy=(int16_t)(hit<0?-1:1);
  }
  if(d->pong_x+12<(int)x){
    d->pong_score_r=(uint8_t)((d->pong_score_r+1u)%10u);
    d->pong_flash=20u;egg_c7_round(d,-1);
  } else if(d->pong_x>(int)(x+w)) {
    d->pong_score_l=(uint8_t)((d->pong_score_l+1u)%10u);
    d->pong_flash=20u;egg_c7_round(d,1);
  }
}
static void egg_activate_c7(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  d->pong_prev=d->pong_input=d->pong_score_l=d->pong_score_r=0u;
  egg_c7_assets(d);egg_c7_reset_game(d);egg_c7_draw(d);
  d->egg_pending=0u;
}
static void egg_tick_c7(twodfx_emu *d) {
  d->egg_frame++;egg_c7_update(d);egg_c7_draw(d);
}
