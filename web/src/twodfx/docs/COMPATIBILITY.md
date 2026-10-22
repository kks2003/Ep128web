# Compatibility and verification scope

The real **2dfx v1.1.0 firmware is hardware validated**. The portable module independently reproduces its public interfaces but has **not been certified pixel-for-pixel or event-for-event** against complete hardware captures.

| Functional area | Portable implementation / qualification |
|---|---|
| F8/F9 parser, sessions, 8 MiB uploads, RAW/NICK/TVC conversion, ZX1, resources | Implemented and exercised by synthetic unit tests; physical bus timing edge cases require hardware comparison |
| 2DPT BG/FG, frame-latched camera and scene, sprites, collisions, raster IRQ | Logical implementations and regression coverage; host IRQ/video wiring to be verified in real Enterprise/TVC VMs |
| 2D primitives, fonts, bitmaps, patterns, tilemaps, fill and clipping | Implemented; isolated pixel and boundary differences are possible |
| 3D mesh API, 10-bit rotations, culling/projection | Implemented; final clipping/visibility/ordering precision versus physical render may differ |
| SHOW_FW and original 2dfx logo | Included; physical screenshot comparison still useful |
| Eggs C0–CF, D0–D2 and DF | Runtime candidate for each command ID; some frame choreography, effects and edge pixels approximate |
| Egg D3 | Authentic Elite-derived demo ship geometry retained; generic rendering and choreography are approximate |
| Egg D4 | Specialized curved-tunnel/Asp visual behavior approximated with an independently implemented renderer, six modes and F9 controls |
| Egg D5 | Public mesh tunnel and Asp showcase, multi-ring modes and alternating resource banks; exact scene and plume behavior remain approximations |
| Snapshots | Format v13, exact-size/CRC/invariant verification; incompatible with older formats |
| TVC256+++ | Existing VM feature is outside this module; preserve its separate implementation during integration |
| RP2354B render-time/overrun | Intentionally NOT modeled. Device overrun duration cannot be inferred from portable host speed |

All 23 Easter egg IDs are present in source; **23 implemented IDs is not the same as 23 physically verified demos**.

The C9 Wriggler sprite captures and Elite ship models are included **unchanged** to preserve the original firmware showcase appearance. They are third-party-derived material **outside this project's MIT grant** and may be removed without advance notice; see `ASSET_LICENSES.md`.

The supplied C++ adapter is a thin buildable connector **not a patched or validated ep128emu branch**. Zoltán Balogh and Károly Kiss can independently wire the same host ABI; physical waveform/image tests and regression of existing TVC256+++ behavior are integration-stage tasks.
