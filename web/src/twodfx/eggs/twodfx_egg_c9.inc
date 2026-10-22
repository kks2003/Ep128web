/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C9: public Wriggler artwork with deterministic multi-sprite animation.
 * Phase/data creation is portable and independent of RP2354B machinery.
 * Entrance trajectory remains a behavioral approximation until trace parity. */
#include "../assets/eggs/egg_C9_wriggler_assets.h"
static const uint8_t *const egg_c9_phase_art[8]={
  wrig_ph0_data,wrig_ph1_data,wrig_ph2_data,wrig_ph3_data,
  wrig_ph4_data,wrig_ph5_data,wrig_ph6_data,wrig_ph7_data
};
static void egg_c9_assets(twodfx_emu *d){
  unsigned colour,ph,i,row,x,k;
  uint32_t normal=0x200000u, giant=normal+15u*8u*512u;
  unsigned giant_colour=d->machine==TWODFX_EMU_TVC?15u:7u;
  for(colour=1u;colour<=15u;colour++)for(ph=0;ph<8u;ph++) {
    uint32_t base=normal+(colour-1u)*4096u+ph*512u;
    for(i=0u;i<512u;i++){
      uint8_t v=egg_c9_phase_art[ph][i];
      unsigned l=(v>>4)==11u?0u:colour,r=(v&15u)==11u?0u:colour;
      d->ram[base+i]=(uint8_t)(l|(r<<4));
    }
  }
  /* 4x nearest-neighbour enlargement of the public 64x16 art. The sprite
     engine applies the remaining 2x horizontal/vertical transform. */
  for(ph=0u;ph<8u;ph++)for(row=0u;row<64u;row++)for(x=0u;x<256u;x+=2u){
    uint8_t v=egg_c9_phase_art[ph][(row/4u)*32u+(x/4u)/2u];
    unsigned srcx=x/4u;
    unsigned col=(srcx&1u)?(v&15u):(v>>4);
    col=col==11u?0u:giant_colour;
    for(k=0u;k<2u;k++){
      unsigned c=col;
      if((x+k)/4u != srcx) {
        unsigned vx=(x+k)/4u;
        c=(vx&1u)?(v&15u):(v>>4);
        c=c==11u?0u:giant_colour;
      }
      if(k==0u)d->ram[giant+ph*8192u+row*128u+x/2u]=(uint8_t)c;
      else d->ram[giant+ph*8192u+row*128u+x/2u]|=(uint8_t)(c<<4);
    }
  }
}
static void egg_c9_place(twodfx_emu *d,unsigned id,unsigned x,unsigned y,
                          unsigned w,unsigned h,unsigned base,unsigned flags){
  egg_c7_sprite(d,id,x,y,w,h,base);
  d->shadow_spt[id][6]=(uint8_t)flags;
}
static void egg_c9_scene(twodfx_emu *d){
  unsigned i,t=(unsigned)d->egg_frame;
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned minx=tvc?126u:124u,maxx=tvc?637u:764u;
  unsigned miny=tvc?49u:38u,maxy=tvc?288u:263u;
  unsigned count=t<620u?1u+t/10u:63u;
  unsigned attack=t>1120u?t-1120u:0u;
  memset(d->shadow_spt,0,sizeof d->shadow_spt);
  for(i=0u;i<count && i<63u;i++){
    uint32_t seed=UINT32_C(0x2dface01)^(uint32_t)((i+1u)*2654435761u);
    unsigned side=i%3u,ph=0u,colour=1u+((seed>>8)%15u);
    unsigned x=minx,y=miny;
    unsigned flags=0u;
    seed^=seed>>13;seed*=UINT32_C(0x85ebca6b);seed^=seed>>16;
    if(side==0u){x=minx; y=miny+((seed>>4)%(maxy-miny-16u));}
    else if(side==1u){x=maxx-48u;y=miny+((seed>>5)%(maxy-miny-16u));flags=0x20u;}
    else {x=minx+((seed>>6)%(maxx-minx-64u));y=maxy-12u;}
    if(attack && t<2870u){
      unsigned hold=1u+((seed>>24)&3u),elapsed=attack/hold;
      ph=(elapsed+i)&7u;
      if(side==0u)
        x=minx+((elapsed/8u)*16u)%(maxx-minx+64u);
      else if(side==1u) {
        unsigned distance=((elapsed/8u)*16u)%(maxx-minx+64u);
        x=distance>maxx-48u-minx?maxx-48u:minx+(maxx-48u-minx-distance);
      }else y=maxy-12u-(elapsed%170u);
    }
    egg_c9_place(d,i,x,y,64u,16u,
      0x200000u+(colour-1u)*4096u+ph*512u,flags);
  }
  if(t>2870u){
    unsigned go=t-2870u;
    unsigned start=tvc?712u:840u,target=tvc?156u:160u;
    unsigned delta=(go/40u)*128u;
    unsigned x=(start>target+delta)?start-delta:target;
    unsigned phase=(x==target)?5u:(go/5u)&7u;
    egg_c9_place(d,63u,x,92u,256u,64u,
                 0x200000u+15u*4096u+phase*8192u,0xe0u);
  }
}
static void egg_activate_c9(twodfx_emu *d){
  egg_clean_scene(d);d->egg_frame=0u;
  egg_c9_assets(d);egg_c9_scene(d);d->egg_pending=0u;
}
static void egg_tick_c9(twodfx_emu *d){
  if(d->egg_frame<UINT32_C(0xffffff00))d->egg_frame++;
  egg_c9_scene(d);
}
