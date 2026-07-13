# Acupoints 3D

Interactive atlas of the 14 principal acupuncture meridians and all 361 of
their points, drawn on a 3D human model.

**Live:** https://queued-tassel-p3db.here.now/

**Run locally:** just open `index.html` in a browser (everything is
self-hosted, works offline), or serve the folder:

```
python3 -m http.server 8000
```

**Controls:** drag horizontally to rotate, drag vertically to pan, scroll or
pinch to zoom. Hover a meridian line to highlight it, click a point (small
sphere) for details, click a line for the meridian overview. The legend on
the left also highlights/opens meridians.

**Mobile:** one-finger drag rotates/pans, two-finger pinch zooms, tap
selects. The info panel becomes a bottom sheet under the 3D view and the
legend is hidden (below 760px width).

## How it works

- `assets/human-base.glb` — male human base mesh (CC0, from the
  [Mesh2Motion](https://github.com/scottpetrovic/mesh2motion-app) project),
  embedded as base64 in `assets/model-data.js` so the page works over
  file://. Loaded at runtime, posed from T-pose into anatomical position
  (arms down, palms forward), and baked into a static mesh (`model-utils.js`).
- `data.js` — all 361 points with pinyin names, translations and short
  descriptions, plus authored 3D coordinates. At load time every coordinate
  is snapped to the nearest spot on the actual mesh surface, so points hug
  the body.
- `main.js` — Three.js scene, meridian tubes/points, hover + click
  interaction, info panel.

Point positions are approximate — they follow the correct channel pathways
but are placed on a stylized model, not located by anatomical landmarks.
**Educational reference only; not a guide for treatment.** Content should be
reviewed by a qualified practitioner before serious study use.
