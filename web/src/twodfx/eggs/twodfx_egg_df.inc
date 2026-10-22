/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* DF: graphics validation phases, including stationary pattern phase under
 * XY offsets, odd-width bitmap blits, and animated clipping.  Rendering is
 * through standard resource descriptors and 2DPT, no MCU acceleration. */
static int egg_df_wave(unsigned tick,unsigned period,int amplitude) {
  int p=(int)(tick%period),half=(int)period/2;
  if(p>half)p=(int)period-p;
  return -amplitude+2*amplitude*p/half;
}
static void egg_df_assets(twodfx_emu *d){
  unsigned i,x,y,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned base=0x5b0000u;
  for(i=0;i<2u;i++)for(y=0;y<8u;y++)for(x=0;x<16u;x+=2u){
    unsigned k[2],j;
    for(j=0;j<2u;j++){
      unsigned xx=x+j;
      k[j]=(i==0u?((xx^y)&1u):((xx+3u*y)&3u))?
        (tvc?15u:7u):(tvc?1u:8u);
    }
    d->ram[0x5a0000u+i*64u+y*8u+x/2u]=(uint8_t)(k[0]|(k[1]<<4));
  }
  d->patterns[1].resource_address=0x5a0000u;d->patterns[1].valid=1u;
  for(y=0;y<104u;y++)for(x=0;x<161u;x+=2u){
    unsigned c[2],j;
    for(j=0;j<2u;j++){
      unsigned xx=x+j;
      c[j]=((xx%23u)<2u||(y%19u)<2u)?(tvc?15u:4u):
        ((((xx/16u)+(y/13u))&3u)==0u)?3u:
        ((xx+2u*y)/11u%3u==0u)?(tvc?7u:6u):
        xx<80u?(tvc?9u:5u):(tvc?13u:1u);
    }
    d->ram[base+y*81u+x/2u]=(uint8_t)(c[0]|(c[1]<<4));
  }
  d->bitmaps[60].resource_address=base;
  d->bitmaps[60].width=161u;d->bitmaps[60].height=104u;
  d->bitmaps[60].valid=1u;
}
static void egg_df_bucket(twodfx_emu *d,unsigned *slot,unsigned x,unsigned y,
                          unsigned pattern){
  uint8_t p[5]={egg_xywh_high(x,y,0u,0u),(uint8_t)x,(uint8_t)y,1u,
                (uint8_t)pattern};
  egg_draw_command(d,slot,0x74u,p,5u);
}
static void egg_df_blit(twodfx_emu *d,unsigned *slot,unsigned x,unsigned y,int exact){
  uint8_t p[4]={egg_xywh_high(x,y,0u,0u)|(exact?0x80u:0u),
   (uint8_t)x,(uint8_t)y,60u};
  egg_draw_command(d,slot,0x71u,p,4u);
}
static void egg_df_crop_stretch(twodfx_emu *d,unsigned *slot,
                                unsigned dx,unsigned dy,int stretch){
  /* Public 77h/78h wire layout, independently packed. The source rectangle
   * 11,9,91,71 exercises odd-width 4bpp nibble starts/strides. */
  unsigned sx=11u,sy=9u,sw=91u,sh=71u,dw=stretch?153u:sw;
  unsigned dh=stretch?149u:sh;
  uint8_t p[11]={0};
  p[0]=(uint8_t)(egg_xywh_high(sx,sy,sw,sh)|0x80u);
  p[1]=(uint8_t)sx;p[2]=(uint8_t)sy;
  p[3]=(uint8_t)sw;p[4]=(uint8_t)sh;
  p[5]=egg_xywh_high(dx,dy,dw,dh);
  p[6]=(uint8_t)dx;p[7]=(uint8_t)dy;
  if(stretch){p[8]=(uint8_t)dw;p[9]=(uint8_t)dh;p[10]=60u;}
  else p[8]=60u;
  egg_draw_command(d,slot,stretch?0x78u:0x77u,p,stretch?11u:9u);
}
static void egg_df_clip(twodfx_emu *d,unsigned *slot,unsigned x,unsigned y,
                        unsigned w,unsigned h){
  /* Clip is an actual 2DPT command (0x79), not a host-side scissor. */
  egg_draw_xywh(d,slot,0x79u,x,y,w,h,1u);
}
static void egg_df_scene(twodfx_emu *d){
  unsigned t=d->egg_frame,phase=(t/1000u)%8u,s=0u;
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned x=tvc?0u:88u,y=tvc?41u:16u,w=tvc?704u:744u,h=tvc?256u:288u;
  unsigned paper=tvc?1u:8u,ink=tvc?15u:7u;
  int dx=egg_df_wave(t,96u,10),dy=egg_df_wave(t+37u,124u,5);
  blank_entries(d);memset(d->shadow_spt,0,sizeof d->shadow_spt);
  egg_draw_colour(d,&s,paper,0u);egg_draw_xywh(d,&s,0x67u,x,y,w,h,1u);
  if(phase>=5u){
    if(phase==6u)egg_df_clip(d,&s,x+18u,y+12u,w-36u,h-24u);
    else if(phase==7u){
      unsigned inset=(unsigned)(egg_df_wave(t,250u,30)+30);
      egg_df_clip(d,&s,x+inset,y+inset/2u,w-2u*inset,h-inset);
    }
  }
  if(phase==0u || phase>=5u){
    egg_draw_colour(d,&s,ink,0u);
    egg_draw_xywh(d,&s,0x66u,x+30u,y+28u,w/2u-50u,h-70u,2u);
    egg_draw_xywh(d,&s,0x6au,x+3u*w/4u,y+h/2u,w/6u,h/3u,2u);
    egg_draw_offset(d,&s,dx,dy);
    egg_df_bucket(d,&s,x+w/4u,y+h/2u,0u);
    egg_df_bucket(d,&s,x+3u*w/4u,y+h/2u,1u);
    egg_draw_offset(d,&s,0,0);
  }else{
    egg_scene_rect r=egg_scene(d);
    unsigned x0=r.x+29u,y0=r.y+35u;
    unsigned destx=r.x+r.w/2u+23u,desty=r.y+37u;
    egg_draw_colour(d,&s,tvc?15u:4u,0u);
    egg_draw_xywh(d,&s,0x66u,x0-1u,y0-1u,163u,106u,1u);
    egg_df_blit(d,&s,x0,y0,1);
    egg_draw_colour(d,&s,3u,0u);
    egg_draw_xywh(d,&s,0x66u,x0+11u,y0+9u,91u,71u,1u);
    if(phase==2u || phase==4u)
      egg_draw_offset(d,&s,egg_df_wave(t,96u,10),
                           egg_df_wave(t+25u,128u,7));
    egg_df_crop_stretch(d,&s,destx,
                             desty+(phase<=2u?34u:0u),phase>=3u);
    egg_draw_offset(d,&s,0,0);
  }
  egg_draw_colour(d,&s,ink,0u);
  for(unsigned j=0u;j<8u;j++){
    if(j==phase)egg_draw_xywh(d,&s,0x67u,x+24u+j*22u,y+7u,17u,5u,1u);
    else egg_draw_xywh(d,&s,0x66u,x+24u+j*22u,y+7u,17u,5u,1u);
  }
  egg_draw_end(d,&s);
}
static void egg_activate_df(twodfx_emu *d){
  egg_clean_scene(d);d->egg_frame=0u;egg_df_assets(d);
  egg_df_scene(d);d->egg_pending=0u;
}
static void egg_tick_df(twodfx_emu *d){d->egg_frame++;egg_df_scene(d);}
