/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* D1 coordinate ruler: independent C99 display and four-phase sweep FSM.
 * Uses only standard 2DPT colour and filled-rectangle commands.
 */
static void egg_d1_block(twodfx_emu *d,unsigned *slot,unsigned col,
                         unsigned x,unsigned y,unsigned w,unsigned h) {
  egg_draw_colour(d,slot,col,0u);
  egg_draw_xywh(d,slot,0x67u,x,y,w,h,1u);
}
static void egg_d1_digit(twodfx_emu *d,unsigned *slot,unsigned x,unsigned y,
                         unsigned digit,unsigned col) {
  /* Standard seven-segment encoding, as used by the public ruler display. */
  static const uint8_t map[10]={0x3f,0x06,0x5b,0x4f,0x66,
                                0x6d,0x7d,0x07,0x7f,0x6f};
  unsigned bits=map[digit%10u];
  if(bits&1u)  egg_d1_block(d,slot,col,x+2u,y,6u,2u);
  if(bits&2u)  egg_d1_block(d,slot,col,x+8u,y+2u,2u,7u);
  if(bits&4u)  egg_d1_block(d,slot,col,x+8u,y+9u,2u,7u);
  if(bits&8u)  egg_d1_block(d,slot,col,x+2u,y+16u,6u,2u);
  if(bits&16u) egg_d1_block(d,slot,col,x,y+9u,2u,7u);
  if(bits&32u) egg_d1_block(d,slot,col,x,y+2u,2u,7u);
  if(bits&64u) egg_d1_block(d,slot,col,x+2u,y+8u,6u,2u);
}
static void egg_d1_draw(twodfx_emu *d) {
  unsigned slot=0u, tvc=d->machine==TWODFX_EMU_TVC;
  unsigned xmode=d->d1_mode==0u||d->d1_mode==1u||
                 d->d1_mode==4u||d->d1_mode==5u;
  unsigned maxx=tvc?704u:821u,maxy=tvc?311u:314u;
  unsigned coord=d->d1_position,bx=(maxx-82u)/2u;
  unsigned by=(tvc?41u:18u)+(tvc?256u:287u)/2u-15u;
  unsigned linecol=tvc?15u:7u,neighbour=tvc?3u:2u;
  unsigned border=tvc?(xmode?13u:7u):(xmode?6u:3u);
  unsigned i;
  blank_entries(d);
  egg_d1_block(d,&slot,0u,0u,0u,maxx,maxy+1u);
  if(xmode) {
    if(coord)egg_d1_block(d,&slot,neighbour,coord-1u,0u,1u,maxy+1u);
    egg_d1_block(d,&slot,linecol,coord,0u,1u,maxy+1u);
    if(coord+1u<maxx)egg_d1_block(d,&slot,neighbour,coord+1u,0u,1u,maxy+1u);
  } else {
    if(coord)egg_d1_block(d,&slot,neighbour,0u,coord-1u,maxx,1u);
    egg_d1_block(d,&slot,linecol,0u,coord,maxx,1u);
    if(coord<maxy)egg_d1_block(d,&slot,neighbour,0u,coord+1u,maxx,1u);
  }
  egg_d1_block(d,&slot,border,bx,by,82u,30u);
  egg_d1_block(d,&slot,0u,bx+1u,by+1u,80u,28u);
  egg_d1_block(d,&slot,border,bx+1u,by+1u,6u,28u);
  for(i=0;i<4u;i++) {
    unsigned div=i==0u?1000u:(i==1u?100u:(i==2u?10u:1u));
    egg_d1_digit(d,&slot,bx+18u+i*14u,by+6u,(coord/div)%10u,tvc?15u:7u);
  }
  egg_draw_end(d,&slot);
}
static void egg_d1_advance(twodfx_emu *d) {
  unsigned maxx=d->machine==TWODFX_EMU_TVC?703u:820u;
  unsigned maxy=d->machine==TWODFX_EMU_TVC?311u:314u;
  if(d->d1_mode>=4u) {
    if(d->d1_pause>0u){d->d1_pause--;return;}
    d->d1_mode=(uint8_t)((d->d1_mode-4u+1u)&3u);
    d->d1_position=(uint16_t)((d->d1_mode==1u)?maxx:
                               (d->d1_mode==3u?maxy:0u));
    d->d1_hold=0u;
    return;
  }
  if(++d->d1_hold<4u)return;
  d->d1_hold=0u;
  switch(d->d1_mode) {
    case 0: if(d->d1_position==maxx){d->d1_mode=4u;d->d1_pause=100u;}
            else {d->d1_position++;}break;
    case 1: if(d->d1_position==0u){d->d1_mode=5u;d->d1_pause=100u;}
            else {d->d1_position--;}break;
    case 2: if(d->d1_position==maxy){d->d1_mode=6u;d->d1_pause=100u;}
            else {d->d1_position++;}break;
    default:if(d->d1_position==0u){d->d1_mode=7u;d->d1_pause=100u;}
            else {d->d1_position--;}break;
  }
}
static void egg_activate_d1(twodfx_emu *d) {
  egg_clean_scene(d);
  d->egg_frame=0u;d->d1_position=0u;d->d1_mode=0u;
  d->d1_hold=0u;d->d1_pause=0u;
  egg_d1_draw(d);d->egg_pending=0u;
}
static void egg_tick_d1(twodfx_emu *d) {
  d->egg_frame++;
  egg_d1_draw(d);
  egg_d1_advance(d);
}
