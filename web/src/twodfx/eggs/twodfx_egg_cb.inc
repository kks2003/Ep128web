/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* CB: Static ARC/PIE stress scene. Public geometry/colour values; independently
 * encoded with portable 2DPT helpers. No simulated render-time pulse. */
static const unsigned egg_cb_rings[2][5]={{10u,8u,720u,270u,1u},{70u,38u,600u,210u,2u}};
static const unsigned egg_cb_pies[6][6]={{20u,14u,360u,180u,0u,96u},{230u,28u,360u,220u,64u,180u},{72u,78u,560u,198u,128u,24u},{330u,46u,380u,224u,192u,72u},{34u,118u,620u,158u,32u,224u},{410u,8u,318u,270u,220u,40u}};
static const unsigned egg_cb_arcs[8][7]={{28u,6u,690u,274u,0u,255u,1u},{54u,30u,636u,230u,32u,210u,2u},{110u,42u,528u,194u,75u,250u,3u},{176u,70u,420u,150u,150u,50u,4u},{250u,96u,360u,130u,208u,92u,2u},{8u,128u,720u,144u,96u,192u,1u},{140u,18u,480u,254u,240u,120u,3u},{300u,108u,390u,132u,16u,160u,4u}};
static void egg_activate_cb(twodfx_emu *d) {
  static const uint8_t ep_pie[6]={2,3,4,6,5,1};
  static const uint8_t tvc_pie[6]={9,10,11,12,13,14};
  static const uint8_t ep_arc[8]={7,3,6,5,4,2,1,7};
  static const uint8_t tvc_arc[8]={15,7,6,5,4,3,2,8};
  unsigned s=0u,i,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned ox=tvc?0u:88u,oy=tvc?41u:16u;
  egg_clean_scene(d);d->egg_frame=0u;
  egg_draw_colour(d,&s,tvc?1u:8u,0u);
  egg_draw_xywh(d,&s,0x67u,ox,oy,tvc?704u:744u,tvc?256u:288u,1u);
  for(i=0;i<2u;i++) {
    const unsigned *v=egg_cb_rings[i];
    egg_draw_colour(d,&s,i==0u?2u:3u,0u);
    egg_draw_xywh(d,&s,0x6au,ox+v[0]+v[2]/2u,oy+v[1]+v[3]/2u,
                  v[2]/2u,v[3]/2u,v[4]);
  }
  for(i=0;i<6u;i++) {
    const unsigned *v=egg_cb_pies[i];
    egg_draw_colour(d,&s,tvc?tvc_pie[i]:ep_pie[i],0u);
    egg_draw_extended(d,&s,0x6du,ox+v[0]+v[2]/2u,
      oy+v[1]+v[3]/2u,v[2]/2u,v[3]/2u,1u,(uint8_t)v[4],(uint8_t)v[5]);
  }
  for(i=0;i<8u;i++) {
    const unsigned *v=egg_cb_arcs[i];
    egg_draw_colour(d,&s,tvc?tvc_arc[i]:ep_arc[i],0u);
    egg_draw_extended(d,&s,0x6cu,ox+v[0]+v[2]/2u,
      oy+v[1]+v[3]/2u,v[2]/2u,v[3]/2u,v[6],(uint8_t)v[4],(uint8_t)v[5]);
  }
  egg_draw_end(d,&s);d->egg_pending=0u;
}
static void egg_tick_cb(twodfx_emu *d){(void)d; /* static 2DPT; deliberate */}
