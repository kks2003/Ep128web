/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* Portable D3 3D showcase: cycles through original spaceship meshes.
 * Behaviourally faithful to the idea of the demo, not MCU implementation.
 */
static void egg_build_d3_scene(twodfx_emu *d){
  const d3_model_t *m;
  unsigned slot=0u;
  unsigned phase=(unsigned)((d->egg_frame / D3_PHASE_TICKS) % D3_MODEL_COUNT);
  unsigned local=(unsigned)(d->egg_frame % D3_PHASE_TICKS);
  unsigned roll=(unsigned)((d->egg_frame*3u)&1023u);
  unsigned yaw=(unsigned)((d->egg_frame*5u + phase*83u)&1023u);
  unsigned pitch=(unsigned)((d->egg_frame*2u + phase*47u)&1023u);
  uint8_t op;
  m=&d3_models[phase];
  egg_3d_clear_scene(d,&slot);
  twodfx_3d_set_projection(&d->scene3d,(uint16_t)m->scale_x,(uint16_t)m->scale_y,80u,4096u);
  { uint8_t cam[10]={0}; twodfx_3d_set_camera(&d->scene3d,cam); }
  egg_draw_colour(d,&slot,15u,0u);
  op=(local < D3_PHASE_TICKS/3u) ? 0x7au : (local < (2u*D3_PHASE_TICKS)/3u ? 0x7cu : 0x7bu);
  egg_draw_mesh(d,&slot,op,EGG_D3_FIRST_MESH+phase,
                egg_wave((unsigned)(d->egg_frame*3u),18.0),
                (int16_t)m->centre_y_offset,
                m->camera,roll,yaw,pitch);
  egg_draw_end(d,&slot);
}
static void egg_activate_d3(twodfx_emu *d){
  if(d->egg_id!=19u || !egg_supported(d,d->egg_id)){ egg_stop(d); return; }
  egg_clean_scene(d);
  d->engine=TWODFX_EMU_ENGINE_FORCED;
  egg_3d_load_showcase_models(d);
  d->egg_frame=0u;
  egg_build_d3_scene(d);
  d->egg_pending=0u;
}
static void egg_tick_d3(twodfx_emu *d){
  if(d->egg_id!=19u){ egg_stop(d); return; }
  d->egg_frame++;
  egg_build_d3_scene(d);
}
