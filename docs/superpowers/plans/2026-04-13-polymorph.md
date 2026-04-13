# POLYMORPH Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build POLYMORPH — a vanilla HTML/CSS/JS PS1-style low-poly motion design tool that processes video frame-by-frame using a 4-worker Delaunay pipeline and exports as WebM or GIF.

**Architecture:** A 4-worker pool (worker.js) handles the full PS1 pipeline per frame (Sobel → point sampling → Delaunator → color sampling → effects). engine.js manages the pool, CONFIG state, and frame extraction. ui.js owns all DOM rendering and the PS1 ASCII workbar. export.js handles MediaRecorder and gif.js encoding.

**Tech Stack:** Vanilla HTML/CSS/JS, Delaunator (CDN via importScripts in worker), gif.js (CDN script tag), Google Fonts CDN, MediaRecorder API, Canvas 2D API

---

## File Map

| File | Responsibility |
|------|---------------|
| `index.html` | Shell, all CDN imports, full DOM structure |
| `css/style.css` | All styles — custom props, layout, scanlines, vignette, cards, workbar |
| `js/worker.js` | Full PS1 pipeline: Sobel, point sampling, Delaunator, color sampling, all FX effects |
| `js/engine.js` | CONFIG object, presets, palette data, 4-worker pool, frame extraction, orchestration |
| `js/ui.js` | Preset cards + animations, drop zone, tweak panel, drawFrame (all 6 render styles), workbar, playback, status |
| `js/export.js` | MP4/WebM MediaRecorder export, GIF gif.js export, size estimation, auto-download |
| `vercel.json` | Static site rewrite rule |

---

## Task 1: Project Scaffold

**Files:**
- Create: `index.html`
- Create: `css/style.css`
- Create: `js/engine.js`
- Create: `js/worker.js`
- Create: `js/export.js`
- Create: `js/ui.js`
- Create: `vercel.json`

- [ ] **Step 1: Create vercel.json**

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

- [ ] **Step 2: Create index.html with full DOM structure**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>POLYMORPH — PS1 Low-Poly Motion Designer</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <canvas id="bg-canvas"></canvas>

  <div class="container">
    <header class="header">
      <div class="header-left">
        <h1 class="title">POLYMORPH</h1>
        <p class="subtitle">PS1 LOW-POLY MOTION DESIGNER</p>
      </div>
      <div class="status-badge" id="status-badge">
        <span class="status-dot"></span>
        <span class="status-text" id="status-text">READY</span>
      </div>
    </header>

    <main class="main-grid">
      <section class="presets-section">
        <h2 class="section-heading">PRESETS</h2>
        <div class="presets-grid" id="presets-grid"></div>
      </section>

      <section class="output-section">
        <h2 class="section-heading">INPUT / OUTPUT</h2>

        <div class="drop-zone" id="drop-zone">
          <p class="drop-icon">▽</p>
          <p class="drop-text">DROP VIDEO HERE</p>
          <p class="drop-subtext">MP4 · MOV · WEBM &nbsp;|&nbsp; <label class="browse-label" for="file-input">BROWSE</label></p>
          <input type="file" id="file-input" accept="video/*" hidden>
        </div>

        <div class="workbar" id="workbar" hidden>
          <div class="workbar-label" id="workbar-label">PROCESSING FRAME 000 / 000</div>
          <div class="workbar-track">
            <div class="workbar-fill" id="workbar-fill"></div>
            <span class="workbar-pct" id="workbar-pct">0%</span>
          </div>
          <div class="workbar-sub">
            <span id="workbar-eta">EST. REMAINING: --:--</span>
            <button class="btn-cancel" id="btn-cancel">■ CANCEL</button>
          </div>
          <div class="worker-pool-row">
            WORKER POOL: <span class="worker-dots" id="worker-dots">■■■■</span>
          </div>
        </div>

        <canvas class="output-canvas" id="output-canvas" hidden></canvas>

        <div class="playback-panel" id="playback-panel" hidden>
          <button class="btn" id="btn-play-loop">▶ LOOP</button>
          <button class="btn" id="btn-stop">■ STOP</button>
          <span class="playback-info" id="playback-info">FRAME 0 / 0</span>
        </div>
      </section>
    </main>

    <section class="tweak-section">
      <button class="tweak-toggle" id="tweak-toggle">▼ TWEAK PARAMETERS</button>
      <div class="tweak-panel" id="tweak-panel" hidden>
        <div class="tweak-group">
          <h3 class="tweak-heading">PARAMETERS</h3>
          <div class="slider-row"><label>POLYGON DENSITY <span id="val-density">600</span></label><input type="range" id="sl-density" min="100" max="3000" value="600"></div>
          <div class="slider-row"><label>EDGE SENSITIVITY <span id="val-edge">70</span></label><input type="range" id="sl-edge" min="0" max="100" value="70"></div>
          <div class="slider-row"><label>COLOR DEPTH <span id="val-depth">24</span></label><input type="range" id="sl-depth" min="4" max="256" value="24"></div>
          <div class="slider-row"><label>AFFINE WARP <span id="val-warp">80</span></label><input type="range" id="sl-warp" min="0" max="100" value="80"></div>
          <div class="slider-row"><label>DITHER STRENGTH <span id="val-dither">0</span></label><input type="range" id="sl-dither" min="0" max="100" value="0"></div>
          <div class="slider-row"><label>VERTEX JITTER <span id="val-jitter">30</span></label><input type="range" id="sl-jitter" min="0" max="100" value="30"></div>
        </div>
        <div class="tweak-group">
          <h3 class="tweak-heading">FX TOGGLES</h3>
          <div class="fx-toggles">
            <button class="pill active" data-fx="scanlines">CRT SCANLINES</button>
            <button class="pill" data-fx="colorBanding">COLOR BANDING</button>
            <button class="pill" data-fx="zFighting">Z-FIGHTING</button>
            <button class="pill" data-fx="interlaceFlash">INTERLACE FLASH</button>
            <button class="pill" data-fx="fogEffect">FOG EFFECT</button>
            <button class="pill" data-fx="subpixelWobble">SUB-PIXEL WOBBLE</button>
          </div>
        </div>
        <div class="tweak-group">
          <h3 class="tweak-heading">RENDER STYLE</h3>
          <div class="radio-group">
            <label class="radio-opt"><input type="radio" name="renderStyle" value="flat" checked> PS1 FLAT</label>
            <label class="radio-opt"><input type="radio" name="renderStyle" value="wireframe"> WIREFRAME</label>
            <label class="radio-opt"><input type="radio" name="renderStyle" value="gouraud"> GOURAUD</label>
            <label class="radio-opt"><input type="radio" name="renderStyle" value="dither"> DITHER</label>
            <label class="radio-opt"><input type="radio" name="renderStyle" value="chunky"> CHUNKY</label>
            <label class="radio-opt"><input type="radio" name="renderStyle" value="vector"> VECTOR</label>
          </div>
        </div>
        <div class="tweak-group">
          <h3 class="tweak-heading">PALETTE</h3>
          <div class="radio-group">
            <label class="radio-opt"><input type="radio" name="palette" value="ps1dark" checked> PS1 DARK</label>
            <label class="radio-opt"><input type="radio" name="palette" value="acid"> ACID</label>
            <label class="radio-opt"><input type="radio" name="palette" value="vhswarm"> VHS WARM</label>
            <label class="radio-opt"><input type="radio" name="palette" value="dmggreen"> DMG GREEN</label>
            <label class="radio-opt"><input type="radio" name="palette" value="n64"> N64</label>
            <label class="radio-opt"><input type="radio" name="palette" value="original"> ORIGINAL</label>
          </div>
        </div>
      </div>
    </section>

    <section class="export-section" id="export-section">
      <h2 class="section-heading">EXPORT</h2>
      <div class="export-controls">
        <div class="aspect-row">
          <span class="export-label">OUTPUT ASPECT:</span>
          <button class="pill active" id="aspect-916">9:16 REELS</button>
          <button class="pill" id="aspect-src">SOURCE</button>
        </div>
        <div class="export-btns">
          <div class="export-btn-group">
            <button class="btn btn-export" id="btn-mp4" disabled>▶ EXPORT MP4</button>
            <span class="size-est" id="mp4-est"></span>
          </div>
          <div class="export-btn-group">
            <button class="btn btn-export" id="btn-gif" disabled>▶ EXPORT GIF</button>
            <span class="size-est" id="gif-est"></span>
          </div>
        </div>
      </div>
      <div class="export-workbar" id="export-workbar" hidden>
        <div class="workbar-label" id="export-workbar-label">ENCODING...</div>
        <div class="workbar-track">
          <div class="workbar-fill" id="export-workbar-fill"></div>
          <span class="workbar-pct" id="export-workbar-pct">0%</span>
        </div>
      </div>
    </section>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/gif.js/dist/gif.js"></script>
  <script src="js/engine.js"></script>
  <script src="js/export.js"></script>
  <script src="js/ui.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create stub files**

`css/style.css`:
```css
/* POLYMORPH styles — populated in Task 2 */
```

`js/engine.js`:
```js
// POLYMORPH engine — populated in Tasks 7, 9, 10
console.log('[POLYMORPH] engine.js loaded');
```

`js/worker.js`:
```js
// POLYMORPH worker — populated in Task 8
console.log('[POLYMORPH] worker.js loaded (this should not appear — workers log differently)');
```

`js/export.js`:
```js
// POLYMORPH export — populated in Tasks 13, 14
console.log('[POLYMORPH] export.js loaded');
```

`js/ui.js`:
```js
// POLYMORPH ui — populated in Tasks 5, 10, 11, 12
console.log('[POLYMORPH] ui.js loaded');
```

- [ ] **Step 4: Verify scaffold loads**

Run: `npx serve .`  
Open: `http://localhost:3000`  
Expected: blank dark page, browser console shows:
```
[POLYMORPH] engine.js loaded
[POLYMORPH] export.js loaded
[POLYMORPH] ui.js loaded
```
No 404 errors in Network tab.

- [ ] **Step 5: Commit**

```bash
git init
git add .
git commit -m "feat: project scaffold — index.html, stub JS/CSS files, vercel.json"
```

---

## Task 2: CSS Foundation

**Files:**
- Write: `css/style.css`

- [ ] **Step 1: Write complete style.css**

