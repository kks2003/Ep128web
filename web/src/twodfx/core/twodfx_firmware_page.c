/* SPDX-License-Identifier: MIT
 * Copyright (c) 2026 Károly Vaczkó
 */
/* Public 2dfx v1.1.0 terminal information page -- portable behavioural redraw.
   Artwork bytes are public release data; drawing is independently implemented.
   No code from the RP2354B compositor, blitter, PIO or firmware scene builder. */
#include "twodfx_firmware_page.h"
#include "twodfx_raster.h"
#include "logo_2dfx_asset.h"
#include "firmware_page_font.h"
#include "firmware_page_qr.h"
#include <stddef.h>
#include <string.h>

static const uint8_t *find_glyph(unsigned ch) {
  unsigned i;
  for (i=0;i<FW_PAGE_FONT_GLYPH_COUNT;i++)
    if(fw_page_font_glyphs[i].ch==ch)return fw_page_font_glyphs[i].data;
  return NULL;
}
static void caption(twodfx_raster *r,int x,int y,const char *message,
                    uint8_t white,uint8_t black) {
  unsigned ch;
  for(ch=0;message[ch] && ch<31u;ch++) {
    const uint8_t *glyph=find_glyph((unsigned char)message[ch]);
    unsigned gy,gx;
    for(gy=0;gy<16u;gy++)for(gx=0;gx<16u;gx++) {
      int on=glyph && ((glyph[gy*2u+(gx>>3u)] & (0x80u>>(gx&7u)))!=0);
      twodfx_raster_plot(r,x+(int)(ch*16u+gx),y+(int)gy,on?white:black);
    }
  }
}
static void logo(twodfx_raster *r,int x,int y,uint8_t white,uint8_t red) {
  unsigned ly,lx;
  for(ly=0;ly<LOGO_2DFX_HEIGHT;ly++) for(lx=0;lx<LOGO_2DFX_WIDTH;lx++) {
    uint8_t src=logo_2dfx_data[ly*LOGO_2DFX_BYTES_PER_ROW+(lx>>1u)];
    uint8_t c=(uint8_t)((lx&1u)?(src&15u):(src>>4u));
    if(c==7u)c=white;
    else if(c==1u)c=red;
    twodfx_raster_plot(r,x+(int)lx,y+(int)ly,c);
  }
}
static void qr_panel(twodfx_raster *r,int x,int y,int margin_x,
                     uint8_t white,uint8_t black) {
  unsigned ly,lx;
  int px,py;
  int w=(int)FW_PAGE_QR_WIDTH+2*margin_x;
  int h=(int)FW_PAGE_QR_HEIGHT+4;
  for(py=0;py<h;py++) for(px=0;px<w;px++) {
    /* 4x2 rounded-corner rectangle; the profile's border remains stable. */
    int edge=(py<2 || py>=h-2);
    if(edge && (px<4 || px>=w-4))continue;
    twodfx_raster_plot(r,x+px,y+py,white);
  }
  for(ly=0;ly<FW_PAGE_QR_HEIGHT;ly++) for(lx=0;lx<FW_PAGE_QR_WIDTH;lx++) {
    uint8_t packed=fw_page_qr_data[ly*FW_PAGE_QR_BYTES_PER_ROW+(lx>>1u)];
    uint8_t code=(uint8_t)((lx&1u)?(packed&15u):(packed>>4u));
    twodfx_raster_plot(r,x+margin_x+(int)lx,y+2+(int)ly,
                       code?black:white);
  }
}
void twodfx_firmware_page_render(uint8_t *colour,uint8_t *coverage,
                                 unsigned width,unsigned height,int tvc) {
  twodfx_raster r;
  unsigned ox=tvc?0u:88u, oy=tvc?41u:16u;
  unsigned logo_x=tvc?124u:186u;
  unsigned logo_y=tvc?70u:65u;
  unsigned text_x=tvc?130u:192u;
  unsigned text_y=tvc?71u:46u;
  unsigned qr_x=tvc?493u:553u;
  unsigned qr_y=tvc?55u:39u;
  uint8_t white=tvc?15u:4u,red=3u;
  if(!twodfx_raster_bind(&r,colour,coverage,width,height))return;
  twodfx_raster_clear(&r);
  /* Hardware forces /EXTC on after publication: clear whole image to black. */
  twodfx_raster_fill_rect(&r,0,0,(int)width-1,(int)height-1,0);
  logo(&r,(int)logo_x-(int)ox,(int)logo_y-(int)oy,white,red);
  qr_panel(&r,(int)qr_x-(int)ox,(int)qr_y-(int)oy,tvc?4:8,white,0);
  caption(&r,(int)text_x-(int)ox,(int)text_y-(int)oy,
          "FIRMWARE: V1.1.0",white,0);
  caption(&r,(int)text_x-(int)ox,(int)text_y+22-(int)oy,
          tvc?"MODE: TVC":"MODE: ENTERPRISE",white,0);
}
