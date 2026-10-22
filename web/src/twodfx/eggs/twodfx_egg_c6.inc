/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* C6 portable generated-tilemap showcase: 8x16x8 packed tile graphics,
 * 16x12 map and frame-updated marker; normal 2DPT TILEMAP command.
 */
static uint8_t egg_c6_colour(unsigned tile,unsigned x,unsigned y,unsigned tvc) {
  switch(tile) {
    case 0: return ((x/2u+y/2u)&1u)?(tvc?11u:2u):(tvc?5u:1u);
    case 1: return ((x+y)&7u)<3u?(tvc?13u:4u):(tvc?7u:3u);
    case 2: return (x==0u||x==15u||y==0u||y==7u)?(tvc?15u:7u):(tvc?11u:5u);
    case 3: return ((x*3u+y*7u)&15u)==0u?(tvc?15u:7u):(tvc?9u:1u);
    case 4: return (x==0u||x==15u||y==0u||y==7u)?(tvc?15u:7u):
                   (((x+y)&7u)==0u?(tvc?13u:4u):0u);
    case 5: return (x==0u||x==15u||y==0u||y==7u)?(tvc?7u:6u):
                   (x>=5u&&x<=10u&&y>=2u&&y<=5u?(tvc?15u:7u):0u);
    default:return 0u;
  }
}
static void egg_c6_build_tiles(twodfx_emu *d) {
  unsigned tid,x,y,tvc=d->machine==TWODFX_EMU_TVC;
  for(tid=0;tid<8u;tid++)for(y=0u;y<8u;y++)for(x=0u;x<16u;x++) {
    uint32_t addr=0x5a0000u+tid*64u+y*8u+(x>>1);
    uint8_t *p=&d->ram[addr];
    uint8_t c=egg_c6_colour(tid,x,y,tvc);
    if(x&1u)*p=(uint8_t)((*p&15u)|(c<<4));
    else *p=(uint8_t)((*p&0xf0u)|c);
  }
  d->tilesets[0].resource_address=0x5a0000u;
  d->tilesets[0].valid=1u;
  d->tilemaps[0].resource_address=0x5b0000u;
  d->tilemaps[0].width_cells=16u;
  d->tilemaps[0].height_cells=12u;
  d->tilemaps[0].tileset=0u;
  d->tilemaps[0].valid=1u;
}
static void egg_c6_upload_map(twodfx_emu *d) {
  unsigned x,y,t=d->egg_frame;
  for(y=0u;y<12u;y++)for(x=0u;x<16u;x++){
    unsigned tile=(x==0u||x==15u||y==0u||y==11u)?4u:
                  (((x+y)&3u)==0u?1u:(((3u*x+y)&7u)==0u?3u:0u));
    d->ram[0x5b0000u+y*16u+x]=(uint8_t)tile;
  }
  d->ram[0x5b0000u+(1u+((t>>5u)%10u))*16u+
        1u+((t>>2u)%14u)]=5u;
}
static void egg_c6_scene(twodfx_emu *d) {
  unsigned tvc=d->machine==TWODFX_EMU_TVC;
  unsigned mx=tvc?126u:124u,my=tvc?73u:62u;
  unsigned s=0u;
  uint8_t p[7];
  blank_entries(d);
  if(!tvc){
    egg_draw_colour(d,&s,8u,0u);
    egg_draw_xywh(d,&s,0x67u,116u,38u,272u,216u,1u);
  }
  /* TILEMAP uses: map id in top 5 bits, X highs in bits 2:1, Y bit0.
     Source cell 0,0 and viewport 16 columns x 12 rows. */
  p[0]=(uint8_t)((((mx>>8)&3u)<<1)|((my>>8)&1u));
  p[1]=(uint8_t)mx;p[2]=(uint8_t)my;
  p[3]=0u;p[4]=0u;p[5]=16u;p[6]=12u;
  egg_draw_command(d,&s,0x73u,p,7u);
  egg_draw_colour(d,&s,tvc?15u:7u,0u);
  egg_draw_xywh(d,&s,0x66u,mx-8u,my-8u,272u,112u,2u);
  egg_draw_colour(d,&s,tvc?13u:4u,0u);
  egg_draw_xywh(d,&s,0x67u,mx+16u,my+120u,224u,8u,1u);
  egg_draw_end(d,&s);
}
static void egg_activate_c6(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  egg_c6_build_tiles(d);egg_c6_upload_map(d);egg_c6_scene(d);
  d->egg_pending=0u;
}
static void egg_tick_c6(twodfx_emu *d) {
  d->egg_frame++;egg_c6_upload_map(d);
  /* descriptors and playlist deliberately remain unchanged while only map
     bytes update in resource RAM at each accepted scene boundary. */
}
