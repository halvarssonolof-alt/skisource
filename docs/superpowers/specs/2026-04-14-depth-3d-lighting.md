# POLYMORPH — Depth-Based 3D Lighting & Mesh Stability
**Date:** 2026-04-14  
**Status:** Approved

---

## Goal

Make POLYMORPH output look like an actual PS1-era 3D rendering — flat-shaded polygons lit by a directional light — rather than a 2D stylization filter applied to video. Two mechanisms achieve this:

1. **Depth estimation** — infer per-pixel depth from each video frame using Depth Anything V2 Small (via HF Inference API), use depth to compute per-triangle surface normals, apply Lambertian flat-shading.
2. **Temporal mesh coherence** — triangulate once per "mesh keyframe", reuse the same vertex positions for subsequent frames (only resample colors). Eliminates per-frame polygon jitter.

---

## Architecture

### New Files

**`netlify/functions/depth.js`**  
Netlify serverless function. Receives a base64-encoded PNG frame, calls the Hugging Face Inference API (`depth-anything/Depth-Anything-V2-Small-hf`), returns a base64-encoded depth map PNG. Acts as a proxy so the HF API key stays server-side.

**`netlify.toml`**  
```toml
[functions]
  directory = "netlify/functions"
```

**`js/depth.js`**  
Frontend depth module. Exports `getDepthMap(frameCanvas)`:
- Scales frame down to 320px wide before sending (speed)
- POSTs base64 PNG to `/api/depth`
- Decodes response into a grayscale `Uint8Array` via offscreen canvas
- Caches results by frame index
- Fetches depth every `depthKeyframeInterval` frames (default: 3); adjacent frames reuse nearest cached depth

---

### Modified Files

**`js/worker.js`**  
- Accepts optional `depthData` (Uint8Array, same WxH as frame) alongside existing `pixelData`
- New `computeNormalLighting(verts, depthData, width, lightDir, depthScale)`:
  - Sample depth at each of 3 triangle vertices: `d = depthData[(y * width + x) * 4]` (red channel, 0–255, normalized to 0–1)
  - Construct 3D points: `p = [x, y, d * depthScale]`
  - Edge vectors: `v1 = p1 - p0`, `v2 = p2 - p0`
  - Face normal: `n = normalize(cross(v1, v2))`
  - Brightness: `b = clamp(dot(n, lightDir), 0.15, 1.0)`
- Multiply triangle's flat color RGB channels by `b` before posting result
- When `depthData` is null (depth disabled), skip lighting — existing behavior preserved

**`js/engine.js`**  
- New `CONFIG` fields: `depthLighting: false`, `lightAngle: 315`, `depthStrength: 40`, `meshStability: 15`, `depthKeyframeInterval: 3`
- **Mesh keyframe logic**: maintain `meshKeyframeCache: Map<keyframeIndex, {points, triangles}>`. Frame `i` uses keyframe `Math.floor(i / meshStability)`. On a keyframe frame, run full Sobel + sampling + Delaunator. On non-keyframe frames, reuse cached vertex positions — only resample colors.
- **Depth fetch**: before dispatching a frame's worker job, call `depth.js → getDepthMap()` if `depthLighting` is enabled. Attach `depthData` to the worker message.
- Compute `lightDir` from `lightAngle`: `[cos(θ) * 0.7, sin(θ) * 0.7, 1.0]`, normalized. Passes `lightDir` and `depthStrength` to worker.

**`js/ui.js`**  
- `drawFrame()` unchanged — workers return triangles with colors already shaded
- Bind 4 new controls: DEPTH LIGHTING toggle, LIGHT ANGLE slider, DEPTH STRENGTH slider, MESH STABILITY slider

**`index.html`**  
- `<script src="js/depth.js">` before engine.js
- New control group `// 3D DEPTH` in left panel:
  - DEPTH LIGHTING toggle
  - LIGHT ANGLE (0–360, default 315)
  - DEPTH STRENGTH (0–100, default 40)
  - MESH STABILITY (1–60 frames, default 15)

---

## Data Flow

```
Video frame extracted
  │
  ├─ Is this a mesh keyframe? (frameIndex % meshStability === 0)
  │   ├─ YES: run Sobel + point sample + Delaunator → cache mesh
  │   └─ NO:  load cached mesh (vertex positions only)
  │
  ├─ Is depthLighting enabled?
  │   ├─ YES: getDepthMap(frame) → /api/depth → HF API → depth PNG → Uint8Array
  │   └─ NO:  depthData = null
  │
  └─ postMessage to worker:
       { pixelData, meshVertices, triangleIndices, depthData, lightDir, depthStrength, ... }
       transfer: [pixelBuffer, depthBuffer]

Worker:
  1. Resample colors at triangle centroids/vertices from pixelData
  2. If depthData: compute normal → brightness → multiply color
  3. Apply existing FX pipeline (palette snap, banding, fog, dither)
  4. postMessage({ frameIndex, triangles })

UI draws triangles (unchanged)
```

---

## Lighting Math (worker.js)

```js
function computeBrightness(verts, depthData, width, lightDir, depthScale) {
  // verts: [x0,y0, x1,y1, x2,y2]
  const sample = (x, y) => depthData[(Math.round(y) * width + Math.round(x)) * 4] / 255;
  const d0 = sample(verts[0], verts[1]);
  const d1 = sample(verts[2], verts[3]);
  const d2 = sample(verts[4], verts[5]);
  const p0 = [verts[0], verts[1], d0 * depthScale];
  const p1 = [verts[2], verts[3], d1 * depthScale];
  const p2 = [verts[4], verts[5], d2 * depthScale];
  const v1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
  const v2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
  const n = normalize(cross(v1, v2));
  return Math.max(0.15, Math.min(1.0, dot(n, lightDir)));
}
```

`depthScale` maps normalized depth (0–1) to scene units. At `depthStrength=40`, `depthScale = 40`.

---

## New CONFIG Defaults

```js
depthLighting:         false,   // off by default — opt-in
lightAngle:            315,     // degrees, top-left
depthStrength:         40,      // Z scale for normal computation
meshStability:         15,      // frames between re-triangulations
depthKeyframeInterval: 3,       // frames between depth fetches
```

---

## Environment

The HF API key is stored as a Netlify environment variable `HF_API_KEY`. The Netlify function reads `process.env.HF_API_KEY`. Never exposed to the frontend.

---

## Error Handling

- If the HF API call fails (rate limit, network error): log warning, set `depthData = null` for that frame — falls back to unlit rendering gracefully.
- If mesh cache miss (shouldn't happen): fall back to full re-triangulation for that frame.

---

## Out of Scope

- Optical flow mesh warping
- Per-vertex (Gouraud) depth shading — flat normal per triangle only
- Real-time preview with depth (depth only applies during full processing run)
