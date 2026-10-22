/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* CE: BG grid + four independently moving sprites + animated FG lattice.
 * Demonstrates real BG -> SPB -> FG ordering in the common renderer. */
static void egg_ce_stage(const twodfx_emu *d,unsigned *x,unsigned *y,unsigned *w,unsigned *h) {
  if(d->machine==TWODFX_EMU_TVC){*x=134u;*y=73u;*w=496u;*h=192u;}
  else {*x=132u;*y=62u;*w=624u;*h=176u;}
}
static void egg_ce_assets(twodfx_emu *d){
  static const uint8_t ep_body[4]={2u,4u,5u,6u},ep_accent[4]={7u,3u,7u,1u};
  static const uint8_t tv_body[4]={3u,5u,9u,11u},tv_accent[4]={15u,7u,13u,15u};
  unsigned i,x,y,tvc=d->machine==TWODFX_EMU_TVC;
  for(i=0u;i<4u;i++){
    uint32_t addr=0x610000u+i*512u;
    uint8_t body=tvc?tv_body[i]:ep_body[i];
    uint8_t accent=tvc?tv_accent[i]:ep_accent[i];
    for(y=0u;y<32u;y++)for(x=0u;x<32u;x+=2u){
      uint8_t pix[2];unsigned p;
      for(p=0u;p<2u;p++){
        unsigned xx=x+p;uint8_t c=0;
        if(xx>=3u&&xx<=28u&&y>=3u&&y<=28u){
          c=(xx==3u||xx==28u||y==3u||y==28u||
            ((xx+y+5u*i)&7u)==0u)?accent:body;
          if((xx==11u||xx==21u)&&(y>=11u&&y<=14u))c=0u;
          if((xx>=12u&&xx<=21u&&y==22u)||
             ((xx==10u||xx==22u)&&y==21u))c=0u;
        }
        pix[p]=c;
      }
      d->ram[addr+y*16u+x/2u]=(uint8_t)(pix[0]|(pix[1]<<4));
    }
  }
}
static int egg_ce_reflect(int initial,int velocity,int minimum,int maximum,unsigned ticks){
  int span=maximum-minimum;
  int64_t position=(int64_t)initial+(int64_t)velocity*ticks-minimum;
  int64_t cycle;
  if(span<=0)return minimum;
  cycle=position%(int64_t)(2*span);
  if(cycle<0)cycle+=2*span;
  if(cycle>span)cycle=2*span-cycle;
  return minimum+(int)cycle;
}
static void egg_ce_update_sprites(twodfx_emu *d) {
  static const int init_x[4]={132,520,300,650},init_y[4]={64,80,200,210};
  static const int vel_x[4]={2,-1,1,-2},vel_y[4]={1,1,-2,-1};
  unsigned x,y,w,h,i;
  egg_ce_stage(d,&x,&y,&w,&h);
  for(i=0u;i<4u;i++){
    unsigned sx=(unsigned)egg_ce_reflect(init_x[i],vel_x[i],(int)x,(int)(x+w-32u),d->egg_frame);
    unsigned sy=(unsigned)egg_ce_reflect(init_y[i],vel_y[i],(int)y,(int)(y+h-32u),d->egg_frame);
    egg_c7_sprite(d,i,sx,sy,32u,32u,0x610000u+i*512u);
  }
}
static void egg_ce_bg(twodfx_emu *d) {
  unsigned x,y,w,h,s=0u,i,tvc=d->machine==TWODFX_EMU_TVC;
  egg_ce_stage(d,&x,&y,&w,&h);
  blank_entries(d);
  egg_draw_colour(d,&s,tvc?1u:8u,0u);
  egg_draw_xywh(d,&s,0x67u,x,y,w,h,1u);
  egg_draw_colour(d,&s,tvc?9u:3u,0u);
  for(i=16u;i<h;i+=24u)egg_draw_xywh(d,&s,0x63u,x,y+i,x+w-1u,y+i,1u);
  egg_draw_colour(d,&s,tvc?13u:4u,0u);
  for(i=24u;i<w;i+=48u)egg_draw_xywh(d,&s,0x63u,x+i,y,x+i,y+h-1u,1u);
  egg_draw_colour(d,&s,tvc?7u:6u,0u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,3u);
  egg_draw_end(d,&s);
}
static void egg_ce_fg(twodfx_emu *d) {
  unsigned x,y,w,h,i,s=0u,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned phase=(d->egg_frame>>1u)&63u;
  twodfx_2dpt_entry *fg=d->shadow_2dpt[1];
  memset(fg,0,sizeof d->shadow_2dpt[1]);
  egg_ce_stage(d,&x,&y,&w,&h);
  /* The helper writes BG; use a temporary 2DPT staging array so every FG
   * command is encoded by the same wire-format builder, not special raster. */
  {
    twodfx_2dpt_entry saved[32];
    unsigned last;
    memcpy(saved,d->shadow_2dpt[0],sizeof saved);
    egg_draw_colour(d,&s,tvc?15u:7u,0u);
    for(i=0u;i<w+64u;i+=64u){
      int xx=(int)x+(int)i+(int)phase-16;
      unsigned left,right;
      if(xx>=(int)(x+w)||xx+8<=(int)x)continue;
      left=(unsigned)(xx<(int)x?(int)x:xx);
      right=(unsigned)(xx+8>(int)(x+w)?(int)(x+w):xx+8);
      if(right>left)egg_draw_xywh(d,&s,0x67u,left,y+8u,right-left,h-16u,1u);
    }
    egg_draw_xywh(d,&s,0x66u,x-8u,y-8u,w+16u,h+16u,4u);
    egg_draw_colour(d,&s,tvc?3u:5u,0u);
    egg_draw_xywh(d,&s,0x67u,x+24u,y-24u,320u,12u,1u);
    egg_draw_colour(d,&s,tvc?5u:5u,0u);
    egg_draw_xywh(d,&s,0x67u,x+w-344u,y+h+12u,320u,12u,1u);
    egg_draw_end(d,&s);
    last=s;
    memcpy(fg,d->shadow_2dpt[0],last*sizeof fg[0]);
    memcpy(d->shadow_2dpt[0],saved,sizeof saved);
    /* Restore BG entries beyond the temporary prefix: the FG helper did not
     * intentionally modify them, but the BG table must be bit-identical. */
  }
}
static void egg_activate_ce(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  egg_ce_assets(d);egg_ce_bg(d);egg_ce_update_sprites(d);egg_ce_fg(d);
  d->egg_pending=0u;
}
static void egg_tick_ce(twodfx_emu *d) {
  d->egg_frame++;egg_ce_update_sprites(d);egg_ce_fg(d);
}
