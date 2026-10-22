# Asset licensing and provenance

Copyright © 2026 Károly Vaczkó for the original 2dfx graphics and artwork. The **MIT License** in `LICENSE` applies to the independent portable software and 2dfx-owned material only.

## Third-party material used in built-in firmware demonstrations

Certain built-in 2dfx Easter eggs/showcases reproduce recognizable material from older games. This material is **included solely to reproduce the original 2dfx firmware demos and showcase experience**. Copyright or other rights may be held by the original authors, publishers or their successors. Such material **is not licensed under the 2dfx MIT grant**, and no permission from the respective rights holders is represented or implied.

| Showcase | Embedded data | Original work and attribution |
|---|---|---|
| C9 — animated worm | `src/assets/eggs/egg_C9_wriggler_assets.h`: screenshot-derived animation frames | *Wriggler* (ZX Spectrum, 1985), credited to Devonshire House / Romantic Robot. See https://worldofspectrum.net/item/0005761/ |
| D3/D4/D5 — spacecraft | `src/assets/eggs/egg_D3_elite_showcase_data.h`: Elite-derived ship vertices, faces and edges | *Elite* (1984), created by Ian Bell and David Braben; BBC Micro edition published by Acornsoft. Mark Moxon's annotated reconstruction/source is acknowledged as a reference, not as a redistribution license: https://elite.bbcelite.com/about_site/acknowledgements.html and https://github.com/markmoxon/elite-source-code-bbc-micro-disc |

**Removal and change of demo material:** The third-party-derived artwork and ship data are optional showcase content, not necessary to the general 2dfx protocol. They may be modified, replaced or **removed from future distribution packages at any time, without prior notice**, including following a request from an author, publisher or other rights holder. Such changes may affect the corresponding Easter egg's visual fidelity.

This notice and a commitment to remove content upon request **do not grant redistribution permission**. Recipients wishing to publish, mirror or sublicense a package containing the above assets should separately evaluate and secure any necessary rights. The MIT license must not be interpreted as applying to these third-party elements.

## Other material

- Original 2dfx public logo, original SHOW_FW graphics and font artwork (to the extent rights are owned by Károly Vaczkó), and independently developed engine/game graphics are provided under MIT.
- The ZX1 compressed-data *format* is credited to Einar Saukas; no license to third-party ZX1 implementation code is conveyed.
- The original **private RP2354B firmware source**, its hardware-specific PIO/DMA, multicore scheduling and optimized render paths are not included or relicensed.
- ep128emu source code and VM modifications retain their separate upstream licensing, including applicable GPL terms.

Use of third-party game titles and company names here is for attribution only, not endorsement.
