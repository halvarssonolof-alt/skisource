# POLYMORPH — Design Spec
**Date:** 2026-04-13  
**Status:** Approved  

---

## Overview

POLYMORPH is a browser-based PS1-style low-poly motion design tool for creating Instagram/TikTok reels content. Users upload a video, select a visual preset, tweak parameters, and export a stylized low-poly version as WebM/MP4 or GIF. No build step, no backend — pure vanilla HTML/CSS/JS, deployable as a static site to Vercel or Netlify.

---

## File Structure

```
LOWPOLYWEBSITE/
├── index.html            # Shell, CDN imports, layout markup
├── vercel.json           # Rewrite rule for SPA routing
├── css/
│   └── style.css         # All styles, CSS custom properties, scanline/vignette FX
└── js/
    ├── engine.js         # CONFIG object, preset definitions, worker pool manager,
    │                     # frame extraction from video, pipeline orchestration
    ├── worker.js         # Web Worker — full PS1 pipeline per frame
    ├── export.js         # MediaRecorder export, gif.js export, progress, download
    └── ui.js             # DOM interactions, preset cards, tweak panel,
                          # progress workbar, playback panel, status bar
```

---

## Architecture

### Data Flow

1. User drops/uploads video → `engine.js` extracts frames to `ImageData` via hidden `<canvas>`
2. `engine.js` distributes `ImageData` to 4 `worker.js` instances (round-robin)
3. Each worker runs the full PS1 pipeline, posts back `{ frameIndex, triangles[], width, height }`
4. `engine.js` collects results, re-orders by `frameIndex`, stores in `processedFrames[]`
5. `ui.js` reads `processedFrames` and draws the most recently completed frame to the preview canvas in real time
6. `export.js` reads `processedFrames` to encode MP4/WebM or GIF on demand

### Worker Pool

- 4 workers instantiated at startup as `Worker` blobs (Delaunator inlined)
- Round-robin frame distribution: `workers[frameIndex % 4].postMessage(...)`
- Frame pixel data transferred via `Transferable` (zero-copy): send `{ buffer: imageData.data.buffer, width, height }`, transfer `[buffer]`. `ImageData` itself is not Transferable — only its underlying `ArrayBuffer` is.
- Results collected in a `Map<frameIndex, result>`, flushed to `processedFrames[]` in order
- On cancel: all 4 workers terminated via `.terminate()`, partial results kept for export

### CONFIG Object

Single source of truth in `engine.js`. Presets are functions that mutate CONFIG. The worker receives a frozen snapshot of CONFIG alongside each frame's ImageData.

```js
const CONFIG = {
  // Processing
  polygonDensity: 600,
  edgeSensitivity: 70,
  colorDepth: 24,
  affineWarp: 80,
  ditherStrength: 0,
  vertexJitter: 30,

  // FX toggles
  scanlines: true,
  colorBanding: false,
  zFighting: false,
  interlaceFlash: false,
  fogEffect: false,
  subpixelWobble: false,

  // Render style: 'flat' | 'wireframe' | 'gouraud' | 'dither' | 'chunky' | 'vector'
  renderStyle: 'flat',

  // Palette: 'ps1dark' | 'acid' | 'vhswarm' | 'dmggreen' | 'n64' | 'original'
  palette: 'ps1dark',

  // Export
  exportAspect: '9:16',   // '9:16' | 'source'
  targetFPS: 30,
};
```

---

## PS1 Rendering Pipeline (worker.js)

Each frame processed in full inside the worker:

### Step 1 — Sobel Edge Detection
Convert `ImageData` to grayscale float array. Apply 3×3 Sobel kernels (Gx, Gy) at each pixel. Compute gradient magnitude `sqrt(Gx² + Gy²)`. Output: `edgeMap[]` float array, same dimensions as frame.

### Step 2 — Point Sampling
Generate `polygonDensity` total points. Split by `edgeSensitivity` (0–100):
- `edgeSensitivity`% of points: weighted-random placement biased toward high-magnitude pixels in `edgeMap`
- Remainder: uniform random placement across the frame

### Step 3 — Delaunay Triangulation
Pass point array to Delaunator (inlined in worker). Output: flat `triangles` index array.

### Step 4 — Color Sampling
For each triangle:
1. Compute centroid `(cx, cy)` AND each vertex position `(x0,y0)`, `(x1,y1)`, `(x2,y2)`
2. Sample original pixel data at the centroid and at each vertex → 4 raw RGB values
3. If palette is not `'original'`: snap each sampled color to nearest palette color via Euclidean RGB distance
4. Output: `{ verts: [x0,y0, x1,y1, x2,y2], colors: ['#rrggbb', '#rrggbb', '#rrggbb'] }` — 3 vertex colors always returned. Flat/most render styles use `colors[0]` (centroid snap); Gouraud uses all 3.