```css
/* ============================================================
   POLYMORPH — style.css
   All layout, typography, components, and FX
   ============================================================ */

/* ---------- Custom Properties ---------- */
:root {
  --bg: #0a0a14;
  --panel: #0f0f1e;
  --border: #1e1e3a;
  --teal: #00e5cc;
  --purple: #9b4dff;
  --pink: #ff2d78;
  --text: #c8c8e8;
  --text-dim: #5a5a8a;
  --font-display: 'Orbitron', monospace;
  --font-mono: 'Share Tech Mono', monospace;
  --radius: 2px;
  --gap: 16px;
}

/* ---------- Reset ---------- */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { font-size: 14px; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--font-mono);
  min-height: 100vh;
  overflow-x: hidden;
  position: relative;
}

/* ---------- CRT Scanlines Overlay ---------- */
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    transparent 0px,
    transparent 2px,
    rgba(0,0,0,0.06) 2px,
    rgba(0,0,0,0.06) 4px
  );
  pointer-events: none;
  z-index: 9999;
}

/* ---------- CRT Vignette ---------- */
body::before {
  content: '';
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.7) 100%);
  pointer-events: none;
  z-index: 9998;
}

/* ---------- Background Canvas ---------- */
#bg-canvas {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: -1;
  opacity: 0.12;
}

/* ---------- Container ---------- */
.container {
  max-width: 1100px;
  margin: 0 auto;
  padding: 24px var(--gap);
}

/* ---------- Header ---------- */
.header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 32px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
}
.title {
  font-family: var(--font-display);
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  background: linear-gradient(90deg, var(--teal), var(--purple));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
}
.subtitle {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-dim);
  letter-spacing: 0.2em;
  margin-top: 4px;
}
.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.15em;
  color: var(--teal);
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--teal);
  box-shadow: 0 0 8px var(--teal);
  animation: pulse 2s ease-in-out infinite;
}
.status-badge.processing .status-dot { background: var(--pink); box-shadow: 0 0 8px var(--pink); }
.status-badge.processing .status-text { color: var(--pink); }
.status-badge.error .status-dot { background: var(--pink); animation: none; }
.status-badge.error .status-text { color: var(--pink); }
.status-badge.export-ready .status-dot { background: var(--purple); box-shadow: 0 0 8px var(--purple); }
.status-badge.export-ready .status-text { color: var(--purple); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ---------- Section Headings ---------- */
.section-heading {
  font-family: var(--font-display);
  font-size: 0.7rem;
  letter-spacing: 0.25em;
  color: var(--text-dim);
  margin-bottom: 12px;
  padding-top: 8px;
  border-top: 2px solid transparent;
  border-image: linear-gradient(90deg, var(--teal), var(--purple)) 1;
}

/* ---------- Main Grid ---------- */
.main-grid {
  display: grid;
  grid-template-columns: 45% 1fr;
  gap: 24px;
  margin-bottom: 24px;
}

/* ---------- Preset Cards ---------- */
.presets-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.preset-card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}
.preset-card:hover {
  transform: scale(1.03);
  border-color: rgba(0,229,204,0.5);
}
.preset-card.active {
  border-color: var(--teal);
  box-shadow: 0 0 12px rgba(0,229,204,0.4);
}
.preset-thumb {
  width: 100%;
  height: 70px;
  display: block;
}
.preset-info {
  padding: 8px 10px;
}
.preset-name {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.15em;
  color: var(--teal);
  display: block;
  margin-bottom: 3px;
}
.preset-desc {
  font-size: 0.65rem;
  color: var(--text-dim);
  line-height: 1.3;
}

/* ---------- Output Section ---------- */
.output-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.drop-zone {
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 40px 20px;
  text-align: center;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
  min-height: 200px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.drop-zone.drag-over {
  border-color: var(--teal);
  background: rgba(0,229,204,0.04);
}
.drop-icon {
  font-size: 2rem;
  color: var(--teal);
  line-height: 1;
}
.drop-text {
  font-family: var(--font-display);
  font-size: 0.75rem;
  letter-spacing: 0.2em;
  color: var(--text);
}
.drop-subtext {
  font-size: 0.7rem;
  color: var(--text-dim);
}
.browse-label {
  color: var(--teal);
  cursor: pointer;
  text-decoration: underline;
}

/* ---------- Workbar ---------- */
.workbar {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--teal);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.workbar-label { letter-spacing: 0.08em; }
.workbar-track {
  position: relative;
  height: 18px;
  background: rgba(0,229,204,0.08);
  border: 1px solid rgba(0,229,204,0.2);
  border-radius: 1px;
  overflow: hidden;
}
.workbar-fill {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  background: linear-gradient(90deg, var(--teal), var(--purple));
  width: 0%;
  transition: width 0.15s linear;
}
.workbar-pct {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.65rem;
  color: var(--text);
  z-index: 1;
}
.workbar-sub {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.65rem;
  color: var(--text-dim);
}
.btn-cancel {
  background: transparent;
  border: 1px solid var(--pink);
  color: var(--pink);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 3px 10px;
  cursor: pointer;
  letter-spacing: 0.1em;
  transition: background 0.15s;
}
.btn-cancel:hover { background: var(--pink); color: #000; }
.worker-pool-row { font-size: 0.65rem; color: var(--text-dim); }
.worker-dots { color: var(--teal); letter-spacing: 2px; }
.worker-dot-active { animation: worker-flash 0.3s ease; }
@keyframes worker-flash {
  0% { color: var(--teal); }
  50% { color: #fff; text-shadow: 0 0 8px var(--teal); }
  100% { color: var(--teal); }
}

/* ---------- Output Canvas ---------- */
.output-canvas {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: block;
}

/* ---------- Playback Panel ---------- */
.playback-panel {
  display: flex;
  align-items: center;
  gap: 10px;
}
.playback-info {
  font-size: 0.65rem;
  color: var(--text-dim);
  margin-left: auto;
}

/* ---------- Buttons ---------- */
.btn {
  background: transparent;
  border: 1px solid var(--teal);
  color: var(--teal);
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.1em;
  padding: 6px 16px;
  cursor: pointer;
  border-radius: var(--radius);
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
}
.btn:hover { background: var(--teal); color: #000; box-shadow: 0 0 12px rgba(0,229,204,0.4); }
.btn:disabled { opacity: 0.3; cursor: not-allowed; }
.btn:disabled:hover { background: transparent; color: var(--teal); box-shadow: none; }
.btn-export {
  border-color: var(--purple);
  color: var(--purple);
}
.btn-export:hover { background: var(--purple); color: #fff; box-shadow: 0 0 12px rgba(155,77,255,0.4); }

/* ---------- Tweak Section ---------- */
.tweak-section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 24px;
  overflow: hidden;
}
.tweak-toggle {
  width: 100%;
  background: transparent;
  border: none;
  color: var(--text-dim);
  font-family: var(--font-display);
  font-size: 0.65rem;
  letter-spacing: 0.25em;
  padding: 14px 20px;
  cursor: pointer;
  text-align: left;
  border-top: 2px solid transparent;
  border-image: linear-gradient(90deg, var(--teal), var(--purple)) 1;
  transition: color 0.15s;
}
.tweak-toggle:hover { color: var(--teal); }
.tweak-panel {
  padding: 16px 20px 20px;
  border-top: 1px solid var(--border);
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
.tweak-group { display: flex; flex-direction: column; gap: 10px; }
.tweak-heading {
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.2em;
  color: var(--text-dim);
  padding-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.slider-row { display: flex; flex-direction: column; gap: 4px; }
.slider-row label {
  font-size: 0.65rem;
  color: var(--text-dim);
  display: flex;
  justify-content: space-between;
}
.slider-row label span { color: var(--teal); }
input[type="range"] {
  -webkit-appearance: none;
  width: 100%;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
}
input[type="range"]::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--teal);
  cursor: pointer;
  box-shadow: 0 0 6px var(--teal);
}

/* ---------- Pills (FX toggles) ---------- */
.fx-toggles { display: flex; flex-wrap: wrap; gap: 6px; }
.pill {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: 20px;
  transition: all 0.15s;
}
.pill:hover { border-color: var(--teal); color: var(--teal); }
.pill.active {
  background: rgba(0,229,204,0.1);
  border-color: var(--teal);
  color: var(--teal);
  box-shadow: 0 0 8px rgba(0,229,204,0.2);
}

/* ---------- Radio Groups ---------- */
.radio-group { display: flex; flex-wrap: wrap; gap: 6px; }
.radio-opt {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.65rem;
  color: var(--text-dim);
  cursor: pointer;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: all 0.15s;
}
.radio-opt:has(input:checked) {
  border-color: var(--purple);
  color: var(--purple);
  background: rgba(155,77,255,0.08);
}
.radio-opt input { display: none; }

/* ---------- Export Section ---------- */
.export-section {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px 20px 20px;
  border-top: 2px solid transparent;
  border-image: linear-gradient(90deg, var(--teal), var(--purple)) 1;
  margin-bottom: 40px;
}
.export-controls { display: flex; flex-direction: column; gap: 14px; }
.aspect-row { display: flex; align-items: center; gap: 10px; }
.export-label { font-size: 0.65rem; color: var(--text-dim); letter-spacing: 0.1em; }
.export-btns { display: flex; gap: 16px; }
.export-btn-group { display: flex; flex-direction: column; gap: 4px; }
.size-est { font-size: 0.6rem; color: var(--text-dim); }
.export-workbar { margin-top: 12px; }

/* ---------- Scanlines toggle (controlled by JS class on body) ---------- */
.no-scanlines::after { display: none; }

/* ---------- Mobile ---------- */
@media (max-width: 768px) {
  .main-grid { grid-template-columns: 1fr; }
  .tweak-panel { grid-template-columns: 1fr; }
  .title { font-size: 1.6rem; }
}
```

- [ ] **Step 2: Verify styling**

Open `http://localhost:3000` — expected: dark `#0a0a14` background, scanline overlay visible (faint horizontal lines), vignette darkening edges, Orbitron + Share Tech Mono fonts loaded. Layout is an empty grid.

- [ ] **Step 3: Commit**

```bash
git add css/style.css
git commit -m "feat: CSS foundation — layout, typography, scanlines, vignette, all component styles"
```

---

## Task 3: Background Canvas Animation

**Files:**
- Modify: `js/ui.js`

The background canvas shows a slowly drifting low-poly triangulated mesh at low opacity — purely decorative, throttled to 30fps.

- [ ] **Step 1: Write background canvas animation in ui.js**

```js
// ============================================================
// POLYMORPH ui.js
// ============================================================

// ---------- Background Canvas ----------

function initBackgroundCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const POINT_COUNT = 40;
  const SPEED = 0.3;

  // Palette for background: muted versions of brand colors
  const BG_COLORS = ['#00e5cc22', '#9b4dff22', '#ff2d7822', '#1e1e3a44'];

  let W, H, points, triangles;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    initPoints();
  }

  function initPoints() {
    points = [];
    for (let i = 0; i < POINT_COUNT; i++) {
      points.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: (Math.random() - 0.5) * SPEED,
        vy: (Math.random() - 0.5) * SPEED,
      });
    }
    // Add corners to prevent empty edges
    points.push({ x: 0, y: 0, vx: 0, vy: 0 });
    points.push({ x: W, y: 0, vx: 0, vy: 0 });
    points.push({ x: 0, y: H, vx: 0, vy: 0 });
    points.push({ x: W, y: H, vx: 0, vy: 0 });
  }

  function triangulate() {
    // Simple Delaunay-like: use the loaded Delaunator if available
    if (typeof Delaunator === 'undefined') return [];
    const coords = points.flatMap(p => [p.x, p.y]);
    try {
      const d = new Delaunator(coords);
      return d.triangles;
    } catch (e) {
      return [];
    }
  }

  let lastFrame = 0;
  const FPS_LIMIT = 30;
  const FRAME_MS = 1000 / FPS_LIMIT;

  function animate(now) {
    requestAnimationFrame(animate);
    if (now - lastFrame < FRAME_MS) return;
    lastFrame = now;

    // Update positions
    for (const p of points) {
      if (p.vx === 0 && p.vy === 0) continue; // corners
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }

    ctx.clearRect(0, 0, W, H);

    const tris = triangulate();
    for (let i = 0; i < tris.length; i += 3) {
      const a = points[tris[i]];
      const b = points[tris[i + 1]];
      const c = points[tris[i + 2]];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.strokeStyle = BG_COLORS[(i / 3 | 0) % BG_COLORS.length];
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(animate);
}

// Init when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  initBackgroundCanvas();
  console.log('[UI] Background canvas initialized');
});
```

