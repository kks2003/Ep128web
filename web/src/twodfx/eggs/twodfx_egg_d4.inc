/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* D4 specialized-demo behavioural candidate, using independent C99
 * indexed 3D for observable tunnel/Asp/HUD. This does NOT emulate D4's
 * RP2354B-specific worker or perfectly reproduce original face choices. */
static void egg_build_d4_scene(twodfx_emu *d){
  unsigned slot=0u;
  unsigned rings=d->tunnel_mode%3u==0u?4u:(d->tunnel_mode%3u==1u?8u:12u);
  unsigned spacing=rings==4u?900u:(rings==8u?450u:300u);
  unsigned bank=d->egg_frame&1u;
  unsigned mesh=bank?EGG_D4_OTHER_MESH:EGG_D4_RING_MESH;
  egg_tunnel_build(d,bank?0x641000u:EGG_D4_RING_BASE,
                   mesh,rings,spacing,d->tunnel_travel);
  twodfx_3d_set_projection(&d->scene3d,365u,300u,96u,
                            (uint16_t)(rings==4u?920u:(rings==8u?2070u:2490u)));
  egg_tunnel_camera(d,d->tunnel_travel,d->tunnel_profile);
  egg_3d_clear_scene(d,&slot);
  egg_draw_colour(d,&slot,d->machine==TWODFX_EMU_TVC?15u:4u,0u);
  egg_draw_mesh(d,&slot,d->tunnel_mode<3u?0x7au:0x7bu,
                mesh,0,0,0,0u,0u,0u);
  egg_tunnel_ship(d,&slot,EGG_D4_ASP_MESH,EGG_D4_PLUME_MESH);
  egg_tunnel_hud(d,&slot);
  egg_draw_end(d,&slot);
}
static void egg_activate_d4(twodfx_emu *d){
  if(d->egg_id!=20u || !egg_supported(d,d->egg_id)){egg_stop(d);return;}
  egg_clean_scene(d);
  d->engine=TWODFX_EMU_ENGINE_FORCED;egg_tunnel_init(d);
  (void)egg_3d_store_model(d,0x642000u,EGG_D4_ASP_MESH,&d3_models[D3_ASP]);
  egg_tunnel_make_plume(d,0x643000u,EGG_D4_PLUME_MESH);
  d->egg_frame=0u;egg_build_d4_scene(d);d->egg_pending=0u;
}
static void egg_tick_d4(twodfx_emu *d){
  if(d->egg_id!=20u){egg_stop(d);return;}
  egg_tunnel_controls(d);d->egg_frame++;
  egg_tunnel_step(d);egg_build_d4_scene(d);
}
