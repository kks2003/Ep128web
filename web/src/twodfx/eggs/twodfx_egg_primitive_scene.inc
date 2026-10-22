/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* Shared 2DPT primitives for C2 and D2: independent portable primitive-showcase scene.
 * Drawing state is rebuilt as public BG 2DPT commands at each scene tick;
 * coordinates and colour groups follow the released demo's design contract.
 */
static void egg_c2_scene(twodfx_emu *d,int shifted) {
  egg_scene_rect r=egg_scene(d);
  unsigned s=0u,t=d->egg_frame,wx,cx,cy,i;
  static const unsigned grid[10]={162,181,198,213,227,240,252,263,273,282};
  unsigned is_tvc=d->machine==TWODFX_EMU_TVC;
  unsigned bg=1u,top=is_tvc?3u:2u,mid=is_tvc?11u:3u;
  unsigned accent=is_tvc?15u:7u,frame=is_tvc?5u:4u;
  unsigned gx0=r.x,gy0=r.y,gx1=r.x+r.w-1u,gy1=r.y+r.h-1u;
  blank_entries(d);
  if(shifted){
    /* Independent triangular waves, amplitudes 24 px / 10 lines. */
    unsigned tx=(t+45u)%180u,ty=(t+35u)%140u;
    int ox=tx<90u?(int)(tx*48u/90u)-24:(int)((180u-tx)*48u/90u)-24;
    int oy=ty<70u?(int)(ty*20u/70u)-10:(int)((140u-ty)*20u/70u)-10;
    egg_draw_offset(d,&s,ox,oy);
  }
  egg_draw_colour(d,&s,bg,0);
  egg_draw_xywh(d,&s,0x67u,gx0,gy0,r.w,r.h,1);
  egg_draw_colour(d,&s,top,0);
  egg_draw_xywh(d,&s,0x67u,gx0,gy0,r.w,egg_scene_h(r,72),1);
  egg_draw_colour(d,&s,mid,0);
  egg_draw_xywh(d,&s,0x67u,gx0,egg_scene_y(r,66),r.w,egg_scene_h(r,58),1);
  egg_draw_colour(d,&s,bg,0);
  egg_draw_xywh(d,&s,0x67u,gx0,egg_scene_y(r,124),r.w,egg_scene_h(r,164),1);
  cx=egg_scene_x(r,278)+egg_scene_w(r,188)/2u;
  cy=egg_scene_y(r,34)+egg_scene_h(r,86)/2u;
  egg_draw_colour(d,&s,is_tvc?7u:6u,0);
  egg_draw_xywh(d,&s,0x6bu,cx,cy,egg_scene_w(r,188)/2u,egg_scene_h(r,86)/2u,1);
  egg_draw_colour(d,&s,accent,0);
  egg_draw_xywh(d,&s,0x6au,egg_scene_x(r,268)+egg_scene_w(r,208)/2u,
                egg_scene_y(r,28)+egg_scene_h(r,98)/2u,
                egg_scene_w(r,208)/2u,egg_scene_h(r,98)/2u,2);
  egg_draw_colour(d,&s,frame,0);
  egg_draw_xywh(d,&s,0x63u,gx0,egg_scene_y(r,140),gx1,egg_scene_y(r,140),2);
  egg_draw_xywh(d,&s,0x66u,egg_scene_x(r,18),egg_scene_y(r,14),
                egg_scene_w(r,708),egg_scene_h(r,260),2);
  for(i=0;i<10;i++) {
    egg_draw_colour(d,&s,is_tvc?(i%2u?13u:3u):(i%2u?4u:3u),0);
    egg_draw_xywh(d,&s,0x63u,gx0,egg_scene_y(r,grid[i]),
                  gx1,egg_scene_y(r,grid[i]),1);
  }
  egg_draw_colour(d,&s,is_tvc?3u:3u,0);
  for(i=0;i<=8;i++)egg_draw_xywh(d,&s,0x63u,egg_scene_x(r,i*743u/8u),gy1,
                                  egg_scene_x(r,372),egg_scene_y(r,143),1);
  egg_draw_colour(d,&s,accent,0);
  egg_draw_xywh(d,&s,0x63u,gx0,egg_scene_y(r,(t*3u)%288u),
                gx1,egg_scene_y(r,(t*3u)%288u),2);
  {
    unsigned ph=t&63u, tri=ph<32u?ph:63u-ph;
    unsigned aw=150u+4u*tri,ah=60u+2u*tri;
    unsigned ax=(744u-aw)/2u,ay=90u-tri/2u;
    egg_draw_colour(d,&s,is_tvc?13u:5u,0);
    egg_draw_xywh(d,&s,0x6au,egg_scene_x(r,ax)+egg_scene_w(r,aw)/2u,
                  egg_scene_y(r,ay)+egg_scene_h(r,ah)/2u,
                  egg_scene_w(r,aw)/2u,egg_scene_h(r,ah)/2u,2);
    egg_draw_colour(d,&s,frame,0);
    egg_draw_xywh(d,&s,0x6au,egg_scene_x(r,ax+40u)+egg_scene_w(r,aw-80u)/2u,
                  egg_scene_y(r,ay+18u)+egg_scene_h(r,ah-32u)/2u,
                  egg_scene_w(r,aw-80u)/2u,egg_scene_h(r,ah-32u)/2u,1);
  }
  wx=40u+(t*5u)%584u;
  egg_draw_colour(d,&s,accent,is_tvc?9u:5u);
  egg_draw_extended(d,&s,0x68u,egg_scene_x(r,wx),egg_scene_y(r,226),
                    egg_scene_w(r,112),egg_scene_h(r,36),2,
                    (uint8_t)egg_scene_w(r,18),(uint8_t)egg_scene_h(r,8));
  egg_draw_colour(d,&s,is_tvc?7u:6u,0);
  egg_draw_xywh(d,&s,0x6bu,egg_scene_x(r,wx+22u)+egg_scene_w(r,68)/2u,
                egg_scene_y(r,232)+egg_scene_h(r,24)/2u,
                egg_scene_w(r,68)/2u,egg_scene_h(r,24)/2u,1);
  egg_draw_colour(d,&s,is_tvc?8u:6u,0);
  egg_draw_extended(d,&s,0x69u,egg_scene_x(r,540),egg_scene_y(r,210),
                    egg_scene_w(r,130),egg_scene_h(r,60),1,10u,5u);
  egg_draw_colour(d,&s,is_tvc?15u:7u,0);
  egg_draw_xywh(d,&s,0x66u,egg_scene_x(r,590),egg_scene_y(r,230),
                egg_scene_w(r,72),egg_scene_h(r,30),1);
  /* Deliberately bounded fill on the framed demonstration box. */
  egg_draw_colour(d,&s,is_tvc?10u:4u,0);
  {
    uint8_t p[3];unsigned px=egg_scene_x(r,610),py=egg_scene_y(r,244);
    p[0]=egg_xywh_high(px,py,0,0);p[1]=(uint8_t)px;p[2]=(uint8_t)py;
    egg_draw_command(d,&s,0x65u,p,3u);
  }
  egg_draw_end(d,&s);
}
