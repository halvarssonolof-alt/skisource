# POLYMORPH — Project Context for Claude

## What This Is

**POLYMORPH** is a production-ready vanilla HTML/CSS/JS web app that converts video into PS1-style low-poly animation. No build step. Deployable to Vercel as a static site.

**User goal:** Drop a video → process frames through a Delaunay triangulation pipeline with PS1 effects → tweak sliders → export as MP4/WebM or GIF for Instagram/TikTok reels.

**Reference aesthetic:** The target look is flat-shaded Delaunay triangles that are still _legible_ — objects and people are recognizable despite heavy stylization. Like a PS1-era 3D game but applied to real video footage. No generative AI needed — the Delaunay triangulation approach achieves this natively.

---

## File Structure

```
LOWPOLYWEBSITE/
├── index.html              # Full UI — left panel (controls) + right panel (video/output)
├── css/style.css           # PS1 aesthetic — dark bg, teal/purple/pink accents, CRT scanlines
├── js/engine.js            # CONFIG, PRESETS, worker pool, frame extraction, orchestration
├── js/worker.js            # Per-frame pipeline: Sobel → point sampling → Delaunator → color → FX
├── js/export.js            # MP4/WebM via MediaRecorder, GIF via gif.js
├── js/ui.js                # All DOM: drawFrame(), drop zone, sliders, playback, presets
├── vercel.json             # {"rewrites":[{"source":"/(.*)", "destination":"/index.html"}]}
├── docs/superpowers/specs/2026-04-13-polymorph-design.md
└── docs/superpowers/plans/2026-04-13-polymorph.md
```

---

## Architecture

### Worker Pipeline (js/worker.js)
Each frame is processed in a dedicated Web Worker (pool of 4, round-robin):

1. **Sobel edge detection** — grayscale + 3x3 kernel → edge strength map
2. **Point sampling** — `edgeSensitivity`% of points placed on high-edge pixels, rest random; corners always included
3. **Delaunay triangulation** — via `Delaunator` CDN library
4. **Color sampling** — centroid + 3 vertex colors sampled from original pixels
5. **FX pipeline** — palette snap → quantization → color banding → fog → dither
6. **Affine warp + vertex jitter + sub-pixel wobble** — applied to vertex positions

Worker posts back: `{ frameIndex, triangles[], width, height }`  
Each triangle: `{ verts:[x0,y0,x1,y1,x2,y2], colors:[centroid,v0,v1,v2], interlaceDim:bool }`

**Critical:** Workers are isolated — PALETTES is duplicated in worker.js (can't access main thread globals). Only `ArrayBuffer` is transferable (not `ImageData`). Engine sends `id.data.buffer.slice(0)` with `[f.buffer]` transfer.

### Frame Extraction (js/engine.js)
- Video downscaled to max 640px wide for processing (output renders at source resolution)
- Seeks `video.currentTime` frame by frame — slow but universal
- In-order reassembly via `Map<frameIndex, result>` that flushes sequentially

### Rendering (js/ui.js → drawFrame)
6 render styles:
- **flat** — `fillStyle = colors[0]` (centroid color)
- **wireframe** — `strokeStyle`, lineWidth 0.5
- **gouraud** — `createLinearGradient(v0→v2)` with 3 color stops
- **dither** — flat fill + Bayer 4x4 matrix darkening overlay
- **chunky** — renders to 1/8 size offscreen canvas, scales up with `imageSmoothingEnabled=false`
- **vector** — flat fill + matching stroke (crisp edges)

### Global API Surface
- `window.ENGINE` — `{ CONFIG, PALETTES, processedFrames, isProcessing, applyPreset, startProcessing, cancelProcessing }`
- `window.EXPORT` — `{ exportMP4, exportGIF }`
- `window.setStatus`, `window.showError`, `window.setProgress`, `window.hideProgress`, `window.drawFrame`, `window.drawFrameToCanvas`

---

## CONFIG Defaults

```js
{
  polygonDensity:  600,    // higher = more legible, slower
  edgeSensitivity: 70,    // % of points placed on edges
  colorDepth:      24,    // color quantization steps
  affineWarp:      80,    // PS1 texture warp intensity
  ditherStrength:  0,
  vertexJitter:    30,
  scanlines:       true,
  colorBanding:    false,
  zFighting:       false,
  interlaceFlash:  false,
  fogEffect:       false,
  subpixelWobble:  false,
  renderStyle:     'flat',
  palette:         'ps1dark',
  exportAspect:    '9:16',
  targetFPS:       30,
}
```

**For legible PS1 output (like the reference image):** density 1200+, edgeSensitivity 80-90, affineWarp 20-30, jitter 10-15, renderStyle flat, palette ps1dark or original.

---

## Palettes

| ID | Colors |
|----|--------|
| ps1dark | teal, purple, pink, near-black, dark navy, light lavender |
| acid | neon green, magenta, yellow, black, dark, white |
| vhswarm | orange, peach, cream, blue, dark blue, warm white |
| dmggreen | 4-shade Game Boy green scale |
| n64 | red, blue, green, white, orange, black |
| original | no palette snap — raw video colors |

---

## Presets

| Preset | Key Settings |
|--------|-------------|
| pure-ps1 | density 600, flat, affineWarp 80, jitter 30, ps1dark |
| dreamcast | density 900, gouraud, affineWarp 20, jitter 10 |
| acid-rave | density 400, dither 80, acid palette |
| vaporwave | density 1200, vector, colorBanding, vhswarm |
| gameboy | density 300, chunky, colorDepth 4, dmggreen |
| glitch-core | density 800, zFighting+interlaceFlash, jitter 80 |

---

## Running Locally

```bash
npx serve .
# open http://localhost:3000
```

No build step needed. CDN dependencies: Delaunator, gif.js, Google Fonts (Orbitron + Share Tech Mono).

## Deploying

Push to GitHub → connect to Vercel → auto-deploys. `vercel.json` handles SPA routing.

---

## Known Issues / Past Bugs Fixed

1. **window.setStatus/showError** — must be exposed on `window` in ui.js for engine.js to call at runtime
2. **ImageData not Transferable** — use `id.data.buffer.slice(0)` + `[f.buffer]` transfer array
3. **PALETTES duplicated in worker.js** — workers are isolated from main thread globals
4. **In-order frame assembly** — use `Map<frameIndex>` and flush sequentially, not as they arrive
5. **Gouraud needs 4 colors** — `colors[0]` = centroid (for flat/dither), `[1..3]` = vertices

---

## What the User Wants

- Legible low-poly output from everyday footage (person typing, daily life)
- PS1-era flat-shaded polygon aesthetic — like the reference (3D PS1 scene with flat-shaded polygons)
- No generative AI — pure Delaunay triangulation is sufficient
- Export as vertical video (9:16) for Instagram/TikTok reels
- Keep it functional and barebones — no decorative elements or animated thumbnails
