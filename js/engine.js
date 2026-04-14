// ============================================================
// POLYMORPH engine.js — CONFIG, presets, worker pool, pipeline
// ============================================================

const PALETTES = {
  ps1dark:  [[0,229,204],[155,77,255],[255,45,120],[10,10,20],[30,30,58],[200,200,232]],
  acid:     [[57,255,20],[255,0,255],[255,255,0],[0,0,0],[17,17,17],[255,255,255]],
  vhswarm:  [[255,107,53],[247,197,159],[239,239,208],[0,78,137],[26,39,82],[255,238,221]],
  dmggreen: [[15,56,15],[48,98,48],[139,172,15],[155,188,15],[196,207,161],[224,240,208]],
  n64:      [[228,3,3],[0,80,240],[0,216,0],[255,255,255],[255,153,0],[0,0,0]],
};

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
};

const PRESETS = {
  'pure-ps1':    () => Object.assign(CONFIG, { polygonDensity:1200, edgeSensitivity:85, colorDepth:24,  affineWarp:20, ditherStrength:0,  vertexJitter:10, scanlines:true,  colorBanding:false, zFighting:false, interlaceFlash:false, fogEffect:false, subpixelWobble:false, renderStyle:'flat',     palette:'ps1dark'  }),
  'dreamcast':   () => Object.assign(CONFIG, { polygonDensity:900,  edgeSensitivity:60, colorDepth:48,  affineWarp:20, ditherStrength:0,  vertexJitter:10, scanlines:false, colorBanding:false, zFighting:false, interlaceFlash:false, fogEffect:false, subpixelWobble:false, renderStyle:'gouraud',  palette:'ps1dark'  }),
  'acid-rave':   () => Object.assign(CONFIG, { polygonDensity:400,  edgeSensitivity:50, colorDepth:32,  affineWarp:0,  ditherStrength:80, vertexJitter:0,  scanlines:false, colorBanding:false, zFighting:false, interlaceFlash:false, fogEffect:false, subpixelWobble:false, renderStyle:'dither',   palette:'acid'     }),
  'vaporwave':   () => Object.assign(CONFIG, { polygonDensity:1200, edgeSensitivity:80, colorDepth:64,  affineWarp:10, ditherStrength:0,  vertexJitter:5,  scanlines:false, colorBanding:true,  zFighting:false, interlaceFlash:false, fogEffect:false, subpixelWobble:false, renderStyle:'vector',   palette:'vhswarm'  }),
  'gameboy':     () => Object.assign(CONFIG, { polygonDensity:300,  edgeSensitivity:40, colorDepth:4,   affineWarp:0,  ditherStrength:0,  vertexJitter:0,  scanlines:false, colorBanding:false, zFighting:false, interlaceFlash:false, fogEffect:false, subpixelWobble:false, renderStyle:'chunky',   palette:'dmggreen' }),
  'glitch-core': () => Object.assign(CONFIG, { polygonDensity:800,  edgeSensitivity:65, colorDepth:32,  affineWarp:40, ditherStrength:0,  vertexJitter:80, scanlines:false, colorBanding:false, zFighting:true,  interlaceFlash:true,  fogEffect:false, subpixelWobble:false, renderStyle:'flat',     palette:'ps1dark'  }),
};

// ---------- Worker pool ----------
const WORKER_COUNT = 4;
const workers = [];
let pendingResults = new Map();
let expectedFrames = 0;
let completedFrames = 0;
let processingStart = 0;
let cancelled = false;

function initWorkerPool() {
  workers.length = 0;
  for (let i = 0; i < WORKER_COUNT; i++) {
    const w = new Worker('js/worker.js');
    w.onmessage = ({ data }) => handleResult(i, data);
    w.onerror   = (e) => { console.error('[ENGINE] Worker error:', e); };
    workers.push(w);
  }
  console.log('[ENGINE] Worker pool ready');
}

function handleResult(workerIdx, data) {
  if (cancelled) return;
  const { frameIndex, triangles, width, height } = data;

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

  // Live preview
  if (ENGINE.processedFrames.length > 0) {
    drawFrameToCanvas(ENGINE.processedFrames[ENGINE.processedFrames.length - 1]);
  }

  if (completedFrames === expectedFrames) finishProcessing();
}