### Step 5 — PS1 Effects (conditional on CONFIG flags)
- **Affine Warp** — `vertex += sin(frameIndex * 0.1 + vertexIndex) * affineWarp * scale`
- **Vertex Jitter** — `vertex += (Math.random() - 0.5) * vertexJitter * scale`
- **Color Quantization** — `channel = Math.round(channel / step) * step` where `step = 256 / colorDepth`
- **Dithering** — 4×4 Bayer matrix threshold over flat fill color per triangle centroid
- **Z-Fighting** — randomly swap colors of 2 triangle pairs in output
- **Fog Effect** — lerp triangle color toward `#0a0a14` based on centroid Y (higher Y = closer to bottom = more fog); fog strength = `(cy / frameHeight) * 0.6`
- **Color Banding** — posterize color channels to 3 steps: `Math.floor(channel / 85) * 85` — produces hard tonal bands like early 3D hardware
- **Sub-pixel Wobble** — add sub-pixel sinusoidal offset to all vertex X positions: `x += sin(frameIndex * 0.3) * 0.5` — creates the characteristic PS1 sub-pixel jitter
- **Interlace Flash** — on odd frames only: set `globalAlpha = 0.6` for even-indexed triangles before drawing, simulating interlaced scanline flicker

### Step 6 — Return Payload
```js
self.postMessage({ frameIndex, triangles: [...], width, height });
```

### Render Styles (main thread drawing, ui.js)
All styles receive identical triangle data; only draw calls differ:
- **PS1 Flat** — `ctx.fillStyle = color; beginPath; moveTo/lineTo/lineTo; fill()`
- **Wireframe** — `ctx.strokeStyle = color; lineWidth = 0.5; stroke()`
- **Gouraud** — draw triangle 3 times with `createLinearGradient` between each pair of vertex colors (`colors[0]`, `colors[1]`, `colors[2]`) using `globalAlpha = 0.5` blending — canvas approximation of vertex color interpolation
- **Dither** — flat fill + Bayer matrix pattern overlay drawn as 1px rect grid at centroid
- **Chunky** — draw frame to a `(outputW/8) × (outputH/8)` offscreen canvas first, then `ctx.imageSmoothingEnabled = false` + `drawImage` scaled back up to full output size — produces authentic 8×8 pixel-block look
- **Vector** — flat fill + 0.5px stroke outline on same path

---

## Preset Definitions

| Preset | Density | Edge Sens | Color Depth | Affine Warp | Jitter | Palette | Special |
|--------|---------|-----------|-------------|-------------|--------|---------|---------|
| PURE PS1 | 600 | 70 | 24 | 80 | 30 | ps1dark | scanlines on |
| DREAMCAST | 900 | 60 | 48 | 20 | 10 | ps1dark | gouraud render |
| ACID RAVE | 400 | 50 | 32 | 0 | 0 | acid | heavy dither |
| VAPORWAVE | 1200 | 80 | 64 | 10 | 5 | vhswarm | vector render, color banding |
| GAMEBOY | 300 | 40 | 4 | 0 | 0 | dmggreen | chunky render |
| GLITCH CORE | 800 | 65 | 32 | 40 | 80 | ps1dark | z-fighting, interlace flash |

---

## Preset Card UI

- Grid: 2×3, each card ~160×120px
- Top 60px: animated canvas showing geometric shapes in preset's palette (CSS/canvas decorative — no video processing)
- Bottom 60px: name in Orbitron + 1-line description in Share Tech Mono
- Selected: teal border + `box-shadow: 0 0 12px #00e5cc`
- Hover: `transform: scale(1.03)` + border brightens to `#00e5cc`

---

## Tweak Panel

Collapsible section below preset grid. Collapsed by default, expands on click.

**Sliders:**
- Polygon Density: 100–3000 (debounced 300ms)
- Edge Sensitivity: 0–100
- Color Depth: 4–256
- Affine Warp: 0–100
- Dither Strength: 0–100
- Vertex Jitter: 0–100

**FX Toggles (pill buttons, on/off):**
CRT Scanlines, Color Banding, Z-Fighting, Interlace Flash, Fog Effect, Sub-pixel Wobble

**Render Style (radio):**
PS1 Flat, Wireframe, Gouraud, Dither, Chunky, Vector

**Color Palette (radio):**
PS1 Dark, Acid, VHS Warm, DMG Green, N64, Original

---

## Color Palettes