- [ ] **Step 2: Verify background animation**

Open `http://localhost:3000`. Expected: slow-moving wireframe triangle mesh visible in background at low opacity (barely visible against dark bg). Console: `[UI] Background canvas initialized`.

Note: Delaunator is loaded via `<script src="...">` CDN tag — add it to `index.html` before the other scripts:

In `index.html`, add before the gif.js script tag:
```html
<script src="https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add js/ui.js index.html
git commit -m "feat: animated background canvas — drifting Delaunay mesh at low opacity"
```

---

## Task 4: Preset Cards with Animated Thumbnails

**Files:**
- Modify: `js/ui.js`

Each preset card has a small canvas thumbnail showing animated geometric shapes in the preset's palette. No video processing — purely decorative CSS/canvas animation.

- [ ] **Step 1: Define PRESETS_UI array in ui.js (append after background canvas code)**

```js
// ---------- Preset Card Definitions ----------

const PRESETS_UI = [
  {
    id: 'pure-ps1',
    name: 'PURE PS1',
    desc: 'Wobbly geometry, flat triangles, raw color',
    colors: ['#00e5cc', '#9b4dff', '#ff2d78', '#0a0a14', '#1e1e3a'],
    animSpeed: 0.8,
    pointCount: 12,
  },
  {
    id: 'dreamcast',
    name: 'DREAMCAST',
    desc: 'Smooth gradients, clean edges, 128-bit soul',
    colors: ['#c8c8e8', '#9b4dff', '#0a0a14', '#1e1e3a', '#00e5cc'],
    animSpeed: 0.3,
    pointCount: 18,
  },
  {
    id: 'acid-rave',
    name: 'ACID RAVE',
    desc: 'Neon chaos, Bayer dither, no chill',
    colors: ['#39ff14', '#ff00ff', '#ffff00', '#000000', '#111111'],
    animSpeed: 1.5,
    pointCount: 8,
  },
  {
    id: 'vaporwave',
    name: 'VAPORWAVE',
    desc: 'VHS warmth, 1200 polys, color banding dreams',
    colors: ['#ff6b35', '#f7c59f', '#004e89', '#1a2752', '#ffeedd'],
    animSpeed: 0.4,
    pointCount: 22,
  },
  {
    id: 'gameboy',
    name: 'GAMEBOY',
    desc: 'DMG green, chunky 8x8 blocks, 4 colors max',
    colors: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f', '#c4cfa1'],
    animSpeed: 0.2,
    pointCount: 6,
  },
  {
    id: 'glitch-core',
    name: 'GLITCH CORE',
    desc: 'Vertex chaos, z-fighting, interlace flash',
    colors: ['#ff2d78', '#9b4dff', '#00e5cc', '#0a0a14', '#ffffff'],
    animSpeed: 2.0,
    pointCount: 14,
  },
];

// ---------- Preset Card Rendering ----------

function buildPresetCards() {
  const grid = document.getElementById('presets-grid');
  PRESETS_UI.forEach((preset, idx) => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.dataset.presetId = preset.id;

    const canvas = document.createElement('canvas');
    canvas.className = 'preset-thumb';
    canvas.width = 200;
    canvas.height = 70;

    const info = document.createElement('div');
    info.className = 'preset-info';
    info.innerHTML = `
      <span class="preset-name">${preset.name}</span>
      <span class="preset-desc">${preset.desc}</span>
    `;

    card.appendChild(canvas);
    card.appendChild(info);
    grid.appendChild(card);

    animatePresetThumb(canvas, preset);

    card.addEventListener('click', () => selectPreset(preset.id, card));
  });

  // Select first preset by default
  const firstCard = grid.querySelector('.preset-card');
  if (firstCard) selectPreset('pure-ps1', firstCard);
}

function animatePresetThumb(canvas, preset) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const N = preset.pointCount;

  const pts = Array.from({ length: N }, () => ({
    x: Math.random() * W,
    y: Math.random() * H,
    vx: (Math.random() - 0.5) * preset.animSpeed,
    vy: (Math.random() - 0.5) * preset.animSpeed,
  }));
  // Add corners
  pts.push({ x: 0, y: 0, vx: 0, vy: 0 }, { x: W, y: 0, vx: 0, vy: 0 });
  pts.push({ x: 0, y: H, vx: 0, vy: 0 }, { x: W, y: H, vx: 0, vy: 0 });

  let t = 0;
  function draw() {
    requestAnimationFrame(draw);
    t++;
    if (t % 2 !== 0) return; // ~30fps

    for (const p of pts) {
      if (p.vx === 0 && p.vy === 0) continue;
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0 || p.x > W) p.vx *= -1;
      if (p.y < 0 || p.y > H) p.vy *= -1;
    }

    ctx.fillStyle = '#0f0f1e';
    ctx.fillRect(0, 0, W, H);

    if (typeof Delaunator === 'undefined') return;
    const coords = pts.flatMap(p => [p.x, p.y]);
    let d;
    try { d = new Delaunator(coords); } catch(e) { return; }

    for (let i = 0; i < d.triangles.length; i += 3) {
      const a = pts[d.triangles[i]];
      const b = pts[d.triangles[i+1]];
      const c = pts[d.triangles[i+2]];
      const col = preset.colors[(i / 3 | 0) % preset.colors.length];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.fillStyle = col + '99'; // semi-transparent
      ctx.fill();
    }
  }
  draw();
}

function selectPreset(presetId, cardEl) {
  // Remove active from all cards
  document.querySelectorAll('.preset-card').forEach(c => c.classList.remove('active'));
  cardEl.classList.add('active');
  // Apply preset to ENGINE.CONFIG (implemented in Task 7)
  if (window.ENGINE && window.ENGINE.applyPreset) {
    window.ENGINE.applyPreset(presetId);
    syncTweakPanel();
  }
  console.log(`[UI] Preset selected: ${presetId}`);
}
```

- [ ] **Step 2: Call buildPresetCards() in DOMContentLoaded**

Update the `DOMContentLoaded` listener in `ui.js`:

```js
document.addEventListener('DOMContentLoaded', () => {
  initBackgroundCanvas();
  buildPresetCards();
  console.log('[UI] Preset cards built');
});
```

- [ ] **Step 3: Verify preset cards**

Open `http://localhost:3000`. Expected: 6 preset cards in 2×3 grid, each with an animated colored triangle mesh in the thumbnail canvas. Clicking a card highlights it with teal glow. Console: `[UI] Preset cards built`, `[UI] Preset selected: pure-ps1`.

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: preset cards — 6 cards with animated Delaunay thumbnails in preset palettes"
```

---

## Task 5: Video Drop Zone + Status Bar

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add drop zone and status bar functions (append to ui.js)**

```js
// ---------- Status Bar ----------

function setStatus(state, text) {
  // state: 'ready' | 'processing' | 'export-ready' | 'error'
  const badge = document.getElementById('status-badge');
  const label = document.getElementById('status-text');
  badge.className = 'status-badge ' + state;
  label.textContent = text || state.toUpperCase().replace('-', ' ');
}

// ---------- Drop Zone ----------

function initDropZone() {
  const zone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  zone.addEventListener('dragover', e => {
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('video/')) {
      handleVideoFile(file);
    } else {
      showError('Please drop a video file (MP4, MOV, or WebM)');
    }
  });

  zone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleVideoFile(e.target.files[0]);
  });
}

function handleVideoFile(file) {
  console.log(`[UI] Video file selected: ${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  const url = URL.createObjectURL(file);

  // Load into hidden video element for frame extraction
  if (!window._videoEl) {
    const vid = document.createElement('video');
    vid.muted = true;
    vid.style.display = 'none';
    document.body.appendChild(vid);
    window._videoEl = vid;
  }

  window._videoEl.src = url;
  window._videoEl.load();

  window._videoEl.addEventListener('loadedmetadata', () => {
    const { videoWidth, videoHeight, duration } = window._videoEl;
    console.log(`[UI] Video metadata: ${videoWidth}x${videoHeight}, ${duration.toFixed(1)}s`);
    setStatus('ready', `LOADED — ${videoWidth}×${videoHeight} · ${duration.toFixed(1)}S`);

    // Show drop zone as "loaded" state
    const zone = document.getElementById('drop-zone');
    zone.innerHTML = `
      <p class="drop-icon" style="color:var(--teal)">✓</p>
      <p class="drop-text">${file.name}</p>
      <p class="drop-subtext">${videoWidth}×${videoHeight} · ${duration.toFixed(1)}s · <label class="browse-label" for="file-input">CHANGE</label></p>
      <input type="file" id="file-input" accept="video/*" hidden>
    `;
    document.getElementById('file-input').addEventListener('change', e => {
      if (e.target.files[0]) handleVideoFile(e.target.files[0]);
    });

    // Trigger processing if ENGINE is ready
    if (window.ENGINE && window.ENGINE.startProcessing) {
      window.ENGINE.startProcessing(window._videoEl);
    }
  }, { once: true });

  window._videoEl.addEventListener('error', () => {
    showError('Could not decode video. Try MP4 (H.264) or WebM format.');
  }, { once: true });
}

function showError(msg) {
  setStatus('error', 'ERROR');
  const zone = document.getElementById('drop-zone');
  zone.innerHTML = `
    <p class="drop-icon" style="color:var(--pink)">✕</p>
    <p class="drop-text" style="color:var(--pink)">${msg}</p>
    <p class="drop-subtext"><label class="browse-label" for="file-input">TRY AGAIN</label></p>
    <input type="file" id="file-input" accept="video/*" hidden>
  `;
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) handleVideoFile(e.target.files[0]);
  });
  console.error(`[UI] Error: ${msg}`);
}
```

- [ ] **Step 2: Call initDropZone() in DOMContentLoaded**

```js
document.addEventListener('DOMContentLoaded', () => {
  initBackgroundCanvas();
  buildPresetCards();
  initDropZone();
  initTweakPanel(); // defined in Task 11
  initExportPanel(); // defined in Tasks 13-14
  console.log('[UI] Init complete');
});
```

Note: `initTweakPanel` and `initExportPanel` don't exist yet — add stub functions now to prevent errors:

```js
function initTweakPanel() { /* implemented in Task 11 */ }
function initExportPanel() { /* implemented in Tasks 13-14 */ }
function syncTweakPanel() { /* implemented in Task 11 */ }
```

- [ ] **Step 3: Attach setStatus and showError to window.UI**

At the end of the status/drop zone block in `js/ui.js`, add:

```js
// Expose on window.UI so engine.js can call them at runtime
window.UI = window.UI || {};
window.UI.setStatus = setStatus;
window.UI.showError = showError;
```

- [ ] **Step 4: Verify drop zone**

Open `http://localhost:3000`, drag a video file into the drop zone. Expected: border turns teal during drag, file info shows after drop, status badge updates to show video dimensions and duration.

- [ ] **Step 5: Commit**

```bash
git add js/ui.js
git commit -m "feat: drop zone — drag & drop + file browse, video metadata display, status bar, window.UI.setStatus + showError"
```

---

## Task 6: PS1 Workbar Component

**Files:**
- Modify: `js/ui.js`

The shared workbar component used by both the processing pipeline and the export pipeline.

- [ ] **Step 1: Add workbar functions (append to ui.js)**

```js
// ---------- PS1 Workbar ----------

// Shared progress UI — called by engine.js (processing) and export.js (encoding)
// containerId: 'workbar' for processing, 'export-workbar' for export
window.UI = window.UI || {};

window.UI.setProgress = function(containerId, label, pct, sublabel, eta) {
  const bar = document.getElementById(containerId);
  if (!bar) return;
  bar.hidden = false;

  const labelEl = document.getElementById(containerId + '-label');
  const fillEl = document.getElementById(containerId + '-fill');
  const pctEl = document.getElementById(containerId + '-pct');

  if (labelEl) labelEl.textContent = label;
  if (fillEl) fillEl.style.width = pct + '%';
  if (pctEl) pctEl.textContent = Math.round(pct) + '%';

  // ETA and cancel only on main workbar
  if (containerId === 'workbar') {
    const etaEl = document.getElementById('workbar-eta');
    if (etaEl && eta !== undefined) {
      const mins = Math.floor(eta / 60);
      const secs = Math.floor(eta % 60);
      etaEl.textContent = `EST. REMAINING: ${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
    }
  }
};

