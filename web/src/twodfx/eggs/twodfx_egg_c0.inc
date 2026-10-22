/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C0: public ENTERPRISE letter/stripe artwork, independent deterministic
 * five-phase sprite choreography. Card-turn pixel-morph is approximated; this
 * reference intentionally does not borrow RP2354B fixed-point worker code. */
#include "../assets/eggs/egg_C0_logo_assets.h"
#include "../assets/logo_2dfx_asset.h"
static const unsigned egg_c0_widths[7]={26u,34u,32u,30u,30u,14u,26u};
static const unsigned egg_c0_word[10]={0u,1u,2u,0u,3u,4u,3u,5u,6u,0u};
static const uint8_t *const egg_c0_glyphs[7]={asset_e1,asset_n,asset_t,
  asset_r1,asset_p,asset_i,asset_s};
static const uint8_t *const egg_c0_stripes[6]={asset_red,asset_org,
  asset_yel,asset_grn,asset_cya,asset_mag};
static uint32_t egg_c0_glyph_addr(unsigned k){
  unsigned i;uint32_t a=0x300000u;
  for(i=0;i<k;i++)a+=(egg_c0_widths[i]/2u)*52u;
  return a;
}
static unsigned egg_c0_hash(unsigned a,unsigned b){
  uint32_t z=(uint32_t)a*747796405u+(uint32_t)b*2891336453u+277803737u;
  z=((z>>((z>>28u)+4u))^z)*277803737u;
  return (unsigned)(z^(z>>22u));
}
static unsigned egg_c0_smooth(unsigned v){return v*v*(300u-2u*v)/10000u;}
static void egg_c0_assets(twodfx_emu *d){
  unsigned i,j;uint32_t off=0x300000u;
  for(i=0u;i<7u;i++){
    unsigned n=(egg_c0_widths[i]/2u)*52u;
    for(j=0u;j<n;j++){
      unsigned c=egg_c0_glyphs[i][j];
      /* Public glyphs pack left into high nibble; device needs left low. */
      d->ram[off+j]=(uint8_t)(((c&15u)<<4u)|(c>>4u));
    }
    off+=n;
  }
  for(i=0u;i<6u;i++)for(j=0u;j<144u;j++){
    unsigned c=egg_c0_stripes[i][j];
    d->ram[0x310000u+i*144u+j]=(uint8_t)((c<<4u)|(c>>4u));
  }
  memcpy(d->ram+0x360000u,logo_2dfx_data,LOGO_2DFX_DATA_SIZE);
}
static void egg_c0_scene(twodfx_emu *d){
  unsigned i,t=d->egg_frame,tvc=d->machine==TWODFX_EMU_TVC;
  unsigned wordw=0u,ox=tvc?110u:160u,oy=tvc?117u:100u;
  unsigned slot=0u;
  for(i=0u;i<10u;i++)wordw+=2u*egg_c0_widths[egg_c0_word[i]]+6u;
  if(wordw<(tvc?704u:832u))ox=((tvc?704u:832u)-wordw)/2u;
  blank_entries(d);
  egg_draw_colour(d,&slot,tvc?1u:8u,0u);
  egg_draw_xywh(d,&slot,0x67u,tvc?0u:88u,tvc?41u:16u,
                tvc?704u:744u,tvc?256u:288u,1u);
  egg_draw_end(d,&slot);
  memset(d->shadow_spt,0,sizeof d->shadow_spt);
  for(i=0u;i<10u;i++){
    unsigned glyph=egg_c0_word[i],w=egg_c0_widths[glyph];
    unsigned target=ox,j,tx,ty;
    for(j=0u;j<i;j++)target+=2u*egg_c0_widths[egg_c0_word[j]]+6u;
    tx=target;ty=oy;
    if(t<5000u){
      /* Reproducible chaos, independent of PC wall-clock time. */
      tx=94u+(egg_c0_hash(i,(t/14u)+1u)%(tvc?530u:620u));
      ty=(tvc?45u:20u)+(egg_c0_hash(i+40u,t/17u)%(tvc?170u:200u));
    }else if(t<5200u){
      unsigned p=(t-5000u)/2u,seedx=94u+egg_c0_hash(i,358u)%(tvc?530u:620u);
      unsigned seedy=(tvc?45u:20u)+egg_c0_hash(i+40u,294u)%(tvc?170u:200u);
      unsigned k=egg_c0_smooth(p);
      tx=(seedx*(100u-k)+target*k)/100u;
      ty=(seedy*(100u-k)+oy*k)/100u;
    }
    egg_c7_sprite(d,i,tx,ty,w,52u,egg_c0_glyph_addr(glyph));
    d->shadow_spt[i][6]=0x80u; /* doubled X, as in original lettering */
    if(t>=5200u && t<5460u){
      /* Alternate x/y flipback in a predictable sprite sequence. */
      unsigned p=(t-5200u)/13u;
      if(i>=p/2u)d->shadow_spt[i][6]|=(p&1u)?0x20u:0x10u;
    }
  }
  for(i=0u;i<6u;i++){
    unsigned x=ox+30u+i*101u,y=oy+98u;
    if(t<5000u){
      x=88u+egg_c0_hash(i+60u,t/17u)%(tvc?510u:630u);
      y=(tvc?47u:21u)+egg_c0_hash(i+80u,t/19u)%(tvc?190u:230u);
    }
    egg_c7_sprite(d,10u+i,x,y,48u,6u,0x310000u+i*144u);
  }
  if(t>=5500u){
    unsigned ly=tvc?70u:95u;
    if(t<5600u)ly=(unsigned)(-180+(int)(t-5500u)*3+180);
    egg_c7_sprite(d,17u,100u,ly,515u,198u,0x360000u);
  }
}
static void egg_activate_c0(twodfx_emu *d){
  egg_clean_scene(d);d->egg_frame=0u;egg_c0_assets(d);
  egg_c0_scene(d);d->egg_pending=0u;
}
static void egg_tick_c0(twodfx_emu *d){
  d->egg_frame++;egg_c0_scene(d);
}