| Name | Colors |
|------|--------|
| PS1 Dark | `#00e5cc` `#9b4dff` `#ff2d78` `#0a0a14` `#1e1e3a` `#c8c8e8` |
| Acid | `#39ff14` `#ff00ff` `#ffff00` `#000000` `#111111` `#ffffff` |
| VHS Warm | `#ff6b35` `#f7c59f` `#efefd0` `#004e89` `#1a2752` `#ffeedd` |
| DMG Green | `#0f380f` `#306230` `#8bac0f` `#9bbc0f` `#c4cfa1` `#e0f0d0` |
| N64 | `#e40303` `#0050f0` `#00d800` `#ffffff` `#ff9900` `#000000` |
| Original | (source video colors, no palette mapping) |

---

## PS1 Progress Workbar

Shown during processing, overlaid on the drop zone / preview area:

```
PROCESSING FRAME 024 / 180 ████████░░░░░░░░░░░░ 13%
EST. REMAINING: 00:42   [■ CANCEL]
WORKER POOL: ■■■■ (4 active)
```

- Font: Share Tech Mono, color: `#00e5cc`
- Progress fill: `█` characters, empty: `░` characters
- Worker pool indicator: 4 squares, each pulses/flashes when that worker posts a result
- Updates on every completed frame (not batched)
- On cancel: workers terminated, partial frames kept, export still available

`ui.js` exposes `setProgress(label, pct, sublabel)` — called by both engine.js (processing) and export.js (encoding).

---

## Export Pipeline

### MP4/WebM Export
1. Create output canvas at target resolution (1080×1920 for 9:16, or source aspect ratio)
2. `canvas.captureStream(fps)` → `MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 8_000_000 })`
3. Playback loop draws each `processedFrames[]` entry at correct interval, MediaRecorder records
4. On stop: chunks assembled into Blob → auto-download as `polymorph-export.webm`
5. Progress: PS1 workbar "ENCODING FRAME X / Y"
6. Pre-export size estimate: `(frames / fps) * bitrate / 8` displayed as "~42 MB"

### GIF Export
1. Frames downsampled to 480px wide, skipped to hit 15fps target
2. Each frame redrawn to small offscreen canvas, added via `gif.addFrame(canvas, { delay })`
3. gif.js internal worker handles encoding; progress callback drives PS1 workbar
4. On finish: Blob auto-downloaded as `polymorph-export.gif`
5. Pre-export size estimate: rough heuristic based on frame count × palette complexity

---

## Visual Design

**Typography:** Orbitron (headings) + Share Tech Mono (body/labels) — Google Fonts CDN

**Color tokens (CSS custom properties):**
```css
--bg:        #0a0a14
--panel:     #0f0f1e
--border:    #1e1e3a
--teal:      #00e5cc
--purple:    #9b4dff
--pink:      #ff2d78
--text:      #c8c8e8
```

**UI FX:**
- Repeating scanline overlay: `body::after`, 2px repeating-linear-gradient, 5% opacity, pointer-events none
- CRT vignette: radial-gradient darkening edges on body background
- Animated triangulated polygon background: fixed `<canvas>` z-index -1, subtle Delaunay mesh drifting at low opacity via requestAnimationFrame
- Panel headings: 2px gradient top border (`var(--teal)` → `var(--purple)`)
- Buttons: transparent bg, 1px teal border, hover fills teal, text black on hover
- Active/selected glow: `box-shadow: 0 0 12px currentColor`

**Layout:**
- Max-width 1100px, centered, padding 24px
- Header: POLYMORPH title + subtitle + STATUS badge (READY / PROCESSING / EXPORT READY)
- Main: preset grid (left 45%) + video drop/output (right 55%)
- Below main: tweak panel (collapsible) + export panel
- Mobile (<768px): single column stack

---

## Performance Strategy

- Frame extraction: downscale to max 640px wide via hidden canvas before sending to workers
- Workers receive `ImageData` via `Transferable` (zero-copy)
- Output canvas renders at full resolution separately from processing resolution
- Slider inputs debounced 300ms
- Background animation canvas throttled to 30fps
- 30-second 1080p video (~900 frames at 30fps) estimated processing: ~45–90 seconds on 4-core machine

---

## CDN Dependencies

```html
<!-- Delaunator (inlined into worker blob) -->
https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js

<!-- gif.js -->
https://cdn.jsdelivr.net/npm/gif.js/dist/gif.js

<!-- Google Fonts -->
https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap
```

---

## Error Handling

- Video decode failure → clear error message in drop zone, STATUS: ERROR
- Worker crash → catch `worker.onerror`, log + surface to user, offer retry
- MediaRecorder unsupported → fallback message with browser recommendation
- gif.js failure → catch and surface error, partial download not attempted

---

## vercel.json

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

---

## Running Locally

```bash
npx serve .
# → http://localhost:3000
```

## Deploying to Vercel

```bash
npx vercel
# Follow prompts — static site, no build command needed
```