window.UI.hideProgress = function(containerId) {
  const bar = document.getElementById(containerId);
  if (bar) bar.hidden = true;
};

// Flash a specific worker indicator (0-3)
window.UI.flashWorker = function(workerIndex) {
  const dotsEl = document.getElementById('worker-dots');
  if (!dotsEl) return;
  // Replace the Nth ■ with a temporarily bright version via inline span
  const dots = ['■', '■', '■', '■'];
  dots[workerIndex] = '<span class="worker-dot-active">■</span>';
  dotsEl.innerHTML = dots.join('');
  // Reset after animation
  setTimeout(() => { dotsEl.textContent = '■■■■'; }, 350);
};
```

- [ ] **Step 2: Wire cancel button**

Append to `initDropZone` setup block (or add a separate `initWorkbar` called in DOMContentLoaded):

```js
function initWorkbar() {
  document.getElementById('btn-cancel').addEventListener('click', () => {
    if (window.ENGINE && window.ENGINE.cancelProcessing) {
      window.ENGINE.cancelProcessing();
    }
  });
}
```

Call `initWorkbar()` in `DOMContentLoaded`.

- [ ] **Step 3: Verify workbar manually**

Open browser console, run:
```js
document.getElementById('workbar').hidden = false;
UI.setProgress('workbar', 'PROCESSING FRAME 024 / 180', 13, null, 42);
```
Expected: workbar appears below drop zone, fill bar at 13%, label shows frame count, ETA shows 00:42.

Then run:
```js
UI.flashWorker(2);
```
Expected: 3rd worker square briefly flashes bright teal.

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: PS1 workbar component — ASCII progress bar, ETA, worker pool indicator"
```

---

## Task 7: CONFIG Object + Presets (engine.js)

**Files:**
- Write: `js/engine.js`

- [ ] **Step 1: Write engine.js CONFIG, palettes, and preset functions**

```js
// ============================================================
// POLYMORPH engine.js
// CONFIG, presets, palette data, pipeline orchestration
// ============================================================

// ---------- Palette Data ----------

const PALETTES = {
  ps1dark:  [[0,229,204],[155,77,255],[255,45,120],[10,10,20],[30,30,58],[200,200,232]],
  acid:     [[57,255,20],[255,0,255],[255,255,0],[0,0,0],[17,17,17],[255,255,255]],
  vhswarm:  [[255,107,53],[247,197,159],[239,239,208],[0,78,137],[26,39,82],[255,238,221]],
  dmggreen: [[15,56,15],[48,98,48],[139,172,15],[155,188,15],[196,207,161],[224,240,208]],
  n64:      [[228,3,3],[0,80,240],[0,216,0],[255,255,255],[255,153,0],[0,0,0]],
  original: null, // signals "no palette snapping"
};

// ---------- CONFIG (single source of truth) ----------

const CONFIG = {
  polygonDensity:  600,
  edgeSensitivity: 70,
  colorDepth:      24,
  affineWarp:      80,
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
  // Set during frame extraction:
  sourceWidth:     0,
  sourceHeight:    0,
  totalFrames:     0,
};

// ---------- Presets ----------

const PRESETS = {
  'pure-ps1': () => Object.assign(CONFIG, {
    polygonDensity: 600, edgeSensitivity: 70, colorDepth: 24,
    affineWarp: 80, ditherStrength: 0, vertexJitter: 30,
    scanlines: true, colorBanding: false, zFighting: false,
    interlaceFlash: false, fogEffect: false, subpixelWobble: false,
    renderStyle: 'flat', palette: 'ps1dark',
  }),
  'dreamcast': () => Object.assign(CONFIG, {
    polygonDensity: 900, edgeSensitivity: 60, colorDepth: 48,
    affineWarp: 20, ditherStrength: 0, vertexJitter: 10,
    scanlines: false, colorBanding: false, zFighting: false,
    interlaceFlash: false, fogEffect: false, subpixelWobble: false,
    renderStyle: 'gouraud', palette: 'ps1dark',
  }),
  'acid-rave': () => Object.assign(CONFIG, {
    polygonDensity: 400, edgeSensitivity: 50, colorDepth: 32,
    affineWarp: 0, ditherStrength: 80, vertexJitter: 0,
    scanlines: false, colorBanding: false, zFighting: false,
    interlaceFlash: false, fogEffect: false, subpixelWobble: false,
    renderStyle: 'dither', palette: 'acid',
  }),
  'vaporwave': () => Object.assign(CONFIG, {
    polygonDensity: 1200, edgeSensitivity: 80, colorDepth: 64,
    affineWarp: 10, ditherStrength: 0, vertexJitter: 5,
    scanlines: false, colorBanding: true, zFighting: false,
    interlaceFlash: false, fogEffect: false, subpixelWobble: false,
    renderStyle: 'vector', palette: 'vhswarm',
  }),
  'gameboy': () => Object.assign(CONFIG, {
    polygonDensity: 300, edgeSensitivity: 40, colorDepth: 4,
    affineWarp: 0, ditherStrength: 0, vertexJitter: 0,
    scanlines: false, colorBanding: false, zFighting: false,
    interlaceFlash: false, fogEffect: false, subpixelWobble: false,
    renderStyle: 'chunky', palette: 'dmggreen',
  }),
  'glitch-core': () => Object.assign(CONFIG, {
    polygonDensity: 800, edgeSensitivity: 65, colorDepth: 32,
    affineWarp: 40, ditherStrength: 0, vertexJitter: 80,
    scanlines: false, colorBanding: false, zFighting: true,
    interlaceFlash: true, fogEffect: false, subpixelWobble: false,
    renderStyle: 'flat', palette: 'ps1dark',
  }),
};

// ---------- Expose ENGINE API ----------

window.ENGINE = {
  CONFIG,
  PALETTES,
  processedFrames: [],
  isProcessing: false,

  applyPreset(presetId) {
    if (PRESETS[presetId]) {
      PRESETS[presetId]();
      console.log(`[ENGINE] Preset applied: ${presetId}`, { ...CONFIG });
    }
  },

  startProcessing: null,   // assigned in Task 9
  cancelProcessing: null,  // assigned in Task 9
};

console.log('[ENGINE] engine.js loaded — CONFIG and presets ready');
```

- [ ] **Step 2: Verify CONFIG and presets**

Open browser console:
```js
ENGINE.applyPreset('gameboy');
console.log(ENGINE.CONFIG.palette, ENGINE.CONFIG.polygonDensity);
// Expected: "dmggreen"  300

ENGINE.applyPreset('vaporwave');
console.log(ENGINE.CONFIG.renderStyle, ENGINE.CONFIG.colorBanding);
// Expected: "vector"  true
```

- [ ] **Step 3: Commit**

```bash
git add js/engine.js
git commit -m "feat: CONFIG object — all 6 presets, palette data, ENGINE API stub"
```

---

## Task 8: PS1 Worker Pipeline (worker.js)

**Files:**
- Write: `js/worker.js`

This is the core of the app. The worker receives raw pixel data and returns colored triangle objects.

- [ ] **Step 1: Write complete worker.js**

