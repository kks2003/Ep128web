/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* Shared helpers for portable 3D Easter eggs D3-D5.
 * These drive the existing documented 3D pipeline; they are not MCU code.
 */
#include "../assets/eggs/egg_D3_elite_showcase_data.h"
#include <math.h>

#define EGG_D3_MESH_BASE  0x600000u
#define EGG_D4_RING_BASE  0x640000u
#define EGG_D5_RING_BASE  0x650000u
#define EGG_D5_ASP_BASE   0x660000u
#define EGG_D3_FIRST_MESH 32u
#define EGG_D4_RING_MESH  96u
#define EGG_D5_RING_MESH  97u
#define EGG_D5_ASP_MESH   98u
#define EGG_D4_ASP_MESH 99u
#define EGG_D5_PLUME_MESH 100u
#define EGG_D4_OTHER_MESH 101u
#define EGG_D5_OTHER_MESH 102u
#define EGG_D4_PLUME_MESH 103u
#define EGG_PI 3.14159265358979323846

static void egg_3d_put_i16(uint8_t *p,int16_t v){
  p[0]=(uint8_t)v; p[1]=(uint8_t)((uint16_t)v>>8);
}
static void egg_3d_pack_angles(uint8_t *p,unsigned roll,unsigned yaw,unsigned pitch){
  uint32_t v=(uint32_t)(roll&1023u)|((uint32_t)(yaw&1023u)<<10)|((uint32_t)(pitch&1023u)<<20);
  unsigned i; for(i=0u;i<4u;i++) p[i]=(uint8_t)(v>>(i*8u));
}
static void egg_draw_mesh(twodfx_emu *d,unsigned *slot,uint8_t opcode,
                          unsigned mesh,int16_t x,int16_t y,int16_t z,
                          unsigned roll,unsigned yaw,unsigned pitch){
  uint8_t p[11];
  p[0]=(uint8_t)mesh;
  egg_3d_put_i16(p+1,x); egg_3d_put_i16(p+3,y); egg_3d_put_i16(p+5,z);
  egg_3d_pack_angles(p+7,roll,yaw,pitch);
  egg_draw_command(d,slot,opcode,p,11u);
}
static int16_t egg_wave(unsigned phase,double amplitude){
  double a=(double)(phase&1023u)*(2.0*EGG_PI/1024.0);
  return (int16_t)lround(sin(a)*amplitude);
}
static uint32_t egg_3d_store_model(twodfx_emu *d,uint32_t base,
                                   unsigned mesh_id,const d3_model_t *m){
  unsigned i,j,triangles=0u;
  uint32_t table,ptr;
  if(!d||!m||mesh_id>=256u)return base;
  for(i=0u;i<m->face_count;i++) if(m->faces[i].count>=3u) triangles+=(unsigned)m->faces[i].count-2u;
  ptr=base & (TWODFX_EMU_RESOURCE_BYTES-1u);
  for(i=0u;i<m->vertex_count;i++){
    egg_3d_put_i16(&d->ram[ptr],m->vertices[i].x); ptr=(ptr+2u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
    egg_3d_put_i16(&d->ram[ptr],m->vertices[i].y); ptr=(ptr+2u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
    egg_3d_put_i16(&d->ram[ptr],m->vertices[i].z); ptr=(ptr+2u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
  }
  table=ptr;
  for(i=0u;i<m->face_count;i++){
    uint8_t colour=(d->machine==TWODFX_EMU_TVC?m->tvc_palette[i]:m->enterprise_palette[i])&15u;
    for(j=1u;j+1u<m->faces[i].count;j++){
      d->ram[ptr]=m->faces[i].vertex[0]; ptr=(ptr+1u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
      d->ram[ptr]=m->faces[i].vertex[j]; ptr=(ptr+1u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
      d->ram[ptr]=m->faces[i].vertex[j+1u]; ptr=(ptr+1u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
      d->ram[ptr]=(uint8_t)(0x70u|colour); ptr=(ptr+1u)&(TWODFX_EMU_RESOURCE_BYTES-1u);
    }
  }
  (void)table;
  twodfx_3d_define(&d->scene3d,mesh_id,base,m->vertex_count,triangles);
  return ptr;
}
static void egg_3d_clear_scene(twodfx_emu *d,unsigned *slot){
  unsigned full_w=d->machine==TWODFX_EMU_TVC?704u:744u;
  unsigned full_h=d->machine==TWODFX_EMU_TVC?256u:288u;
  blank_entries(d);
  egg_draw_colour(d,slot,0u,0u);
  egg_draw_xywh(d,slot,0x67u,d->machine==TWODFX_EMU_TVC?0u:88u,
                d->machine==TWODFX_EMU_TVC?41u:16u,full_w,full_h,1u);
}
static void egg_3d_load_showcase_models(twodfx_emu *d){
  unsigned i; uint32_t addr=EGG_D3_MESH_BASE;
  for(i=0u;i<D3_MODEL_COUNT;i++) addr=egg_3d_store_model(d,addr,EGG_D3_FIRST_MESH+i,&d3_models[i]);
}

/* 2dfx continuation: the two public-demo tunnels are built as ordinary indexed
 * triangle meshes. All geometry is independently calculated in software.
 * The inactive bank is populated before its 2DPT reference is published on
 * the accepted VSYNC. No MCU work scheduling or render-duration simulation. */
static double egg_tunnel_sine(double distance,double period,double radians){
  return sin(distance*(2.0*EGG_PI/period)+radians);
}
static void egg_tunnel_centre(double world,double *x,double *y){
  *x=260.0*egg_tunnel_sine(world,10000.0,0.0)+
       85.0*egg_tunnel_sine(world,21000.0,0.86);
  *y=125.0*egg_tunnel_sine(world,7800.0,1.05)+
       45.0*egg_tunnel_sine(world,15500.0,3.65);
}
static void egg_tunnel_write_vertex(uint8_t *p,double x,double y,double z){
  egg_3d_put_i16(p,(int16_t)lround(x));
  egg_3d_put_i16(p+2,(int16_t)lround(y));
  egg_3d_put_i16(p+4,(int16_t)lround(z));
}
static void egg_tunnel_build(twodfx_emu *d,uint32_t base,unsigned id,
                             unsigned rings,unsigned spacing,uint32_t travel){
  uint8_t *b=d->ram+base;
  unsigned ring,side,face=0u;
  double ox,oy;
  const double radii_x=205.0,radii_y=128.0;
  egg_tunnel_centre((double)travel,&ox,&oy);
  /* Fixed 96-vertex table preserves the public triangle-table offset
     across 4/8/12-ring modes, as required by the public DEFINE_MESH ABI. */
  memset(b,0,96u*6u+176u*4u);
  for(ring=0u;ring<rings;ring++){
    double z=180.0+(double)ring*spacing-(double)(travel%spacing);
    double world=(double)travel+z,cx,cy;
    double envelope=1.20+0.20*egg_tunnel_sine(world,10500.0,0.35);
    double twist=0.08*egg_tunnel_sine(world,14500.0,0.52);
    egg_tunnel_centre(world,&cx,&cy);
    for(side=0u;side<8u;side++){
      double a=(double)side*EGG_PI/4.0+twist;
      egg_tunnel_write_vertex(b+(ring*8u+side)*6u,
        cx-ox+radii_x*envelope*cos(a),
        cy-oy+radii_y*envelope*sin(a),z);
    }
  }
  for(ring=0u;ring+1u<rings;ring++)for(side=0u;side<8u;side++){
    unsigned n=(side+1u)&7u;
    uint8_t a=(uint8_t)(ring*8u+side),b0=(uint8_t)(ring*8u+n);
    uint8_t c=(uint8_t)((ring+1u)*8u+n),e=(uint8_t)((ring+1u)*8u+side);
    uint8_t *p=b+96u*6u+(face++)*4u;
    p[0]=a;p[1]=b0;p[2]=c;p[3]=(uint8_t)(0xf0u|(1u+(side%14u)));
    p=b+96u*6u+(face++)*4u;
    p[0]=a;p[1]=c;p[2]=e;p[3]=(uint8_t)(0xf0u|(1u+(side%14u)));
  }
  twodfx_3d_define(&d->scene3d,id,base,96u,face);
}
static void egg_tunnel_camera(twodfx_emu *d,uint32_t travel,unsigned profile){
  uint8_t p[10]={0};
  double x0,y0,x1,y1,strength=(double)profile/2.0;
  int yaw,pitch;
  egg_tunnel_centre((double)travel,&x0,&y0);
  egg_tunnel_centre((double)travel+550.0,&x1,&y1);
  yaw=(int)lround((x1-x0)*163.0/550.0*strength);
  pitch=(int)lround(-(y1-y0)*163.0/550.0*strength);
  egg_3d_put_i16(p,(int16_t)lround(strength*32.0*
      egg_tunnel_sine((double)d->egg_frame,390.0,0.0)));
  egg_3d_put_i16(p+2,(int16_t)lround(strength*22.0*
      egg_tunnel_sine((double)d->egg_frame,510.0,0.8)));
  egg_3d_pack_angles(p+6,0u,(unsigned)yaw,(unsigned)pitch);
  twodfx_3d_set_camera(&d->scene3d,p);
}
static void egg_tunnel_controls(twodfx_emu *d){
  uint8_t value;
  while(twodfx_emu_egg_pop_input(d,&value)){
    if(value<=5u){d->tunnel_mode=value;d->tunnel_auto=0u;d->tunnel_phase=0u;}
    else if(value==255u){d->tunnel_auto=1u;d->tunnel_phase=0u;}
    else if(value>=240u&&value<=242u)d->tunnel_profile=(uint8_t)(value-240u);
    else if(value==243u)d->tunnel_ship=1u;
    else if(value==244u)d->tunnel_ship=0u;
    else if(value==245u)d->tunnel_zoom=0u;
    else if(value==246u)d->tunnel_zoom=1u;
  }
  if(d->tunnel_auto && ++d->tunnel_phase>=400u){
    d->tunnel_phase=0u;
    d->tunnel_mode=(uint8_t)((d->tunnel_mode+1u)%6u);
  }
}
static void egg_tunnel_ship(twodfx_emu *d,unsigned *slot,unsigned asp_mesh,
                            unsigned plume_mesh){
  int16_t x,y,z;
  double cx,cy,sx,sy,shipz;
  unsigned roll,yaw,pitch;
  if(!d->tunnel_ship)return;
  shipz=410.0+(d->tunnel_zoom?74.0*
      egg_tunnel_sine((double)d->egg_frame,160.0,0.0):0.0);
  egg_tunnel_centre((double)d->tunnel_travel,&cx,&cy);
  egg_tunnel_centre((double)d->tunnel_travel+shipz,&sx,&sy);
  x=(int16_t)lround(sx-cx+21.0*
       egg_tunnel_sine((double)d->egg_frame,115.0,0.0));
  y=(int16_t)lround(sy-cy+25.0);
  z=(int16_t)lround(shipz);
  roll=(unsigned)lround(20.0*egg_tunnel_sine((double)d->egg_frame,200.0,0.0));
  yaw=(unsigned)lround((sx-cx)*163.0/shipz);
  pitch=(unsigned)lround(-(sy-cy)*163.0/shipz);
  egg_draw_colour(d,slot,d->machine==TWODFX_EMU_TVC?15u:4u,0u);
  if(plume_mesh)egg_draw_mesh(d,slot,0x7bu,plume_mesh,x,y,z,roll,yaw,pitch);
  egg_draw_mesh(d,slot,0x7cu,asp_mesh,x,y,z,roll,yaw,pitch);
}
static void egg_tunnel_hud(twodfx_emu *d,unsigned *slot){
  egg_scene_rect r=egg_scene(d);
  unsigned i;
  egg_draw_colour(d,slot,d->machine==TWODFX_EMU_TVC?15u:4u,0u);
  for(i=0u;i<6u;i++){
    unsigned active=i==d->tunnel_mode;
    egg_draw_xywh(d,slot,0x67u,r.x+8u+i*16u,r.y+8u,
                  active?12u:5u,active?6u:3u,1u);
  }
}
static void egg_tunnel_init(twodfx_emu *d){
  d->tunnel_mode=2u;d->tunnel_profile=2u;
  d->tunnel_ship=1u;d->tunnel_zoom=1u;
  d->tunnel_auto=0u;d->tunnel_phase=0u;d->tunnel_travel=0u;
}
static void egg_tunnel_step(twodfx_emu *d){
  unsigned speed=d->tunnel_profile==0u?15u:(d->tunnel_profile==1u?25u:34u);
  d->tunnel_travel+=speed;
}
static void egg_tunnel_make_plume(twodfx_emu *d,uint32_t addr,unsigned mesh){
  uint8_t *b=d->ram+addr;
  unsigned i,face=0u;
  /* Independently modelled faceted exhaust shape: two triangular rings behind the
     model, not the RP2354B implementation's animated plume generator. */
  for(i=0u;i<6u;i++){
    double a=(double)(i%3u)*2.0*EGG_PI/3.0;
    double radius=i<3u?12.0:4.0;
    double z=i<3u?-80.0:-175.0;
    egg_tunnel_write_vertex(b+i*6u,radius*cos(a),radius*sin(a),z);
  }
  for(i=0u;i<3u;i++){
    unsigned j=(i+1u)%3u;
    uint8_t *t=b+36u+(face++)*4u;
    t[0]=(uint8_t)i;t[1]=(uint8_t)j;
    t[2]=(uint8_t)(i+3u);t[3]=(uint8_t)(0x80u|(i&1u?3u:6u));
    t=b+36u+(face++)*4u;
    t[0]=(uint8_t)j;t[1]=(uint8_t)(j+3u);
    t[2]=(uint8_t)(i+3u);t[3]=(uint8_t)(0x80u|(i&1u?3u:6u));
  }
  b[36u+face*4u]=0u;b[37u+face*4u]=1u;
  b[38u+face*4u]=2u;b[39u+face*4u]=0x83u;face++;
  b[36u+face*4u]=3u;b[37u+face*4u]=5u;
  b[38u+face*4u]=4u;b[39u+face*4u]=0x86u;face++;
  twodfx_3d_define(&d->scene3d,mesh,addr,6u,face);
}
