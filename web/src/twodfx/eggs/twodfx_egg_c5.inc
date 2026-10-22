/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C5 portable eight-pattern 16x8 showcase. The packed 4-bit pattern bank
 * lives in 2dfx resource RAM; scenes use published pattern descriptors.
 */
static void egg_c5_build_bank(twodfx_emu *d) {
  unsigned id,x,y, tvc=d->machine==TWODFX_EMU_TVC;
  for(id=0u;id<8u;id++)for(y=0u;y<8u;y++)for(x=0u;x<16u;x++) {
    unsigned c=0u, addr=0x590000u+id*64u+y*8u+(x>>1);
    uint8_t *p=&d->ram[addr];
    switch(id) {
      case 0:c=((x+2u*y)&7u)<3u?(tvc?13u:4u):3u;break;
      case 1:c=((x/4u+y/2u)&1u)?(tvc?7u:5u):(tvc?5u:2u);break;
      case 2:c=tvc?9u:((x/4u+y/2u)&1u?5u:8u);
        if(tvc&&(((x==3u||x==11u)&&(y==2u||y==6u))||
                 ((x==7u||x==15u)&&y==4u)))c=15u;
        break;
      case 3:c=(y==0u||y==7u||
                (y<4u?(x==0u||x==8u):(x==4u||x==12u)))?7u:(tvc?3u:2u);break;
      case 4:c=(x%4u==0u)?(tvc?13u:7u):
               (((x+y)&1u)?(tvc?11u:3u):(tvc?9u:1u));break;
      case 5:c=(((x+y)&7u)==0u||((x+15u-y)&7u)==0u)?7u:(tvc?11u:5u);break;
      case 6:c=((3u*x+5u*y)&7u)<4u?(tvc?13u:6u):(tvc?5u:4u);break;
      default:c=(x==0u||x==15u||y==0u||y==7u)?(tvc?15u:7u):0u;
        if(((x+y)&7u)==3u)c=tvc?9u:4u;
        break;
    }
    if(x&1u)*p=(uint8_t)((*p&15u)|(c<<4));
    else *p=(uint8_t)((*p&0xf0u)|c);
  }
  d->patterns[0].resource_address=0x590000u;
  d->patterns[0].valid=1u;
}
static void egg_c5_fill(twodfx_emu *d,unsigned *slot,
                        unsigned x,unsigned y,unsigned w,unsigned h,unsigned pattern) {
  egg_draw_extended(d,slot,0x72u,x,y,w,h,1u,0u,(uint8_t)(pattern&7u));
}
static void egg_c5_scene(twodfx_emu *d) {
  unsigned s=0u,t=d->egg_frame,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned x=tvc?126u:124u,y=tvc?49u:38u,w=tvc?512u:640u,h=tvc?216u:225u;
  unsigned pn;
  blank_entries(d);
  egg_c5_fill(d,&s,x,y,w,h,(t>>5u)&7u);
  egg_c5_fill(d,&s,x+16u,y+(tvc?8u:16u),tvc?232u:296u,72u,0u);
  egg_c5_fill(d,&s,x+(tvc?264u:328u),y+(tvc?8u:16u),tvc?232u:296u,72u,1u);
  for(pn=0u;pn<(tvc?4u:3u);pn++) {
    egg_c5_fill(d,&s,x+(tvc?16u+pn*120u:16u+pn*210u),
                y+(tvc?104u:112u),tvc?108u:186u,64u,2u+pn);
  }
  egg_c5_fill(d,&s,x+16u,y+(tvc?184u:192u),tvc?480u:608u,16u,
              (t>>3u)&7u);
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_draw_xywh(d,&s,0x67u,x+16u+((t*4u)%(tvc?464u:592u)),
                y+(tvc?184u:192u),16u,16u,1u);
  egg_draw_xywh(d,&s,0x66u,x,y,w,h,2u);
  egg_draw_colour(d,&s,tvc?13u:4u,0u);
  egg_draw_xywh(d,&s,0x66u,x+16u,y+(tvc?8u:16u),
                tvc?232u:296u,72u,1u);
  egg_draw_xywh(d,&s,0x66u,x+(tvc?264u:328u),y+(tvc?8u:16u),
                tvc?232u:296u,72u,1u);
  egg_draw_end(d,&s);
}
static void egg_activate_c5(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  egg_c5_build_bank(d);egg_c5_scene(d);d->egg_pending=0u;
}
static void egg_tick_c5(twodfx_emu *d){d->egg_frame++;egg_c5_scene(d);}