```js
// ============================================================
// POLYMORPH worker.js
// Full PS1 pipeline: Sobel → Points → Delaunator → Color → FX
// ============================================================

importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');

// ---------- Palette Data (duplicated from engine.js — workers are isolated) ----------

const PALETTES = {
  ps1dark:  [[0,229,204],[155,77,255],[255,45,120],[10,10,20],[30,30,58],[200,200,232]],
  acid:     [[57,255,20],[255,0,255],[255,255,0],[0,0,0],[17,17,17],[255,255,255]],
  vhswarm:  [[255,107,53],[247,197,159],[239,239,208],[0,78,137],[26,39,82],[255,238,221]],
  dmggreen: [[15,56,15],[48,98,48],[139,172,15],[155,188,15],[196,207,161],[224,240,208]],
  n64:      [[228,3,3],[0,80,240],[0,216,0],[255,255,255],[255,153,0],[0,0,0]],
};

// ---------- Step 1: Sobel Edge Detection ----------

function sobelEdgeDetect(pixels, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = pixels[o] * 0.299 + pixels[o+1] * 0.587 + pixels[o+2] * 0.114;
  }

  const edge = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y-1)*width + (x-1)], t  = gray[(y-1)*width + x], tr = gray[(y-1)*width + (x+1)];
      const ml = gray[ y   *width + (x-1)],                               mr = gray[ y   *width + (x+1)];
      const bl = gray[(y+1)*width + (x-1)], b  = gray[(y+1)*width + x], br = gray[(y+1)*width + (x+1)];
      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*t  - tr + bl + 2*b  + br;
      edge[y * width + x] = Math.sqrt(gx*gx + gy*gy);
    }
  }
  return edge;
}

// ---------- Step 2: Point Sampling ----------

function samplePoints(edgeMap, width, height, density, edgeSensitivity) {
  const pts = [];
  const edgeCount    = Math.floor(density * edgeSensitivity / 100);
  const randomCount  = density - edgeCount;

  // Find high-edge candidates (top ~20% of gradient magnitudes)
  let maxEdge = 0;
  for (let i = 0; i < edgeMap.length; i++) if (edgeMap[i] > maxEdge) maxEdge = edgeMap[i];
  const threshold = maxEdge * 0.2;
  const candidates = [];
  for (let i = 0; i < edgeMap.length; i++) if (edgeMap[i] >= threshold) candidates.push(i);

  // Edge-biased points
  for (let i = 0; i < edgeCount; i++) {
    if (candidates.length === 0) break;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    pts.push(idx % width, Math.floor(idx / width));
  }

  // Random jitter points
  for (let i = 0; i < randomCount; i++) {
    pts.push(Math.random() * width, Math.random() * height);
  }

  // Always include corners (prevents empty triangulation edges)
  pts.push(0, 0, width-1, 0, 0, height-1, width-1, height-1);

  return pts;
}

// ---------- Step 4 helpers: Color Sampling ----------

function sampleRGB(pixels, width, height, x, y) {
  const px = Math.max(0, Math.min(width-1,  Math.round(x)));
  const py = Math.max(0, Math.min(height-1, Math.round(y)));
  const i  = (py * width + px) * 4;
  return [pixels[i], pixels[i+1], pixels[i+2]];
}

function nearestPaletteColor(rgb, palette) {
  let minDist = Infinity, best = palette[0];
  for (const c of palette) {
    const d = (rgb[0]-c[0])**2 + (rgb[1]-c[1])**2 + (rgb[2]-c[2])**2;
    if (d < minDist) { minDist = d; best = c; }
  }
  return [best[0], best[1], best[2]];
}

// ---------- Step 5 helpers: PS1 Effects ----------

const BAYER4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

function applyQuantization(rgb, colorDepth) {
  const step = Math.max(1, Math.round(256 / colorDepth));
  return [
    Math.min(255, Math.round(rgb[0] / step) * step),
    Math.min(255, Math.round(rgb[1] / step) * step),
    Math.min(255, Math.round(rgb[2] / step) * step),
  ];
}

function applyColorBanding(rgb) {
  return [
    Math.floor(rgb[0] / 85) * 85,
    Math.floor(rgb[1] / 85) * 85,
    Math.floor(rgb[2] / 85) * 85,
  ];
}

function applyFog(rgb, cy, frameHeight) {
  const strength = Math.min(0.8, (cy / frameHeight) * 0.6);
  return [
    Math.round(rgb[0] * (1 - strength) + 10 * strength),
    Math.round(rgb[1] * (1 - strength) + 10 * strength),
    Math.round(rgb[2] * (1 - strength) + 20 * strength),
  ];
}

function applyDither(rgb, cx, cy, strength) {
  const bx = Math.floor(cx) & 3;
  const by = Math.floor(cy) & 3;
  const threshold = (BAYER4[by * 4 + bx] / 16 - 0.5) * strength * 1.5;
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0] + threshold * 64))),
    Math.max(0, Math.min(255, Math.round(rgb[1] + threshold * 64))),
    Math.max(0, Math.min(255, Math.round(rgb[2] + threshold * 64))),
  ];
}

function rgbToCSS(rgb) {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

// ---------- Main Pipeline ----------

self.onmessage = function({ data }) {
  const { frameIndex, buffer, width, height, config } = data;
  const pixels = new Uint8ClampedArray(buffer);

  console.log(`[WORKER] Processing frame ${frameIndex} — ${width}x${height}, density=${config.polygonDensity}`);

  // Step 1: Sobel
  const edgeMap = sobelEdgeDetect(pixels, width, height);

  // Step 2: Point sampling
  const flatPts = samplePoints(edgeMap, width, height, config.polygonDensity, config.edgeSensitivity);

  // Step 3: Delaunay triangulation
  let delaunay;
  try {
    delaunay = new Delaunator(flatPts);
  } catch (e) {
    console.error('[WORKER] Delaunator failed:', e);
    self.postMessage({ frameIndex, triangles: [], width, height });
    return;
  }

  // Step 4 + 5: Color sampling + effects
  const palette = config.palette !== 'original' ? PALETTES[config.palette] : null;
  const triangles = [];

  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const i0 = delaunay.triangles[i]   * 2;
    const i1 = delaunay.triangles[i+1] * 2;
    const i2 = delaunay.triangles[i+2] * 2;

    // Original vertex positions
    let x0 = flatPts[i0], y0 = flatPts[i0+1];
    let x1 = flatPts[i1], y1 = flatPts[i1+1];
    let x2 = flatPts[i2], y2 = flatPts[i2+1];
    const cx = (x0+x1+x2)/3;
    const cy = (y0+y1+y2)/3;

    // --- Effect: Affine Warp (geometry) ---
    if (config.affineWarp > 0) {
      const ws = config.affineWarp * 0.015;
      x0 += Math.sin(frameIndex * 0.1 + i0 * 0.7) * ws;
      y0 += Math.cos(frameIndex * 0.1 + i0 * 0.5) * ws;
      x1 += Math.sin(frameIndex * 0.1 + i1 * 0.7) * ws;
      y1 += Math.cos(frameIndex * 0.1 + i1 * 0.5) * ws;
      x2 += Math.sin(frameIndex * 0.1 + i2 * 0.7) * ws;
      y2 += Math.cos(frameIndex * 0.1 + i2 * 0.5) * ws;
    }

    // --- Effect: Vertex Jitter (geometry) ---
    if (config.vertexJitter > 0) {
      const j = config.vertexJitter * 0.08;
      x0 += (Math.random()-0.5)*j; y0 += (Math.random()-0.5)*j;
      x1 += (Math.random()-0.5)*j; y1 += (Math.random()-0.5)*j;
      x2 += (Math.random()-0.5)*j; y2 += (Math.random()-0.5)*j;
    }

    // --- Effect: Sub-pixel Wobble (geometry) ---
    if (config.subpixelWobble) {
      const w = Math.sin(frameIndex * 0.3) * 0.5;
      x0 += w; x1 += w; x2 += w;
    }

    // --- Color Sampling (at warped vertex positions + centroid) ---
    let c0 = sampleRGB(pixels, width, height, x0, y0);
    let c1 = sampleRGB(pixels, width, height, x1, y1);
    let c2 = sampleRGB(pixels, width, height, x2, y2);
    let cc = sampleRGB(pixels, width, height, cx, cy);

    // Apply palette snapping
    if (palette) {
      c0 = nearestPaletteColor(c0, palette);
      c1 = nearestPaletteColor(c1, palette);
      c2 = nearestPaletteColor(c2, palette);
      cc = nearestPaletteColor(cc, palette);
    }

    // --- Effect: Color Quantization ---
    if (config.colorDepth < 255) {
      c0 = applyQuantization(c0, config.colorDepth);
      c1 = applyQuantization(c1, config.colorDepth);
      c2 = applyQuantization(c2, config.colorDepth);
      cc = applyQuantization(cc, config.colorDepth);
    }

    // --- Effect: Color Banding ---
    if (config.colorBanding) {
      c0 = applyColorBanding(c0);
      c1 = applyColorBanding(c1);
      c2 = applyColorBanding(c2);
      cc = applyColorBanding(cc);
    }

    // --- Effect: Fog (centroid color only) ---
    if (config.fogEffect) {
      cc = applyFog(cc, cy, height);
    }

    // --- Effect: Dithering (centroid color) ---
    if (config.ditherStrength > 0) {
      cc = applyDither(cc, cx, cy, config.ditherStrength / 100);
    }

    triangles.push({
      verts:  [x0, y0, x1, y1, x2, y2],
      colors: [rgbToCSS(cc), rgbToCSS(c0), rgbToCSS(c1), rgbToCSS(c2)],
      // colors[0] = centroid (used by flat, dither, vector, chunky)
      // colors[1..3] = vertices (used by gouraud)
      interlaceDim: config.interlaceFlash && (frameIndex % 2 === 1) && ((i/3 | 0) % 2 === 0),
    });
  }

  // --- Effect: Z-Fighting (swap 2 random triangle color pairs) ---
  if (config.zFighting && triangles.length > 4) {
    for (let k = 0; k < 3; k++) {
      const a = Math.floor(Math.random() * triangles.length);
      const b = Math.floor(Math.random() * triangles.length);
      if (a !== b) {
        const tmp = triangles[a].colors;
        triangles[a].colors = triangles[b].colors;
        triangles[b].colors = tmp;
      }
    }
  }

  self.postMessage({ frameIndex, triangles, width, height });
};
```

- [ ] **Step 2: Verify worker loads**

Open browser Network tab. Confirm `js/worker.js` returns 200 and Delaunator CDN script loads. No syntax errors on page load.

Direct test — paste in console:
```js
const w = new Worker('js/worker.js');
w.onerror = e => console.error('Worker error:', e);
w.onmessage = e => console.log('Worker response:', e.data.triangles.length, 'triangles');

// Create a tiny 10x10 test frame
const canvas = document.createElement('canvas');
canvas.width = 10; canvas.height = 10;
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#ff0000'; ctx.fillRect(0,0,10,10);
const id = ctx.getImageData(0,0,10,10);
const buf = id.data.buffer.slice(0);

w.postMessage({
  frameIndex: 0,
  buffer: buf,
  width: 10,
  height: 10,
  config: { ...ENGINE.CONFIG }
}, [buf]);
```
Expected: console logs `Worker response: N triangles` (any positive number).

- [ ] **Step 3: Commit**

```bash
git add js/worker.js
git commit -m "feat: worker.js — full PS1 pipeline: Sobel, point sampling, Delaunator, color sampling, all FX effects"
```

---

## Task 9: Worker Pool + Frame Extraction (engine.js)

**Files:**
- Modify: `js/engine.js`

Append to `engine.js` after the PRESETS block.

- [ ] **Step 1: Add worker pool manager**

```js
// ---------- Worker Pool ----------

const WORKER_COUNT = 4;
const workers = [];
const workerBusy = new Array(WORKER_COUNT).fill(false);

function initWorkerPool() {
  for (let i = 0; i < WORKER_COUNT; i++) {
    const w = new Worker('js/worker.js');
    w.onmessage = ({ data }) => handleWorkerResult(i, data);
    w.onerror   = (e) => {
      console.error(`[ENGINE] Worker ${i} error:`, e);
      workerBusy[i] = false;
    };
    workers.push(w);
  }
  console.log(`[ENGINE] Worker pool initialized — ${WORKER_COUNT} workers`);
}

let pendingResults = new Map();  // frameIndex → result
let expectedFrames = 0;
let completedFrames = 0;
let processingStartTime = 0;
let cancelled = false;
let onFrameComplete = null; // callback(frameIndex, totalFrames)

function handleWorkerResult(workerIdx, data) {
  workerBusy[workerIdx] = false;
  if (cancelled) return;

  const { frameIndex, triangles, width, height } = data;
  pendingResults.set(frameIndex, { frameIndex, triangles, width, height });

  // Flash worker indicator
  if (window.UI && window.UI.flashWorker) window.UI.flashWorker(workerIdx);

  // Flush sequential results to processedFrames
  while (pendingResults.has(window.ENGINE.processedFrames.length)) {
    const result = pendingResults.get(window.ENGINE.processedFrames.length);
    window.ENGINE.processedFrames.push(result);
    pendingResults.delete(result.frameIndex);
  }

  completedFrames++;
  const pct = (completedFrames / expectedFrames) * 100;
  const elapsed = (Date.now() - processingStartTime) / 1000;
  const eta = elapsed / completedFrames * (expectedFrames - completedFrames);

  const label = `PROCESSING FRAME ${String(completedFrames).padStart(3,'0')} / ${expectedFrames}`;
  if (window.UI) window.UI.setProgress('workbar', label, pct, null, eta);

  // Live preview: draw the latest completed frame
  if (window.UI && window.UI.drawLatestFrame) window.UI.drawLatestFrame();

  if (onFrameComplete) onFrameComplete(completedFrames, expectedFrames);

  if (completedFrames === expectedFrames) {
    finishProcessing();
  }
}

function terminateWorkers() {
  workers.forEach(w => w.terminate());
  workers.length = 0;
  workerBusy.fill(false);
  // Re-init pool so it's ready for next video
  initWorkerPool();
}
```

