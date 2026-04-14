# Depth-Based 3D Lighting & Mesh Stability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make POLYMORPH output look like actual PS1 3D rendering by adding depth-estimated lighting per triangle and mesh temporal coherence so polygons don't re-triangulate every frame.

**Architecture:** A Netlify serverless function proxies each keyframe to the HF Inference API (Depth Anything V2 Small) returning a depth map. `js/depth.js` caches depth maps by keyframe interval. In `js/worker.js`, a new `recolor` mode reuses cached vertex positions from keyframes instead of re-running Sobel + Delaunator, and optionally applies Lambertian brightness from depth-derived triangle normals. `js/engine.js` dispatches keyframes first, waits for their mesh results, then dispatches recolor frames with cached geometry.

**Tech Stack:** Netlify Functions (Node 18, native fetch), HF Inference API, vanilla JS Web Workers, Delaunator CDN

---

### Task 1: Netlify config

**Files:**
- Create: `netlify.toml`

- [ ] **Step 1: Create netlify.toml**

```toml
[functions]
  directory = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

- [ ] **Step 2: Verify directory structure exists**

Run: `ls netlify/` — if missing, create it: `mkdir -p netlify/functions`

- [ ] **Step 3: Commit**

```bash
git add netlify.toml
git commit -m "feat: add netlify.toml for serverless functions"
```

---

### Task 2: Netlify depth proxy function

**Files:**
- Create: `netlify/functions/depth.js`

This function receives a base64 PNG frame, calls HF Inference API, returns base64 depth PNG. The HF API key is read from `process.env.HF_API_KEY` (set in Netlify dashboard under Site Settings → Environment Variables).

- [ ] **Step 1: Create the function file**

```js
// netlify/functions/depth.js
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let imageBase64;
  try {
    ({ imageBase64 } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const imageBuffer = Buffer.from(imageBase64, 'base64');

  let depthResponse;
  try {
    depthResponse = await fetch(
      'https://api-inference.huggingface.co/models/depth-anything/Depth-Anything-V2-Small-hf',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.HF_API_KEY}`,
          'Content-Type': 'application/octet-stream',
        },
        body: imageBuffer,
      }
    );
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: 'Network error reaching HF API' }) };
  }

  if (!depthResponse.ok) {
    const text = await depthResponse.text();
    return { statusCode: 502, body: JSON.stringify({ error: 'HF API error', status: depthResponse.status, detail: text }) };
  }

  const depthArrayBuffer = await depthResponse.arrayBuffer();
  const depthBase64 = Buffer.from(depthArrayBuffer).toString('base64');

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ depthBase64 }),
  };
};
```

- [ ] **Step 2: Test locally with Netlify CLI (optional but recommended)**

```bash
# Install if needed: npm install -g netlify-cli
# Set env var temporarily: export HF_API_KEY=hf_xxxxx
npx netlify dev
# Then in another terminal:
curl -X POST http://localhost:8888/api/depth \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"<paste small base64 png>"}'
# Expected: { "depthBase64": "..." }
```

- [ ] **Step 3: Commit**

```bash
git add netlify/functions/depth.js
git commit -m "feat: netlify depth proxy function (HF Depth Anything V2)"
```

---

### Task 3: Frontend depth module

**Files:**
- Create: `js/depth.js`
- Modify: `index.html` (add script tag)

- [ ] **Step 1: Create js/depth.js**

```js
// ============================================================
// POLYMORPH depth.js — Depth map fetching and caching
// ============================================================

// Cache: keyframeIndex → { data: Uint8Array, width, height }
const _depthCache = new Map();

function _canvasToBase64(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.readAsDataURL(blob);
    }, 'image/png');
  });
}

// Fetch and cache depth map for a keyframe.
// canvas must already have the frame drawn on it.
// Returns { data: Uint8Array, width, height } or null on failure.
async function fetchDepthForCanvas(canvas, keyframeIdx) {
  if (_depthCache.has(keyframeIdx)) return _depthCache.get(keyframeIdx);

  // Scale down to max 320px wide for speed
  const scale = Math.min(1, 320 / canvas.width);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const small = document.createElement('canvas');
  small.width = w; small.height = h;
  small.getContext('2d').drawImage(canvas, 0, 0, w, h);

  let depthBase64;
  try {
    const base64 = await _canvasToBase64(small);
    const res = await fetch('/api/depth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64: base64 }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ({ depthBase64 } = await res.json());
  } catch (e) {
    console.warn('[DEPTH] API failed for keyframe', keyframeIdx, e.message);
    return null;
  }

  // Decode depth PNG → RGBA Uint8Array
  const bytes = Uint8Array.from(atob(depthBase64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: 'image/png' });
  const img = await createImageBitmap(blob);
  const dc = document.createElement('canvas');
  dc.width = img.width; dc.height = img.height;
  dc.getContext('2d').drawImage(img, 0, 0);
  const imgData = dc.getContext('2d').getImageData(0, 0, img.width, img.height);

  const result = { data: new Uint8Array(imgData.data.buffer), width: img.width, height: img.height };
  _depthCache.set(keyframeIdx, result);
  return result;
}

// Return cached depth for a given frame, looking up by nearest keyframe.
function getDepthForFrame(frameIndex, depthKeyframeInterval) {
  const ki = Math.floor(frameIndex / depthKeyframeInterval) * depthKeyframeInterval;
  return _depthCache.get(ki) || null;
}

function clearDepthCache() { _depthCache.clear(); }

window.DEPTH = { fetchDepthForCanvas, getDepthForFrame, clearDepthCache };
console.log('[DEPTH] depth.js loaded');
```

- [ ] **Step 2: Add script tag to index.html before engine.js**

Open `index.html`. Find the line:
```html
  <script src="js/engine.js"></script>
```
Add `depth.js` before it:
```html
  <script src="js/depth.js"></script>
  <script src="js/engine.js"></script>
```

- [ ] **Step 3: Verify in browser console**

Open `index.html` in a browser (`npx serve .`), open DevTools console.
Expected output: `[DEPTH] depth.js loaded`

- [ ] **Step 4: Commit**

```bash
git add js/depth.js index.html
git commit -m "feat: depth.js frontend module with keyframe caching"
```

---

### Task 4: Add CONFIG fields

**Files:**
- Modify: `js/engine.js` (lines 13–33, the CONFIG object)

- [ ] **Step 1: Add new fields to CONFIG in engine.js**

Find the CONFIG object (ends at line ~33 with `}`). Add 5 new fields before the closing brace:

```js
const CONFIG = {
  polygonDensity:  1200,
  edgeSensitivity: 85,
  colorDepth:      24,
  affineWarp:      20,
  ditherStrength:  0,
  vertexJitter:    10,
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
  sourceWidth:     0,
  sourceHeight:    0,
  totalFrames:     0,
  // --- 3D Depth Lighting ---
  depthLighting:         false,
  lightAngle:            315,
  depthStrength:         40,
  // --- Mesh Stability ---
  meshStability:         15,
  depthKeyframeInterval: 3,
};
```

- [ ] **Step 2: Add mesh caching state variables after the worker pool variables (around line 46)**

Find:
```js
let pendingResults = new Map();
```
Add mesh state after it:
```js
let pendingResults = new Map();
const meshCache     = new Map(); // frameIndex → { flatPts: Array, triangleIndices: Array }
const meshResolvers = new Map(); // frameIndex → resolve fn
```

- [ ] **Step 3: Commit**

```bash
git add js/engine.js
git commit -m "feat: add depth/mesh CONFIG fields and mesh cache state"
```

---

### Task 5: Modify worker.js for recolor mode and depth lighting

**Files:**
- Modify: `js/worker.js`

This is the most substantial change. Add `computeBrightness()`, split `onmessage` into `full` and `recolor` modes.

- [ ] **Step 1: Add depth lighting helpers after the `toCSS` function (after line 113)**

```js
// ---------- Depth lighting helpers ----------
function _cross(a, b) {
  return [
    a[1]*b[2] - a[2]*b[1],
    a[2]*b[0] - a[0]*b[2],
    a[0]*b[1] - a[1]*b[0],
  ];
}

function _normalize(v) {
  const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]) || 1;
  return [v[0]/len, v[1]/len, v[2]/len];
}

function _dot(a, b) { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }

function _sampleDepth(depthData, depthWidth, depthHeight, frameWidth, frameHeight, x, y) {
  const dx = Math.round(x * depthWidth / frameWidth);
  const dy = Math.round(y * depthHeight / frameHeight);
  const px = Math.max(0, Math.min(depthWidth  - 1, dx));
  const py = Math.max(0, Math.min(depthHeight - 1, dy));
  return depthData[(py * depthWidth + px) * 4] / 255; // red channel, 0–1
}

// Returns brightness multiplier [0.15, 1.0]
function computeBrightness(x0,y0,x1,y1,x2,y2, depthData, depthWidth, depthHeight, frameWidth, frameHeight, lightDir, depthStrength) {
  const d0 = _sampleDepth(depthData, depthWidth, depthHeight, frameWidth, frameHeight, x0, y0);
  const d1 = _sampleDepth(depthData, depthWidth, depthHeight, frameWidth, frameHeight, x1, y1);
  const d2 = _sampleDepth(depthData, depthWidth, depthHeight, frameWidth, frameHeight, x2, y2);
  const p0 = [x0, y0, d0 * depthStrength];
  const p1 = [x1, y1, d1 * depthStrength];
  const p2 = [x2, y2, d2 * depthStrength];
  const v1 = [p1[0]-p0[0], p1[1]-p0[1], p1[2]-p0[2]];
  const v2 = [p2[0]-p0[0], p2[1]-p0[1], p2[2]-p0[2]];
  const n  = _normalize(_cross(v1, v2));
  const b  = _dot(n, lightDir);
  return Math.max(0.15, Math.min(1.0, b));
}

function applyBrightness(rgb, b) {
  return [Math.round(rgb[0]*b), Math.round(rgb[1]*b), Math.round(rgb[2]*b)];
}
```

- [ ] **Step 2: Replace the entire `self.onmessage` function with the new version**

Replace everything from `self.onmessage = function({ data }) {` to the final `};` (lines 116–227) with:

```js
// ---------- Main pipeline ----------
self.onmessage = function({ data }) {
  const {
    type, frameIndex, buffer, width, height, config,
    // recolor mode only:
    flatPts: cachedFlatPts, triangleIndices: cachedTriangleIndices,
    // depth lighting:
    depthData: depthBuf, depthWidth, depthHeight,
  } = data;

  const pixels   = new Uint8ClampedArray(buffer);
  const depthData = depthBuf ? new Uint8Array(depthBuf) : null;

  // Compute light direction from angle (degrees)
  const angleRad = (config.lightAngle || 315) * Math.PI / 180;
  const lightDir = _normalize([
    Math.cos(angleRad) * 0.7,
    Math.sin(angleRad) * 0.7,
    1.0,
  ]);

  let flatPts, triangleIndices;

  if (type === 'recolor') {
    // Reuse cached mesh — skip Sobel and Delaunator
    flatPts         = cachedFlatPts;
    triangleIndices = cachedTriangleIndices;
  } else {
    // type === 'full' — run full pipeline
    const edgeMap = sobelEdgeDetect(pixels, width, height);
    flatPts = samplePoints(edgeMap, width, height, config.polygonDensity, config.edgeSensitivity);
    let delaunay;
    try {
      delaunay = new Delaunator(flatPts);
    } catch(e) {
      self.postMessage({ frameIndex, triangles: [], width, height });
      return;
    }
    triangleIndices = Array.from(delaunay.triangles);
  }

  // Steps 4 + 5: Color sampling + effects
  const palette   = (config.palette !== 'original') ? PALETTES[config.palette] : null;
  const triangles = [];

  for (let i = 0; i < triangleIndices.length; i += 3) {
    const i0 = triangleIndices[i]   * 2;
    const i1 = triangleIndices[i+1] * 2;
    const i2 = triangleIndices[i+2] * 2;

    let x0 = flatPts[i0], y0 = flatPts[i0+1];
    let x1 = flatPts[i1], y1 = flatPts[i1+1];
    let x2 = flatPts[i2], y2 = flatPts[i2+1];
    const cx = (x0+x1+x2)/3, cy = (y0+y1+y2)/3;

    // Affine Warp + Vertex Jitter only on full (keyframe) frames for mesh stability
    if (type !== 'recolor') {
      if (config.affineWarp > 0) {
        const ws = config.affineWarp * 0.015;
        x0 += Math.sin(frameIndex*0.1 + i0*0.7) * ws;
        y0 += Math.cos(frameIndex*0.1 + i0*0.5) * ws;
        x1 += Math.sin(frameIndex*0.1 + i1*0.7) * ws;
        y1 += Math.cos(frameIndex*0.1 + i1*0.5) * ws;
        x2 += Math.sin(frameIndex*0.1 + i2*0.7) * ws;
        y2 += Math.cos(frameIndex*0.1 + i2*0.5) * ws;
      }
      if (config.vertexJitter > 0) {
        const j = config.vertexJitter * 0.08;
        x0 += (Math.random()-0.5)*j; y0 += (Math.random()-0.5)*j;
        x1 += (Math.random()-0.5)*j; y1 += (Math.random()-0.5)*j;
        x2 += (Math.random()-0.5)*j; y2 += (Math.random()-0.5)*j;
      }
    }

    // Sub-pixel Wobble (frame-based, OK on recolor too)
    if (config.subpixelWobble) {
      const w = Math.sin(frameIndex * 0.3) * 0.5;
      x0 += w; x1 += w; x2 += w;
    }

    // Color sampling at vertices + centroid
    let c0 = sampleRGB(pixels, width, height, x0, y0);
    let c1 = sampleRGB(pixels, width, height, x1, y1);
    let c2 = sampleRGB(pixels, width, height, x2, y2);
    let cc = sampleRGB(pixels, width, height, cx, cy);

    if (palette) {
      c0 = nearestPalette(c0, palette);
      c1 = nearestPalette(c1, palette);
      c2 = nearestPalette(c2, palette);
      cc = nearestPalette(cc, palette);
    }

    if (config.colorDepth < 255) {
      c0 = applyQuantization(c0, config.colorDepth);
      c1 = applyQuantization(c1, config.colorDepth);
      c2 = applyQuantization(c2, config.colorDepth);
      cc = applyQuantization(cc, config.colorDepth);
    }

    if (config.colorBanding) {
      c0 = applyColorBanding(c0);
      c1 = applyColorBanding(c1);
      c2 = applyColorBanding(c2);
      cc = applyColorBanding(cc);
    }

    if (config.fogEffect) cc = applyFog(cc, cy, height);
    if (config.ditherStrength > 0) cc = applyDither(cc, cx, cy, config.ditherStrength / 100);

    // Depth lighting: compute brightness from surface normal and apply
    if (depthData && config.depthLighting) {
      const b = computeBrightness(
        x0, y0, x1, y1, x2, y2,
        depthData, depthWidth, depthHeight, width, height,
        lightDir, config.depthStrength
      );
      cc = applyBrightness(cc, b);
      c0 = applyBrightness(c0, b);
      c1 = applyBrightness(c1, b);
      c2 = applyBrightness(c2, b);
    }

    triangles.push({
      verts:  [x0, y0, x1, y1, x2, y2],
      colors: [toCSS(cc), toCSS(c0), toCSS(c1), toCSS(c2)],
      interlaceDim: config.interlaceFlash && (frameIndex % 2 === 1) && ((i/3 | 0) % 2 === 0),
    });
  }

  if (config.zFighting && triangles.length > 4) {
    for (let k = 0; k < 3; k++) {
      const a = Math.floor(Math.random() * triangles.length);
      const b = Math.floor(Math.random() * triangles.length);
      if (a !== b) { const t = triangles[a].colors; triangles[a].colors = triangles[b].colors; triangles[b].colors = t; }
    }
  }

  self.postMessage({
    frameIndex, triangles, width, height,
    // Return mesh data on full (keyframe) frames so engine can cache it
    flatPts:         type === 'full' ? flatPts         : undefined,
    triangleIndices: type === 'full' ? triangleIndices : undefined,
  });
};
```

- [ ] **Step 3: Test worker still loads in browser**

Open `index.html`, drop a video, click PROCESS VIDEO. Confirm it still works (triangles render). Check console for errors.

- [ ] **Step 4: Commit**

```bash
git add js/worker.js
git commit -m "feat: worker recolor mode and depth lighting (Lambertian shading)"
```

---

### Task 6: Modify engine.js dispatch

**Files:**
- Modify: `js/engine.js`

Changes: clear mesh/depth caches on new processing run; fetch depth for keyframes before dispatch; dispatch keyframes first and wait for mesh results; then dispatch recolor frames.

- [ ] **Step 1: Modify `handleResult` to cache mesh data from keyframe results**

Find `handleResult` (starts around line 64). Replace it entirely:

```js
function handleResult(workerIdx, data) {
  if (cancelled) return;
  const { frameIndex, triangles, width, height, flatPts, triangleIndices } = data;

  // Cache mesh geometry returned from full (keyframe) frames
  if (flatPts) {
    meshCache.set(frameIndex, { flatPts, triangleIndices });
    const resolve = meshResolvers.get(frameIndex);
    if (resolve) { resolve(); meshResolvers.delete(frameIndex); }
  }

  // Flash worker indicator
  const dots = document.getElementById('worker-dots');
  if (dots) {
    const arr = ['■','■','■','■'];
    arr[workerIdx] = `<span class="worker-dot-active">■</span>`;
    dots.innerHTML = arr.join('');
    setTimeout(() => { if (dots) dots.textContent = '■■■■'; }, 350);
  }

  pendingResults.set(frameIndex, { frameIndex, triangles, width, height });

  // Flush in-order results
  while (pendingResults.has(ENGINE.processedFrames.length)) {
    const r = pendingResults.get(ENGINE.processedFrames.length);
    ENGINE.processedFrames.push(r);
    pendingResults.delete(r.frameIndex);
  }

  completedFrames++;
  const pct     = (completedFrames / expectedFrames) * 100;
  const elapsed = (Date.now() - processingStart) / 1000;
  const eta     = elapsed / completedFrames * (expectedFrames - completedFrames);
  const label   = `PROCESSING FRAME ${String(completedFrames).padStart(3,'0')} / ${expectedFrames}`;
  setProgress('workbar', label, pct, eta);

  if (ENGINE.processedFrames.length > 0) {
    drawFrameToCanvas(ENGINE.processedFrames[ENGINE.processedFrames.length - 1]);
  }

  if (completedFrames === expectedFrames) finishProcessing();
}
```

- [ ] **Step 2: Replace `startProcessing` with the new version**

Replace the entire `async function startProcessing(videoEl) { ... }` (lines 146–190):

```js
async function startProcessing(videoEl) {
  if (ENGINE.isProcessing) return;
  ENGINE.isProcessing = true;
  ENGINE.processedFrames = [];
  cancelled = false;
  completedFrames = 0;
  pendingResults.clear();
  meshCache.clear();
  meshResolvers.clear();
  processingStart = Date.now();

  document.getElementById('drop-zone').hidden    = true;
  document.getElementById('workbar').hidden      = false;
  document.getElementById('output-canvas').hidden = false;
  setStatus('processing', 'PROCESSING');

  console.log('[ENGINE] Starting processing...');

  let frames;
  try {
    frames = await extractFrames(videoEl);
  } catch(e) {
    console.error('[ENGINE] Extraction failed:', e);
    showError('Frame extraction failed: ' + e.message);
    ENGINE.isProcessing = false;
    return;
  }

  if (cancelled) { ENGINE.isProcessing = false; return; }

  const configSnap = { ...CONFIG };
  expectedFrames = frames.length;

  const oc = document.getElementById('output-canvas');
  oc.width  = CONFIG.sourceWidth;
  oc.height = CONFIG.sourceHeight;

  // --- Depth map pre-fetch (if enabled) ---
  if (configSnap.depthLighting) {
    DEPTH.clearDepthCache();
    const scratch    = document.createElement('canvas');
    scratch.width    = frames[0].width;
    scratch.height   = frames[0].height;
    const scratchCtx = scratch.getContext('2d');

    // Unique keyframe indices for depth fetching
    const depthKIs = [...new Set(
      frames.map(f => Math.floor(f.frameIndex / configSnap.depthKeyframeInterval) * configSnap.depthKeyframeInterval)
    )];

    setStatus('processing', 'ESTIMATING DEPTH...');
    for (let i = 0; i < depthKIs.length; i++) {
      if (cancelled) { ENGINE.isProcessing = false; return; }
      const ki = depthKIs[i];
      const f  = frames.find(fr => fr.frameIndex === ki);
      if (!f) continue;
      // Use a copy so we don't consume the buffer before worker transfer
      const id = new ImageData(new Uint8ClampedArray(f.buffer.slice(0)), f.width, f.height);
      scratchCtx.putImageData(id, 0, 0);
      await DEPTH.fetchDepthForCanvas(scratch, ki);
      setProgress('workbar', `DEPTH MAP ${i+1} / ${depthKIs.length}`, (i+1) / depthKIs.length * 25);
    }
    setStatus('processing', 'PROCESSING');
  }

  processingStart = Date.now(); // reset after depth fetch

  // Helper to build depth transfer args
  function depthArgs(frameIndex) {
    if (!configSnap.depthLighting) return { depthData: null, depthWidth: 0, depthHeight: 0, xfers: [] };
    const d = DEPTH.getDepthForFrame(frameIndex, configSnap.depthKeyframeInterval);
    if (!d) return { depthData: null, depthWidth: 0, depthHeight: 0, xfers: [] };
    const buf = d.data.buffer.slice(0);
    return { depthData: buf, depthWidth: d.width, depthHeight: d.height, xfers: [buf] };
  }

  // --- Phase 1: dispatch keyframes (full mode) and await mesh results ---
  const keyframeFrames = frames.filter(f => f.frameIndex % configSnap.meshStability === 0);
  const meshPromises   = keyframeFrames.map(f =>
    new Promise(resolve => meshResolvers.set(f.frameIndex, resolve))
  );

  keyframeFrames.forEach(f => {
    const { depthData, depthWidth, depthHeight, xfers } = depthArgs(f.frameIndex);
    workers[f.frameIndex % WORKER_COUNT].postMessage(
      { type: 'full', frameIndex: f.frameIndex, buffer: f.buffer, width: f.width, height: f.height, config: configSnap, depthData, depthWidth, depthHeight },
      [f.buffer, ...xfers]
    );
  });

  await Promise.all(meshPromises);
  if (cancelled) { ENGINE.isProcessing = false; return; }

  // --- Phase 2: dispatch recolor frames ---
  const recolorFrames = frames.filter(f => f.frameIndex % configSnap.meshStability !== 0);
  recolorFrames.forEach(f => {
    const ki      = Math.floor(f.frameIndex / configSnap.meshStability) * configSnap.meshStability;
    const mesh    = meshCache.get(ki);
    const { depthData, depthWidth, depthHeight, xfers } = depthArgs(f.frameIndex);
    if (!mesh) {
      // Fallback: run full pipeline if mesh somehow missing
      workers[f.frameIndex % WORKER_COUNT].postMessage(
        { type: 'full', frameIndex: f.frameIndex, buffer: f.buffer, width: f.width, height: f.height, config: configSnap, depthData, depthWidth, depthHeight },
        [f.buffer, ...xfers]
      );
      return;
    }
    workers[f.frameIndex % WORKER_COUNT].postMessage(
      { type: 'recolor', frameIndex: f.frameIndex, buffer: f.buffer, width: f.width, height: f.height, config: configSnap, flatPts: mesh.flatPts, triangleIndices: mesh.triangleIndices, depthData, depthWidth, depthHeight },
      [f.buffer, ...xfers]
    );
  });
}
```

- [ ] **Step 3: Expose `lightDir` computation to CONFIG via `applyPreset` — no change needed.** The `lightAngle` field lives in CONFIG and is read by each worker from `configSnap`. No extra wiring needed.

- [ ] **Step 4: Process a video and confirm in console**

Open browser, drop a video, click PROCESS. Check console for:
- `[ENGINE] Starting processing...`
- No JS errors
- `[DEPTH] depth.js loaded` (when depthLighting off, depth fetch step is skipped)
- Frames render correctly

- [ ] **Step 5: Commit**

```bash
git add js/engine.js
git commit -m "feat: mesh keyframe caching and depth pre-fetch in engine"
```

---

### Task 7: Add HTML controls

**Files:**
- Modify: `index.html`

Add a `3D DEPTH` section to the left panel with 4 controls: DEPTH LIGHTING toggle, LIGHT ANGLE slider, DEPTH STRENGTH slider, MESH STABILITY slider.

- [ ] **Step 1: Add 3D DEPTH section to index.html**

In `index.html`, find the closing `</section>` tag of the left panel (after the PALETTE radio group, around line 78). Add the new section before it:

```html
      <h2 class="section-heading" style="margin-top:20px">3D DEPTH</h2>
      <div class="fx-toggles">
        <button class="pill" data-fx="depthLighting" id="pill-depth-lighting">DEPTH LIGHTING</button>
      </div>
      <div class="sliders" style="margin-top:10px">
        <div class="slider-row"><label>LIGHT ANGLE <span id="val-light-angle">315</span>°</label><input type="range" id="sl-light-angle" min="0" max="360" value="315"></div>
        <div class="slider-row"><label>DEPTH STRENGTH <span id="val-depth-strength">40</span></label><input type="range" id="sl-depth-strength" min="0" max="100" value="40"></div>
        <div class="slider-row"><label>MESH STABILITY <span id="val-mesh-stability">15</span></label><input type="range" id="sl-mesh-stability" min="1" max="60" value="15"></div>
      </div>
```

- [ ] **Step 2: Verify HTML renders correctly**

Open `index.html` in browser. Confirm the 3D DEPTH section appears below PALETTE with the toggle pill and 3 sliders. Check no layout breakage.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: add 3D DEPTH controls to left panel"
```

---

### Task 8: Bind new controls in ui.js

**Files:**
- Modify: `js/ui.js`

Wire the 3 new sliders and the DEPTH LIGHTING toggle to CONFIG. Update `syncControls()` to include them.

- [ ] **Step 1: Add new sliders to the slider map in `initSliders()`**

Find the `map` object inside `initSliders()` (around line 214):
```js
  const map = {
    'sl-density': ['polygonDensity', 'val-density'],
    'sl-edge':    ['edgeSensitivity','val-edge'],
    'sl-depth':   ['colorDepth',     'val-depth'],
    'sl-warp':    ['affineWarp',     'val-warp'],
    'sl-dither':  ['ditherStrength', 'val-dither'],
    'sl-jitter':  ['vertexJitter',   'val-jitter'],
  };
```
Add the 3 new sliders:
```js
  const map = {
    'sl-density':       ['polygonDensity',   'val-density'],
    'sl-edge':          ['edgeSensitivity',  'val-edge'],
    'sl-depth':         ['colorDepth',       'val-depth'],
    'sl-warp':          ['affineWarp',       'val-warp'],
    'sl-dither':        ['ditherStrength',   'val-dither'],
    'sl-jitter':        ['vertexJitter',     'val-jitter'],
    'sl-light-angle':   ['lightAngle',       'val-light-angle'],
    'sl-depth-strength':['depthStrength',    'val-depth-strength'],
    'sl-mesh-stability':['meshStability',    'val-mesh-stability'],
  };
```

- [ ] **Step 2: The DEPTH LIGHTING toggle uses `data-fx="depthLighting"` which is already handled by `initFXToggles()`. Verify it works.**

`initFXToggles()` already queries all `.pill[data-fx]` elements and toggles `ENGINE.CONFIG[fx]`. The new `#pill-depth-lighting` has `data-fx="depthLighting"` so it's automatically included. No code change needed here.

- [ ] **Step 3: Add new sliders to `syncControls()`**

Find `syncControls()` (around line 254). After the last `sl(...)` call for `sl-jitter`, add:

```js
  sl('sl-light-angle',    'val-light-angle',    C.lightAngle);
  sl('sl-depth-strength', 'val-depth-strength', C.depthStrength);
  sl('sl-mesh-stability', 'val-mesh-stability', C.meshStability);
```

- [ ] **Step 4: End-to-end test**

1. Open browser, drop a video
2. In left panel: confirm 3D DEPTH section shows DEPTH LIGHTING pill + 3 sliders
3. Click DEPTH LIGHTING pill — it should highlight
4. Move LIGHT ANGLE slider — check `ENGINE.CONFIG.lightAngle` updates in console: `ENGINE.CONFIG.lightAngle`
5. Click PROCESS VIDEO — confirm processing completes
6. The output should show flat-shaded triangles that look lit from the top-left

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat: bind depth lighting controls in ui.js"
```

---

### Task 9: Deploy and set environment variable

**Files:** (no code changes)

- [ ] **Step 1: Push to GitHub**

```bash
git push origin master
```

- [ ] **Step 2: Set HF_API_KEY in Netlify**

Go to Netlify dashboard → your site → Site configuration → Environment variables → Add variable:
- Key: `HF_API_KEY`
- Value: your Hugging Face API token (from https://huggingface.co/settings/tokens — free account, read token is sufficient)

- [ ] **Step 3: Trigger deploy and test**

After Netlify rebuilds, open the live site. Drop a video. Enable DEPTH LIGHTING. Click PROCESS.

Expected behavior:
- Status bar shows "ESTIMATING DEPTH..." during depth fetch phase
- Then "PROCESSING" during frame rendering
- Output polygons appear flat-shaded — faces toward the light source are bright, faces away are dark
- Mesh stays stable frame-to-frame (no jitter between keyframes)

- [ ] **Step 4: If HF model is loading (first request can be slow), retry**

HF free tier cold-starts the model. If the first request returns `{"error":"Model is currently loading"}`, the Netlify function returns a 502. The depth module logs a warning and falls back to unlit rendering for that keyframe gracefully. On the next run the model will be warm.