// ---------- Frame extraction ----------
const PROC_MAX_W = 640;

function extractFrames(videoEl) {
  return new Promise(resolve => {
    const srcW = videoEl.videoWidth, srcH = videoEl.videoHeight;
    const scale = Math.min(1, PROC_MAX_W / srcW);
    const procW = Math.round(srcW * scale), procH = Math.round(srcH * scale);

    CONFIG.sourceWidth  = srcW;
    CONFIG.sourceHeight = srcH;

    const fps      = CONFIG.targetFPS;
    const duration = videoEl.duration;
    const total    = Math.floor(duration * fps);
    CONFIG.totalFrames = total;

    console.log(`[ENGINE] Extracting ${total} frames at ${procW}x${procH}`);

    const canvas = document.createElement('canvas');
    canvas.width = procW; canvas.height = procH;
    const ctx = canvas.getContext('2d');
    const frames = [];
    let idx = 0;

    function seekNext() {
      if (idx >= total) { resolve(frames); return; }
      videoEl.currentTime = idx / fps;
    }

    videoEl.onseeked = () => {
      ctx.drawImage(videoEl, 0, 0, procW, procH);
      const id = ctx.getImageData(0, 0, procW, procH);
      frames.push({ frameIndex: idx, buffer: id.data.buffer.slice(0), width: procW, height: procH });
      idx++;
      // Update extraction progress
      setProgress('workbar', `EXTRACTING FRAME ${idx} / ${total}`, (idx/total)*50);
      seekNext();
    };

    seekNext();
  });
}

// ---------- Orchestration ----------
async function startProcessing(videoEl) {
  if (ENGINE.isProcessing) return;
  ENGINE.isProcessing = true;
  ENGINE.processedFrames = [];
  cancelled = false;
  completedFrames = 0;
  pendingResults.clear();
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

  expectedFrames = frames.length;
  const configSnap = { ...CONFIG };

  // Size output canvas
  const oc = document.getElementById('output-canvas');
  oc.width  = CONFIG.sourceWidth;
  oc.height = CONFIG.sourceHeight;

  processingStart = Date.now(); // reset after extraction

  frames.forEach(f => {
    workers[f.frameIndex % WORKER_COUNT].postMessage({
      frameIndex: f.frameIndex, buffer: f.buffer,
      width: f.width, height: f.height, config: configSnap,
    }, [f.buffer]);
  });
}

function cancelProcessing() {
  cancelled = true;
  ENGINE.isProcessing = false;
  workers.forEach(w => w.terminate());
  initWorkerPool();
  document.getElementById('workbar').hidden    = true;
  document.getElementById('drop-zone').hidden  = false;
  setStatus('ready', 'CANCELLED');
  console.log('[ENGINE] Cancelled');
  if (ENGINE.processedFrames.length > 0) finishProcessing();
}

function finishProcessing() {
  ENGINE.isProcessing = false;
  document.getElementById('workbar').hidden         = true;
  document.getElementById('playback-panel').hidden  = false;
  document.getElementById('export-panel').hidden    = false;

  const n = ENGINE.processedFrames.length;
  console.log(`[ENGINE] Done — ${n} frames`);
  setStatus('export-ready', `EXPORT READY — ${n} FRAMES`);

  // Update export size estimates
  const mp4MB = ((n / CONFIG.targetFPS) * 8000000 / 8 / 1024 / 1024).toFixed(1);
  const gifFrames = Math.floor(n * 15 / CONFIG.targetFPS);
  const gifMB = (gifFrames * 5 / 1024).toFixed(1);
  const mp4El = document.getElementById('mp4-est');
  const gifEl = document.getElementById('gif-est');
  if (mp4El) mp4El.textContent = `~${mp4MB} MB`;
  if (gifEl) gifEl.textContent = `~${gifMB} MB`;
}

// ---------- Public API ----------
window.ENGINE = {
  CONFIG, PALETTES,
  processedFrames: [],
  isProcessing: false,
  applyPreset(id) {
    if (PRESETS[id]) { PRESETS[id](); console.log('[ENGINE] Preset:', id); }
  },
  startProcessing,
  cancelProcessing,
};

// Boot pool
initWorkerPool();
console.log('[ENGINE] engine.js loaded');