- [ ] **Step 2: Add frame extraction**

```js
// ---------- Frame Extraction ----------

const PROCESSING_WIDTH  = 640; // max processing resolution

function extractFrames(videoEl) {
  return new Promise((resolve) => {
    const vid = videoEl;
    const srcW = vid.videoWidth;
    const srcH = vid.videoHeight;

    // Compute processing dimensions (downscale to max 640px wide)
    const scale  = Math.min(1, PROCESSING_WIDTH / srcW);
    const procW  = Math.round(srcW * scale);
    const procH  = Math.round(srcH * scale);

    const fps    = CONFIG.targetFPS;
    const duration = vid.duration;
    const total  = Math.floor(duration * fps);

    CONFIG.sourceWidth  = srcW;
    CONFIG.sourceHeight = srcH;
    CONFIG.totalFrames  = total;

    console.log(`[ENGINE] Extracting ${total} frames at ${procW}×${procH} (source: ${srcW}×${srcH})`);

    const canvas = document.createElement('canvas');
    canvas.width  = procW;
    canvas.height = procH;
    const ctx = canvas.getContext('2d');

    const frames = [];
    let frameIdx = 0;

    function seekNext() {
      if (frameIdx >= total) {
        resolve(frames);
        return;
      }
      vid.currentTime = frameIdx / fps;
    }

    vid.onseeked = () => {
      ctx.drawImage(vid, 0, 0, procW, procH);
      const id = ctx.getImageData(0, 0, procW, procH);
      frames.push({ frameIndex: frameIdx, buffer: id.data.buffer.slice(0), width: procW, height: procH });
      frameIdx++;
      seekNext();
    };

    vid.onseeked = () => {
      ctx.drawImage(vid, 0, 0, procW, procH);
      const id = ctx.getImageData(0, 0, procW, procH);
      frames.push({ frameIndex: frameIdx, buffer: id.data.buffer.slice(0), width: procW, height: procH });
      frameIdx++;
      seekNext();
    };

    seekNext();
  });
}
```

- [ ] **Step 3: Add startProcessing + cancelProcessing**

```js
// ---------- Pipeline Orchestration ----------

async function startProcessing(videoEl) {
  if (window.ENGINE.isProcessing) return;
  window.ENGINE.isProcessing = true;
  window.ENGINE.processedFrames = [];
  cancelled = false;
  completedFrames = 0;
  pendingResults.clear();
  processingStartTime = Date.now();

  // Update UI
  document.getElementById('drop-zone').hidden    = true;
  document.getElementById('workbar').hidden      = false;
  document.getElementById('output-canvas').hidden = false;
  if (window.UI) window.UI.setStatus('processing', 'PROCESSING');

  console.log('[ENGINE] Starting processing pipeline...');

  // Extract all frames first
  if (window.UI) window.UI.setProgress('workbar', 'EXTRACTING FRAMES...', 0);
  let frames;
  try {
    frames = await extractFrames(videoEl);
  } catch (e) {
    console.error('[ENGINE] Frame extraction failed:', e);
    if (window.UI) window.UI.showError('Frame extraction failed: ' + e.message);
    window.ENGINE.isProcessing = false;
    return;
  }

  if (cancelled) { window.ENGINE.isProcessing = false; return; }

  expectedFrames = frames.length;
  console.log(`[ENGINE] Extracted ${expectedFrames} frames — dispatching to worker pool`);

  // Resize output canvas to source dimensions
  const outputCanvas = document.getElementById('output-canvas');
  outputCanvas.width  = CONFIG.sourceWidth;
  outputCanvas.height = CONFIG.sourceHeight;

  // Dispatch frames round-robin to workers
  const configSnapshot = { ...CONFIG };
  frames.forEach(f => {
    const workerIdx = f.frameIndex % WORKER_COUNT;
    workers[workerIdx].postMessage({
      frameIndex: f.frameIndex,
      buffer:     f.buffer,
      width:      f.width,
      height:     f.height,
      config:     configSnapshot,
    }, [f.buffer]); // transfer buffer zero-copy
  });
}

function cancelProcessing() {
  cancelled = true;
  window.ENGINE.isProcessing = false;
  terminateWorkers();
  document.getElementById('workbar').hidden = true;
  document.getElementById('drop-zone').hidden = false;
  if (window.UI) window.UI.setStatus('ready', 'CANCELLED');
  console.log('[ENGINE] Processing cancelled');

  // If we have partial frames, still enable export
  if (window.ENGINE.processedFrames.length > 0) finishProcessing();
}

function finishProcessing() {
  window.ENGINE.isProcessing = false;
  document.getElementById('workbar').hidden = true;
  document.getElementById('playback-panel').hidden = false;

  const n = window.ENGINE.processedFrames.length;
  console.log(`[ENGINE] Processing complete — ${n} frames ready`);

  if (window.UI) {
    window.UI.setStatus('export-ready', `EXPORT READY — ${n} FRAMES`);
    window.UI.onProcessingComplete(n);
  }
}

// ---------- Assign to ENGINE API ----------

window.ENGINE.startProcessing  = startProcessing;
window.ENGINE.cancelProcessing = cancelProcessing;

// Boot worker pool immediately
initWorkerPool();
```

- [ ] **Step 4: Add stub for UI.onProcessingComplete + UI.drawLatestFrame in ui.js**

Append to `js/ui.js` (before DOMContentLoaded or as standalone functions):

```js
// Stubs — implemented fully in Tasks 10 and 12
window.UI = window.UI || {};

window.UI.drawLatestFrame = function() {
  const frames = window.ENGINE && window.ENGINE.processedFrames;
  if (!frames || frames.length === 0) return;
  const frame = frames[frames.length - 1];
  const canvas = document.getElementById('output-canvas');
  if (!canvas || canvas.hidden) return;
  drawFrame(canvas.getContext('2d'), frame, ENGINE.CONFIG, canvas.width, canvas.height);
};

window.UI.onProcessingComplete = function(frameCount) {
  document.getElementById('btn-mp4').disabled = false;
  document.getElementById('btn-gif').disabled  = false;
  const frames = window.ENGINE.processedFrames;
  updateExportEstimates(frames.length, ENGINE.CONFIG.targetFPS);
  console.log(`[UI] Processing complete — ${frameCount} frames, export enabled`);
};

function drawFrame(ctx, frame, config, outW, outH) {
  // Implemented in Task 10
}

function updateExportEstimates(frameCount, fps) {
  // Implemented in Tasks 13-14
}
```

- [ ] **Step 5: Verify worker pool**

Open browser console after dropping a short video (< 5 seconds recommended for testing). Expected:
```
[ENGINE] Worker pool initialized — 4 workers
[ENGINE] Extracting N frames at 640x360 (source: 1920x1080)
[ENGINE] Extracted N frames — dispatching to worker pool
[WORKER] Processing frame 0 — 640x360, density=600
[WORKER] Processing frame 1 — 640x360, density=600
... (multiple frames in parallel)
[ENGINE] Processing complete — N frames ready
```

Worker pool indicator in workbar should flash as each worker completes.

- [ ] **Step 6: Commit**

```bash
git add js/engine.js js/ui.js
git commit -m "feat: worker pool + frame extraction — 4-worker round-robin pipeline, video frame seeking, processing orchestration"
```

---

## Task 10: Triangle Renderer — All 6 Render Styles

**Files:**
- Modify: `js/ui.js`

Replace the stub `drawFrame` function with the full implementation.

- [ ] **Step 1: Replace stub drawFrame in ui.js**

```js
// ---------- Triangle Renderer ----------

const BAYER4_MAIN = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
];

function drawFrame(ctx, frame, config, outW, outH) {
  if (!frame || !frame.triangles || frame.triangles.length === 0) return;

  const scaleX = outW / frame.width;
  const scaleY = outH / frame.height;

  if (config.renderStyle === 'chunky') {
    drawFrameChunky(ctx, frame, config, outW, outH);
    return;
  }

  ctx.clearRect(0, 0, outW, outH);

  for (let t = 0; t < frame.triangles.length; t++) {
    const tri = frame.triangles[t];
    const [x0,y0, x1,y1, x2,y2] = tri.verts;

    const sx0 = x0 * scaleX, sy0 = y0 * scaleY;
    const sx1 = x1 * scaleX, sy1 = y1 * scaleY;
    const sx2 = x2 * scaleX, sy2 = y2 * scaleY;

    // Interlace flash — dim even triangles on odd frames
    const alpha = tri.interlaceDim ? 0.5 : 1.0;

    ctx.beginPath();
    ctx.moveTo(sx0, sy0);
    ctx.lineTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.closePath();

    switch (config.renderStyle) {
      case 'flat':
      default:
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
        if (alpha < 1) ctx.globalAlpha = 1;
        break;

      case 'wireframe':
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.strokeStyle = tri.colors[0];
        ctx.lineWidth = 0.5;
        ctx.stroke();
        if (alpha < 1) ctx.globalAlpha = 1;
        break;

      case 'gouraud': {
        // Approximate Gouraud: blend between vertex colors using two gradients
        const grad = ctx.createLinearGradient(sx0, sy0, sx2, sy2);
        grad.addColorStop(0,   tri.colors[1]);
        grad.addColorStop(0.5, tri.colors[2]);
        grad.addColorStop(1,   tri.colors[3]);
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.fillStyle = grad;
        ctx.fill();
        if (alpha < 1) ctx.globalAlpha = 1;
        break;
      }

      case 'dither': {
        // Flat fill first
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
        // Bayer dither overlay — draw 1px dots at dither positions
        const cx = ((sx0+sx1+sx2)/3)|0;
        const cy = ((sy0+sy1+sy2)/3)|0;
        const bval = BAYER4_MAIN[(cy&3)*4 + (cx&3)] / 16;
        const darken = bval < 0.5 ? 0.0 : 0.3;
        if (darken > 0) {
          ctx.fillStyle = `rgba(0,0,0,${darken})`;
          ctx.fill();
        }
        if (alpha < 1) ctx.globalAlpha = 1;
        break;
      }

      case 'vector':
        if (alpha < 1) ctx.globalAlpha = alpha;
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
        ctx.strokeStyle = tri.colors[0];
        ctx.lineWidth = 0.5;
        ctx.stroke();
        if (alpha < 1) ctx.globalAlpha = 1;
        break;
    }
  }
}

function drawFrameChunky(ctx, frame, config, outW, outH) {
  // Draw at 1/8 scale, then scale up with pixelation
  const smallW = Math.max(1, Math.round(outW / 8));
  const smallH = Math.max(1, Math.round(outH / 8));

  const offscreen = document.createElement('canvas');
  offscreen.width  = smallW;
  offscreen.height = smallH;
  const offCtx = offscreen.getContext('2d');

  const scaleX = smallW / frame.width;
  const scaleY = smallH / frame.height;

  offCtx.clearRect(0, 0, smallW, smallH);
  for (const tri of frame.triangles) {
    const [x0,y0, x1,y1, x2,y2] = tri.verts;
    offCtx.beginPath();
    offCtx.moveTo(x0*scaleX, y0*scaleY);
    offCtx.lineTo(x1*scaleX, y1*scaleY);
    offCtx.lineTo(x2*scaleX, y2*scaleY);
    offCtx.closePath();
    offCtx.fillStyle = tri.colors[0];
    offCtx.fill();
  }

  ctx.clearRect(0, 0, outW, outH);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(offscreen, 0, 0, outW, outH);
}
```

