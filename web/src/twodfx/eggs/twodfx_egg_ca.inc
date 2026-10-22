/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* CA: independently written Boulder-style deterministic tiled world.
 * Public artwork and visible route specification, no MCU-specific routines.
 */
#include "../assets/eggs/egg_CA_boulder_tiles.h"
static const uint8_t egg_ca_route[10][2] = {
  {0,0},{40,0},{80,24},{130,48},{146,74},
  {146,88},{80,88},{0,88},{0,48},{0,0}
};
static unsigned egg_ca_cells_x(const twodfx_emu *d) {
  return d->machine==TWODFX_EMU_TVC?30u:38u;
}
static unsigned egg_ca_cells_y(const twodfx_emu *d) {
  return d->machine==TWODFX_EMU_TVC?26u:25u;
}
static unsigned egg_ca_window_x(const twodfx_emu *d) {
  return d->machine==TWODFX_EMU_TVC?142u:140u;
}
static unsigned egg_ca_window_y(const twodfx_emu *d) {
  return d->machine==TWODFX_EMU_TVC?65u:46u;
}
static uint8_t egg_ca_colour(twodfx_emu *d,uint8_t c){
  static const uint8_t tvc[8]={0,1,7,3,9,13,5,15};
  return d->machine==TWODFX_EMU_TVC && c<8u?tvc[c]:c;
}
static uint8_t egg_ca_import_byte(twodfx_emu *d,uint8_t v){
  return (uint8_t)(egg_ca_colour(d,v>>4)|
                   (egg_ca_colour(d,v&15u)<<4));
}
static uint8_t egg_ca_object(unsigned x,unsigned y) {
  if(x==0u||y==0u||x==79u||y==49u)return BDR_OBJ_WALL;
  if((x==70u&&y==42u))return BDR_OBJ_EXIT;
  if((y==6u&&x>4u&&x<36u)||(y==18u&&x>22u&&x<61u)||
     (x==35u&&y>5u&&y<26u)||(x==58u&&y>18u&&y<43u))
    return BDR_OBJ_EMPTY;
  if((x%20u==0u&&y>3u)||(y%13u==0u&&x>4u))return BDR_OBJ_BRICK;
  if((x*7u+y*11u)%37u==0u)return BDR_OBJ_DIAMOND;
  if((x*5u+y*3u)%19u==0u)return BDR_OBJ_ROCK;
  if((x+y)%11u==0u||(3u*x+y)%17u==0u)return BDR_OBJ_EMPTY;
  return BDR_OBJ_DIRT;
}
static void egg_ca_assets(twodfx_emu *d) {
  unsigned tile,i,ox,oy,q;
  const uint32_t b=0x5c0000u,map=0x5d0000u,hero=0x5e0000u;
  for(tile=0;tile<BOULDER_TILE_COUNT;tile++)for(i=0;i<64u;i++)
    d->ram[b+tile*64u+i]=egg_ca_import_byte(d,boulder_tiles[tile][i]);
  for(oy=0;oy<50u;oy++)for(ox=0;ox<80u;ox++){
    unsigned kind=egg_ca_object(ox,oy);
    for(q=0;q<4u;q++){
      unsigned tx=ox*2u+(q&1u),ty=oy*2u+(q>>1);
      d->ram[map+ty*160u+tx]=boulder_object_tiles[kind][q];
    }
  }
  for(i=0;i<16u;i++)for(q=0;q<16u;q++){
    unsigned tile=boulder_object_tiles[BDR_OBJ_PLAYER][(i/8u)*2u+q/8u];
    d->ram[hero+i*16u+q]=d->ram[b+tile*64u+(i%8u)*8u+q%8u];
  }
  d->tilesets[2].resource_address=b;d->tilesets[2].valid=1u;
  d->tilemaps[2].resource_address=map;d->tilemaps[2].width_cells=160u;
  d->tilemaps[2].height_cells=100u;d->tilemaps[2].tileset=2u;
  d->tilemaps[2].valid=1u;
  {
    unsigned x=egg_ca_window_x(d)+egg_ca_cells_x(d)*8u-16u;
    unsigned y=egg_ca_window_y(d)+egg_ca_cells_y(d)*4u-8u+
               (d->machine==TWODFX_EMU_ENTERPRISE?4u:0u);
    egg_c7_sprite(d,0u,x,y,32u,16u,hero);
  }
}
static void egg_ca_scene(twodfx_emu *d) {
  unsigned wx=egg_ca_window_x(d),wy=egg_ca_window_y(d);
  unsigned w=egg_ca_cells_x(d)*16u,h=egg_ca_cells_y(d)*8u,s=0u;
  unsigned sx=d->ca_camera_x/16u,sy=d->ca_camera_y/8u;
  unsigned dx=wx-(d->ca_camera_x&15u),dy=wy-(d->ca_camera_y&7u);
  unsigned mask=d->machine==TWODFX_EMU_TVC?1u:8u;
  unsigned edge=d->machine==TWODFX_EMU_TVC?15u:7u;
  uint8_t p[7]={ (uint8_t)((2u<<3)|((dx>>8&3u)<<1)|(dy>>8&1u)),
    (uint8_t)dx,(uint8_t)dy,(uint8_t)sx,(uint8_t)sy,
    (uint8_t)(egg_ca_cells_x(d)+1u),
    (uint8_t)(egg_ca_cells_y(d)+1u)};
  blank_entries(d);
  egg_draw_colour(d,&s,mask,0u);
  egg_draw_xywh(d,&s,0x67u,wx,wy,w,h,1u);
  egg_draw_command(d,&s,0x73u,p,7u);
  egg_draw_xywh(d,&s,0x67u,wx-16u,wy-8u,w+32u,8u,1u);
  egg_draw_xywh(d,&s,0x67u,wx-16u,wy,16u,h,1u);
  egg_draw_xywh(d,&s,0x67u,wx+w,wy,16u,h,1u);
  egg_draw_xywh(d,&s,0x67u,wx-16u,wy+h,w+32u,8u,1u);
  egg_draw_colour(d,&s,edge,0u);
  egg_draw_xywh(d,&s,0x66u,wx-2u,wy-2u,w+4u,h+4u,4u);
  egg_draw_end(d,&s);
}
static void egg_activate_ca(twodfx_emu *d) {
  egg_clean_scene(d);d->egg_frame=0u;
  d->ca_camera_x=d->ca_camera_y=d->ca_target_x=d->ca_target_y=0u;
  d->ca_route=0u;d->ca_pause=0u;d->ca_phase=0u;
  egg_ca_assets(d);egg_ca_scene(d);d->egg_pending=0u;
}
static void egg_tick_ca(twodfx_emu *d) {
  d->egg_frame++;
  if(!d->ca_phase){
    if(++d->ca_pause>=100u){
      d->ca_pause=0u;d->ca_phase=1u;
      d->ca_route=(uint8_t)((d->ca_route+1u)%10u);
      if(!d->ca_route)d->ca_route=1u;
      d->ca_target_x=(uint16_t)(egg_ca_route[d->ca_route][0]*16u);
      d->ca_target_y=(uint16_t)(egg_ca_route[d->ca_route][1]*8u);
    }
  }else{
    if(d->ca_camera_x<d->ca_target_x)
      d->ca_camera_x=(uint16_t)((d->ca_camera_x+2u<d->ca_target_x)?
                                  d->ca_camera_x+2u:d->ca_target_x);
    else if(d->ca_camera_x>d->ca_target_x)
      d->ca_camera_x=(uint16_t)((d->ca_camera_x>d->ca_target_x+2u)?
                                  d->ca_camera_x-2u:d->ca_target_x);
    else if(d->ca_camera_y<d->ca_target_y)d->ca_camera_y++;
    else if(d->ca_camera_y>d->ca_target_y)d->ca_camera_y--;
    if(d->ca_camera_x==d->ca_target_x&&d->ca_camera_y==d->ca_target_y)
      d->ca_phase=0u;
  }
  egg_ca_scene(d);
}
