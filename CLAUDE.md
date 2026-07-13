# Acupoints 3D — agent notes

Static site, no build step, no dependencies to install. Plain classic scripts
(`<script src>`), **not ES modules** — this is deliberate so the site works
when opened via `file://` (module imports and fetch are CORS-blocked there).
Keep it that way.

## Files

- `index.html` — layout + script tags (order matters: three → GLTFLoader →
  model-data → model-utils → data → main).
- `style.css` — dark theme; mobile layout in a `@media (max-width: 760px)`
  block (panel becomes a bottom sheet, legend hidden).
- `data.js` — defines global `MERIDIANS`: 14 meridians, all 361 points.
- `model-utils.js` — defines global `AcuModel` (pose/bake/snap). Also
  loadable from Node via `module.exports` for headless testing.
- `main.js` — scene, interaction, panel/legend/tooltip UI.
- `assets/three.min.js`, `assets/GLTFLoader.js` — three.js **r147**, pinned:
  it's the last release with UMD builds and `examples/js` loaders.
- `assets/human-base.glb` — male human base mesh (CC0, Mesh2Motion project),
  T-pose, 1.83 m, feet at y=0, faces +Z, UE-style bone names (`upperarm_l`).
- `assets/model-data.js` — the GLB base64-embedded as `MODEL_GLB_BASE64`
  (main.js decodes it and uses `GLTFLoader.parse`, again for file://).
  **Regenerate this file whenever the GLB changes** (see README history or:
  read GLB, `toString("base64")`, wrap in `const MODEL_GLB_BASE64 = "..."`).

## Coordinate system / data schema

y up, feet at y=0, head top ~1.80, +Z out of the chest. Bilateral meridians
are authored on the +x side and mirrored automatically. A meridian has
`path` (one polyline) or `branches` (array of polylines — used by ST and
BL). Entries are named points `{code, name, en, pos, desc}` or bare
waypoints `{pos}`. Coordinates only need to be *near* the right spot on the
right side of the body: at load time every position is snapped to the
nearest mesh surface point and lifted 6 mm along the normal.

## Model pipeline (model-utils.js)

`AcuModel.prepare(gltfScene, material)` = pose → bake → snapper.

- `pose`: rotates each arm so the wrist hits `WRIST_TARGET` (x 0.32, y 0.90)
  and auto-twists the forearm until the thumb points laterally (palms
  forward). Bone lookup supports Mixamo (`mixamorigLeftArm`) and UE
  (`upperarm_l`) names.
- `bake`: applies the skeleton pose into static world-space geometry.
  **r147 quirk:** `SkinnedMesh.boneTransform(i, target)` requires `target`
  to be pre-loaded with the raw vertex position by the caller.
- `createSnapper`: brute-force closest-point-on-triangle with a
  centroid-radius early-out; ~700 queries over ~15k triangles in <50 ms.

## Headless testing (no browser needed)

three r147 UMD loads in Node via `require`. Recipe used throughout:

```js
global.THREE = require("./assets/three.min.js");
global.self = global;
THREE.ImageLoader.prototype.load = (url, onLoad) => { onLoad({width:2,height:2}); return {}; };
URL.createObjectURL ||= () => "blob:fake";
require("./assets/GLTFLoader.js");            // attaches THREE.GLTFLoader
const AcuModel = require("./model-utils.js");
const MERIDIANS = eval(fs.readFileSync("data.js","utf8") + ";MERIDIANS");
new THREE.GLTFLoader().parse(arrayBuffer, "", gltf => { ... });
```

Useful checks after changing data or model: snap every position (mirrored)
and report mean/max distance and misses (>0.15 = probably wrong side or
region); ASCII-render the baked mesh by splatting sampled triangle points to
a character grid to eyeball the pose. `node --check` each edited file.

## Gotchas

- The zoom clamp `Math.max(0.5, Math.min(5, ...))` exists **twice** in
  main.js (wheel handler and pinch handler) — change both.
- Hover x-ray was deliberately removed: highlighted meridians must respect
  depth (user request). Don't set `depthTest = false` on highlight.
- Interaction uses pointer events with a `pointers` Map: 1 pointer =
  rotate/pan, 2 = pinch, short press = select. Canvas has
  `touch-action: none`.
- Point descriptions are educational TCM content; keep the "not a guide for
  treatment" disclaimer intact.

## Publishing

Deployed on here.now (authenticated, permanent), slug `queued-tassel-p3db`:

```
/Users/martin/.claude/skills/here-now/scripts/publish.sh . --slug queued-tassel-p3db --client claude-code
```