- [ ] **Step 2: Verify rendering**

Process a short video. After processing completes, open console:
```js
// Manually draw a frame to verify
const frame = ENGINE.processedFrames[0];
const canvas = document.getElementById('output-canvas');
const ctx = canvas.getContext('2d');
drawFrame(ctx, frame, ENGINE.CONFIG, canvas.width, canvas.height);
```
Expected: triangulated low-poly version of the first video frame visible in the output canvas.

Test all render styles:
```js
['flat','wireframe','gouraud','dither','chunky','vector'].forEach(style => {
  ENGINE.CONFIG.renderStyle = style;
  drawFrame(ctx, frame, ENGINE.CONFIG, canvas.width, canvas.height);
  console.log('Rendered:', style);
});
```

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: triangle renderer — all 6 render styles: flat, wireframe, gouraud, dither, chunky, vector"
```

---

## Task 11: Tweak Panel

**Files:**
- Modify: `js/ui.js`

Replace the stub `initTweakPanel` and `syncTweakPanel` functions.

- [ ] **Step 1: Replace stub initTweakPanel in ui.js**

```js
// ---------- Tweak Panel ----------

let sliderDebounceTimers = {};

function initTweakPanel() {
  // Toggle collapse
  document.getElementById('tweak-toggle').addEventListener('click', () => {
    const panel = document.getElementById('tweak-panel');
    const btn   = document.getElementById('tweak-toggle');
    panel.hidden = !panel.hidden;
    btn.textContent = (panel.hidden ? '▼' : '▲') + ' TWEAK PARAMETERS';
  });

  // Sliders
  const sliderMap = {
    'sl-density': { key: 'polygonDensity', valId: 'val-density' },
    'sl-edge':    { key: 'edgeSensitivity', valId: 'val-edge'    },
    'sl-depth':   { key: 'colorDepth',      valId: 'val-depth'   },
    'sl-warp':    { key: 'affineWarp',       valId: 'val-warp'    },
    'sl-dither':  { key: 'ditherStrength',   valId: 'val-dither'  },
    'sl-jitter':  { key: 'vertexJitter',     valId: 'val-jitter'  },
  };

  for (const [sliderId, { key, valId }] of Object.entries(sliderMap)) {
    const slider = document.getElementById(sliderId);
    slider.addEventListener('input', () => {
      const val = parseInt(slider.value, 10);
      document.getElementById(valId).textContent = val;
      // Debounce CONFIG update
      clearTimeout(sliderDebounceTimers[sliderId]);
      sliderDebounceTimers[sliderId] = setTimeout(() => {
        ENGINE.CONFIG[key] = val;
        console.log(`[UI] CONFIG.${key} = ${val}`);
      }, 300);
    });
  }

  // FX Toggles (pills)
  document.querySelectorAll('.pill[data-fx]').forEach(pill => {
    pill.addEventListener('click', () => {
      const fx = pill.dataset.fx;
      const newVal = !ENGINE.CONFIG[fx];
      ENGINE.CONFIG[fx] = newVal;
      pill.classList.toggle('active', newVal);
      // Special case: scanlines toggle shows/hides the CSS ::after overlay
      if (fx === 'scanlines') {
        document.body.classList.toggle('no-scanlines', !newVal);
      }
      console.log(`[UI] FX toggle: ${fx} = ${newVal}`);
    });
  });

  // Render Style (radio)
  document.querySelectorAll('input[name="renderStyle"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ENGINE.CONFIG.renderStyle = radio.value;
      console.log(`[UI] Render style: ${radio.value}`);
    });
  });

  // Palette (radio)
  document.querySelectorAll('input[name="palette"]').forEach(radio => {
    radio.addEventListener('change', () => {
      ENGINE.CONFIG.palette = radio.value;
      console.log(`[UI] Palette: ${radio.value}`);
    });
  });
}

function syncTweakPanel() {
  // Sync UI controls to current CONFIG values (called after preset selection)
  const C = ENGINE.CONFIG;
  const setSlider = (id, valId, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
    const ve = document.getElementById(valId);
    if (ve) ve.textContent = val;
  };
  setSlider('sl-density', 'val-density', C.polygonDensity);
  setSlider('sl-edge',    'val-edge',    C.edgeSensitivity);
  setSlider('sl-depth',   'val-depth',   C.colorDepth);
  setSlider('sl-warp',    'val-warp',    C.affineWarp);
  setSlider('sl-dither',  'val-dither',  C.ditherStrength);
  setSlider('sl-jitter',  'val-jitter',  C.vertexJitter);

  // FX pills
  document.querySelectorAll('.pill[data-fx]').forEach(pill => {
    pill.classList.toggle('active', !!C[pill.dataset.fx]);
  });

  // Render style radio
  const rsRadio = document.querySelector(`input[name="renderStyle"][value="${C.renderStyle}"]`);
  if (rsRadio) rsRadio.checked = true;

  // Palette radio
  const palRadio = document.querySelector(`input[name="palette"][value="${C.palette}"]`);
  if (palRadio) palRadio.checked = true;
}
```

- [ ] **Step 2: Verify tweak panel**

Open the app, click "▼ TWEAK PARAMETERS". Expected: panel expands showing sliders, FX pills, render style radios, palette radios.

Select "GAMEBOY" preset, then open tweak panel — verify:
- Polygon Density slider is at 300
- Color Depth slider is at 4
- Render Style "CHUNKY" is selected
- Palette "DMG GREEN" is selected

Move the Polygon Density slider. After 300ms, console shows: `[UI] CONFIG.polygonDensity = <new value>`

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: tweak panel — 6 sliders with debounce, FX toggles, render style + palette selectors, preset sync"
```

---

## Task 12: Playback Panel

**Files:**
- Modify: `js/ui.js`

- [ ] **Step 1: Add playback functions (append to ui.js)**

```js
// ---------- Playback ----------

let playbackRAF = null;
let playbackFrameIdx = 0;
let playbackLastTime = 0;

function initPlayback() {
  document.getElementById('btn-play-loop').addEventListener('click', startPlayback);
  document.getElementById('btn-stop').addEventListener('click', stopPlayback);
}

function startPlayback() {
  if (playbackRAF) return;
  playbackFrameIdx = 0;
  console.log('[UI] Playback started');

  function loop(now) {
    playbackRAF = requestAnimationFrame(loop);
    const msPerFrame = 1000 / ENGINE.CONFIG.targetFPS;
    if (now - playbackLastTime < msPerFrame) return;
    playbackLastTime = now;

    const frames = ENGINE.processedFrames;
    if (!frames || frames.length === 0) return;

    playbackFrameIdx = playbackFrameIdx % frames.length;
    const frame = frames[playbackFrameIdx];

    const canvas = document.getElementById('output-canvas');
    drawFrame(canvas.getContext('2d'), frame, ENGINE.CONFIG, canvas.width, canvas.height);

    document.getElementById('playback-info').textContent =
      `FRAME ${playbackFrameIdx + 1} / ${frames.length}`;

    playbackFrameIdx++;
  }

  playbackRAF = requestAnimationFrame(loop);
}

function stopPlayback() {
  if (playbackRAF) {
    cancelAnimationFrame(playbackRAF);
    playbackRAF = null;
  }
  console.log('[UI] Playback stopped');
}
```

- [ ] **Step 2: Call initPlayback() in DOMContentLoaded**

```js
document.addEventListener('DOMContentLoaded', () => {
  initBackgroundCanvas();
  buildPresetCards();
  initDropZone();
  initWorkbar();
  initTweakPanel();
  initPlayback();
  initExportPanel();
  console.log('[UI] Init complete');
});
```

- [ ] **Step 3: Verify playback**

Process a short video. After processing, click "▶ LOOP". Expected: output canvas cycles through processed frames at 30fps. "FRAME N / M" counter updates. "■ STOP" halts playback.

- [ ] **Step 4: Commit**

```bash
git add js/ui.js
git commit -m "feat: playback panel — rAF loop at target FPS, frame counter, loop/stop controls"
```

---

## Task 13: MP4/WebM Export (export.js)

**Files:**
- Write: `js/export.js`

- [ ] **Step 1: Write export.js with MP4 export**

