/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C1: sprite transform benchmark, 2 large panels and 62 smileys.
 * Uses the public ZX1 assets and portable decoder.  Timed *visual phases*
 * follow 50Hz frame ticks, never synthetic RP2354B render measurements. */
#include "../assets/eggs/egg_C1_benchmark_assets.h"
static void egg_c1_assets(twodfx_emu *d){
  uint32_t n=0;
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  const uint8_t *sm=tvc?egg_C1_smiley_tvc_raw:egg_C1_smiley_enterprise_raw;
  const uint8_t *p0=tvc?egg_C1_panel0_tvc_zx1:egg_C1_panel0_enterprise_zx1;
  const uint8_t *p1=tvc?egg_C1_panel1_tvc_zx1:egg_C1_panel1_enterprise_zx1;
  size_t n0=tvc?sizeof egg_C1_panel0_tvc_zx1:sizeof egg_C1_panel0_enterprise_zx1;
  size_t n1=tvc?sizeof egg_C1_panel1_tvc_zx1:sizeof egg_C1_panel1_enterprise_zx1;
  memcpy(d->ram+0x100000u,sm,128u);
  memcpy(d->ram+0x7e0000u,p0,n0);
  memcpy(d->ram+0x7e8000u,p1,n1);
  if(!zx1_decompress(d,0x7e0000u,0x110000u,0u,&n)||n!=62100u){
    d->egg_stage=1u;return;
  }
  if(!zx1_decompress(d,0x7e8000u,0x120000u,0u,&n)||n!=62100u){
    d->egg_stage=1u;return;
  }
  d->egg_stage=0u;
}
static void egg_c1_scene(twodfx_emu *d){
  unsigned i, t=d->egg_frame,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned ox=tvc?0u:88u,oy=tvc?41u:16u;
  unsigned count=0u,phase=0u,transform=0u;
  blank_entries(d);
  memset(d->shadow_spt,0,sizeof d->shadow_spt);
  if(d->egg_stage)return;
  if(t>=500u){
    count=(t-500u)/50u;
    if(count>62u)count=62u;
    if(t>=3600u){
      unsigned elapsed=t-3600u;
      phase=(elapsed/250u)%8u;
      transform=(phase&1u?0x80u:0u)|
                 (phase&2u?0x40u:0u)|
                 (phase&4u?0x20u:0u);
    }
  }
  egg_c7_sprite(d,0u,ox+16u,oy+10u,540u,230u,0x110000u);
  egg_c7_sprite(d,1u,ox+130u,oy+34u,540u,230u,0x120000u);
  for(i=0u;i<count;i++){
    unsigned sx=ox+40u+(i%8u)*75u,sy=oy+42u+(i/8u)*25u;
    if(t>=5600u){
      sx=ox+20u+(egg_c0_hash(i,t/7u)%(tvc?640u:690u));
      sy=oy+15u+(egg_c0_hash(i+130u,t/9u)%(tvc?215u:260u));
    }
    egg_c7_sprite(d,i+2u,sx,sy,16u,16u,0x100000u);
    d->shadow_spt[i+2u][6]=(uint8_t)transform;
  }
  {unsigned s=0u;
   egg_draw_colour(d,&s,tvc?15u:7u,0u);
   egg_draw_xywh(d,&s,0x66u,ox+6u,oy+5u,tvc?690u:728u,tvc?246u:278u,2u);
   egg_draw_end(d,&s);
  }
}
static void egg_activate_c1(twodfx_emu *d){
  egg_clean_scene(d);d->egg_frame=0u;egg_c1_assets(d);
  egg_c1_scene(d);d->egg_pending=0u;
}
static void egg_tick_c1(twodfx_emu *d){
  d->egg_frame++;egg_c1_scene(d);
}