```js
// ============================================================
// POLYMORPH export.js
// MP4/WebM via MediaRecorder + GIF via gif.js
// ============================================================

window.EXPORT = {};

// ---------- Size Estimation ----------

function estimateMP4SizeMB(frameCount, fps, bitrateBps) {
  const durationSec = frameCount / fps;
  return ((durationSec * bitrateBps) / 8 / 1024 / 1024).toFixed(1);
}

function estimateGIFSizeMB(frameCount, width) {
  // Rough: ~5KB per 480px-wide frame (empirically conservative)
  return ((frameCount * 5 * (width / 480)) / 1024).toFixed(1);
}

window.EXPORT.updateEstimates = function(frameCount, fps) {
  const mp4Est = document.getElementById('mp4-est');
  const gifEst = document.getElementById('gif-est');
  if (mp4Est) mp4Est.textContent = `~${estimateMP4SizeMB(frameCount, fps, 8_000_000)} MB`;
  const gifFrames = Math.floor(frameCount * (15 / fps));
  if (gifEst) gifEst.textContent = `~${estimateGIFSizeMB(gifFrames, 480)} MB`;
};

// ---------- MP4/WebM Export ----------

window.EXPORT.exportMP4 = async function() {
  const frames = window.ENGINE.processedFrames;
  const config  = window.ENGINE.CONFIG;
  if (!frames || frames.length === 0) return;

  // Determine output dimensions
  let outW, outH;
  if (config.exportAspect === '9:16') {
    outW = 1080; outH = 1920;
  } else {
    outW = config.sourceWidth;
    outH = config.sourceHeight;
  }

  console.log(`[EXPORT] MP4 export — ${frames.length} frames at ${outW}×${outH}`);

  // Create recording canvas
  const recCanvas = document.createElement('canvas');
  recCanvas.width  = outW;
  recCanvas.height = outH;
  const recCtx = recCanvas.getContext('2d');

  // Check MediaRecorder support
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';

  const stream = recCanvas.captureStream(config.targetFPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'polymorph-export.webm';
    a.click();
    URL.revokeObjectURL(url);
    window.UI.hideProgress('export-workbar');
    document.getElementById('btn-mp4').disabled = false;
    console.log(`[EXPORT] MP4 download triggered — ${(blob.size/1024/1024).toFixed(1)} MB`);
  };

  recorder.start();
  document.getElementById('btn-mp4').disabled = true;

  const msPerFrame = 1000 / config.targetFPS;

  for (let i = 0; i < frames.length; i++) {
    if (!i || i % 10 === 0) {
      const pct = (i / frames.length) * 100;
      const label = `ENCODING FRAME ${String(i).padStart(3,'0')} / ${frames.length}`;
      window.UI.setProgress('export-workbar', label, pct);
    }

    window.UI.drawFrameToCtx(recCtx, frames[i], config, outW, outH);

    // Yield to allow MediaRecorder to capture the frame
    await new Promise(r => setTimeout(r, msPerFrame));
  }

  recorder.stop();
};

// ---------- GIF Export ----------

window.EXPORT.exportGIF = function() {
  const frames = window.ENGINE.processedFrames;
  const config  = window.ENGINE.CONFIG;
  if (!frames || frames.length === 0) return;

  const GIF_WIDTH  = 480;
  const GIF_FPS    = 15;
  const fps        = config.targetFPS;
  const frameSkip  = Math.max(1, Math.round(fps / GIF_FPS));

  console.log(`[EXPORT] GIF export — every ${frameSkip}th frame at ${GIF_WIDTH}px wide`);

  // Compute GIF dimensions preserving aspect ratio
  const srcW  = config.sourceWidth  || frames[0].width;
  const srcH  = config.sourceHeight || frames[0].height;
  const gifH  = Math.round(GIF_WIDTH * srcH / srcW);

  const gif = new GIF({
    workers: 2,
    quality: 10,
    width:   GIF_WIDTH,
    height:  gifH,
    workerScript: 'https://cdn.jsdelivr.net/npm/gif.js/dist/gif.worker.js',
  });

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width  = GIF_WIDTH;
  tempCanvas.height = gifH;
  const tempCtx = tempCanvas.getContext('2d');

  let addedFrames = 0;
  for (let i = 0; i < frames.length; i += frameSkip) {
    window.UI.drawFrameToCtx(tempCtx, frames[i], config, GIF_WIDTH, gifH);
    gif.addFrame(tempCanvas, { delay: Math.round(1000 / GIF_FPS), copy: true });
    addedFrames++;
  }

  document.getElementById('btn-gif').disabled = true;

  gif.on('progress', p => {
    const pct = p * 100;
    const label = `ENCODING GIF — ${Math.round(pct)}%`;
    window.UI.setProgress('export-workbar', label, pct);
  });

  gif.on('finished', blob => {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = 'polymorph-export.gif';
    a.click();
    URL.revokeObjectURL(url);
    window.UI.hideProgress('export-workbar');
    document.getElementById('btn-gif').disabled = false;
    console.log(`[EXPORT] GIF download triggered — ${addedFrames} frames, ${(blob.size/1024/1024).toFixed(1)} MB`);
  });

  gif.render();
};

console.log('[EXPORT] export.js loaded');
```

- [ ] **Step 2: Add UI.drawFrameToCtx helper to ui.js**

Append to `js/ui.js` — this is the version called by export.js that takes an arbitrary ctx + dimensions:

```js
// Expose drawFrame for export.js (same function, different name for clarity)
window.UI.drawFrameToCtx = function(ctx, frame, config, outW, outH) {
  drawFrame(ctx, frame, config, outW, outH);
};
```

- [ ] **Step 3: Replace stub updateExportEstimates in ui.js**

Find and replace the stub:
```js
function updateExportEstimates(frameCount, fps) {
  if (window.EXPORT && window.EXPORT.updateEstimates) {
    window.EXPORT.updateEstimates(frameCount, fps);
  }
}
```

- [ ] **Step 4: Verify export pipeline**

Process a 3-second video. After processing completes:
- Verify "~X MB" size estimates appear under each export button
- Click "▶ EXPORT MP4" — expected: export workbar shows "ENCODING FRAME..." progress, then browser download prompt for `polymorph-export.webm`
- Click "▶ EXPORT GIF" — expected: GIF encoding progress, then download prompt for `polymorph-export.gif`

Check console output:
```
[EXPORT] MP4 export — 90 frames at 1080×1920
[EXPORT] MP4 download triggered — X.X MB
[EXPORT] GIF export — every 2th frame at 480px wide
[EXPORT] GIF download triggered — 45 frames, X.X MB
```

- [ ] **Step 5: Commit**

```bash
git add js/export.js js/ui.js
git commit -m "feat: export — MP4/WebM via MediaRecorder, GIF via gif.js, size estimates, progress workbar, auto-download"
```

---

## Task 14: Export Panel Wiring + Aspect Toggle

**Files:**
- Modify: `js/ui.js`

Replace the stub `initExportPanel` function.

- [ ] **Step 1: Replace stub initExportPanel in ui.js**

```js
// ---------- Export Panel ----------

function initExportPanel() {
  // Aspect ratio toggle
  const btn916 = document.getElementById('aspect-916');
  const btnSrc = document.getElementById('aspect-src');

  btn916.addEventListener('click', () => {
    ENGINE.CONFIG.exportAspect = '9:16';
    btn916.classList.add('active');
    btnSrc.classList.remove('active');
  });
  btnSrc.addEventListener('click', () => {
    ENGINE.CONFIG.exportAspect = 'source';
    btnSrc.classList.add('active');
    btn916.classList.remove('active');
  });

  // Export buttons
  document.getElementById('btn-mp4').addEventListener('click', () => {
    if (window.EXPORT) window.EXPORT.exportMP4();
  });
  document.getElementById('btn-gif').addEventListener('click', () => {
    if (window.EXPORT) window.EXPORT.exportGIF();
  });
}
```

- [ ] **Step 2: Verify aspect toggle**

Click "SOURCE" toggle — expected: pill highlights, `ENGINE.CONFIG.exportAspect` becomes `'source'`. Click "9:16 REELS" — reverts.

- [ ] **Step 3: Commit**

```bash
git add js/ui.js
git commit -m "feat: export panel — aspect ratio toggle, MP4/GIF button wiring"
```

---

## Task 15: Error Handling + Console Logging Polish

**Files:**
- Modify: `js/engine.js`, `js/worker.js`, `js/export.js`, `js/ui.js`

- [ ] **Step 1: Add MediaRecorder support check in export.js**

In `window.EXPORT.exportMP4`, add at the very top of the function:

```js
if (typeof MediaRecorder === 'undefined') {
  alert('MediaRecorder is not supported in this browser. Try Chrome or Edge for MP4 export.');
  return;
}
```

- [ ] **Step 2: Add gif.js load check in export.js**

In `window.EXPORT.exportGIF`, add at the very top:

```js
if (typeof GIF === 'undefined') {
  alert('GIF encoder failed to load. Check your internet connection and reload.');
  return;
}
```

- [ ] **Step 3: Add worker error handler and video decode error in engine.js**

The `w.onerror` is already set in `initWorkerPool`. Add a user-visible fallback — in `handleWorkerResult`, if `triangles.length === 0`:

```js
// Inside handleWorkerResult, after line: pendingResults.set(...)
if (data.triangles.length === 0) {
  console.warn(`[ENGINE] Frame ${data.frameIndex} returned 0 triangles — skipping`);
}
```

- [ ] **Step 4: Add console.log pipeline trace in worker.js**

The worker already logs each frame. Verify the log format is consistent:
```
[WORKER] Processing frame 12 — 640x360, density=600
```
This is already present from Task 8. No changes needed.

- [ ] **Step 5: Final mobile responsive check**

Open browser DevTools, toggle device mode to 375px wide (iPhone). Verify:
- Single column layout (preset grid stacks above drop zone)
- Tweak panel grid becomes single column
- Title text is readable (1.6rem via media query)
- Buttons are tappable (minimum 44px touch target — check padding)

If buttons are too small, add to `css/style.css`:
```css
@media (max-width: 768px) {
  .btn { padding: 10px 20px; }
  .pill { padding: 8px 14px; }
}
```

- [ ] **Step 6: Commit**

```bash
git add js/engine.js js/worker.js js/export.js js/ui.js css/style.css
git commit -m "feat: error handling — MediaRecorder/GIF checks, zero-triangle guard, mobile button sizing"
```

---

## Task 16: Integration Smoke Test + Final Wiring

**Files:**
- Read all files, verify integration

- [ ] **Step 1: Full pipeline smoke test**

Run `npx serve .`, open `http://localhost:3000`.

1. Drop a 5-second MP4 video
2. Expected console sequence:
   ```
   [ENGINE] engine.js loaded — CONFIG and presets ready
   [EXPORT] export.js loaded
   [UI] Background canvas initialized
   [UI] Preset cards built
   [ENGINE] Worker pool initialized — 4 workers
   [UI] Video file selected: test.mp4 (X.X MB)
   [UI] Video metadata: 1920x1080, 5.0s
   [ENGINE] Extracting 150 frames at 640x360 (source: 1920x1080)
   [ENGINE] Extracted 150 frames — dispatching to worker pool
   [WORKER] Processing frame 0 — 640x360, density=600
   ... (parallel frames)
   [ENGINE] Processing complete — 150 frames ready
   [UI] Processing complete — 150 frames, export enabled
   ```
3. Click "▶ LOOP" — processed video plays back in canvas
4. Click a different preset (e.g. GAMEBOY) — tweak panel syncs to DMG green palette, 300 density
5. Click "▶ EXPORT GIF" — download prompt appears

- [ ] **Step 2: Verify all 6 presets apply correctly**

Open tweak panel. For each preset, click card and verify sliders update:
- PURE PS1: density=600, warp=80
- DREAMCAST: density=900, render=gouraud
- ACID RAVE: density=400, dither=80, render=dither
- VAPORWAVE: density=1200, color banding=ON, render=vector
- GAMEBOY: density=300, color depth=4, render=chunky
- GLITCH CORE: density=800, jitter=80, z-fighting=ON, interlace flash=ON

- [ ] **Step 3: Verify both export formats**

Export a 3-second clip as both WebM and GIF. Open downloaded files. Confirm:
- WebM plays in browser, shows low-poly triangulated video
- GIF plays, shows lower-resolution low-poly version at ~15fps

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat: POLYMORPH — production-ready PS1 low-poly motion design tool, full pipeline integrated"
```

---

## Running & Deploying

**Local:**
```bash
npx serve .
# Opens at http://localhost:3000
```

**Vercel:**
```bash
npx vercel
# Follow prompts — no build command, output directory: .
# vercel.json handles routing
```
