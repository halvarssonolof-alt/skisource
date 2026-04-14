// ============================================================
// POLYMORPH ui.js — All DOM interaction and canvas rendering
// ============================================================

// ---------- Status bar ----------
function setStatus(state, text) {
  const badge = document.getElementById('status-badge');
  const label = document.getElementById('status-text');
  badge.className = 'status-badge ' + state;
  label.textContent = text || state.toUpperCase().replace(/-/g,' ');
}

function showError(msg) {
  setStatus('error', 'ERROR');
  const zone = document.getElementById('drop-zone');
  zone.hidden = false;
  zone.innerHTML = `
    <p class="drop-icon" style="color:var(--pink)">✕</p>
    <p class="drop-text" style="color:var(--pink)">${msg}</p>
    <p class="drop-subtext"><label class="browse-label" for="file-input">TRY AGAIN</label></p>
    <input type="file" id="file-input" accept="video/*" hidden>
  `;
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) handleVideoFile(e.target.files[0]);
  });
}

// Expose on window so engine.js can call these at runtime
window.setStatus = setStatus;
window.showError = showError;

// ---------- Progress workbar ----------
function setProgress(containerId, label, pct, eta) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.hidden = false;
  const lEl = document.getElementById(containerId + '-label');
  const fEl = document.getElementById(containerId + '-fill');
  const pEl = document.getElementById(containerId + '-pct');
  if (lEl) lEl.textContent = label;
  if (fEl) fEl.style.width = Math.min(100, pct) + '%';
  if (pEl) pEl.textContent = Math.round(pct) + '%';
  if (eta !== undefined && containerId === 'workbar') {
    const etaEl = document.getElementById('workbar-eta');
    if (etaEl) {
      const m = Math.floor(eta / 60), s = Math.floor(eta % 60);
      etaEl.textContent = `EST. REMAINING: ${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    }
  }
}
window.setProgress = setProgress;

function hideProgress(id) {
  const el = document.getElementById(id);
  if (el) el.hidden = true;
}
window.hideProgress = hideProgress;

// ---------- Triangle renderer ----------
const BAYER4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];

function drawFrame(ctx, frame, config, outW, outH) {
  if (!frame || !frame.triangles || frame.triangles.length === 0) return;
  const sx = outW / frame.width, sy = outH / frame.height;

  if (config.renderStyle === 'chunky') {
    const sw = Math.max(1, outW >> 3), sh = Math.max(1, outH >> 3);
    const off = document.createElement('canvas');
    off.width = sw; off.height = sh;
    const offCtx = off.getContext('2d');
    offCtx.clearRect(0, 0, sw, sh);
    const rsx = sw / frame.width, rsy = sh / frame.height;
    for (const tri of frame.triangles) {
      const [x0,y0,x1,y1,x2,y2] = tri.verts;
      offCtx.beginPath();
      offCtx.moveTo(x0*rsx, y0*rsy);
      offCtx.lineTo(x1*rsx, y1*rsy);
      offCtx.lineTo(x2*rsx, y2*rsy);
      offCtx.closePath();
      offCtx.fillStyle = tri.colors[0];
      offCtx.fill();
    }
    ctx.clearRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(off, 0, 0, outW, outH);
    return;
  }

  ctx.clearRect(0, 0, outW, outH);

  for (const tri of frame.triangles) {
    const [x0,y0,x1,y1,x2,y2] = tri.verts;
    const px0=x0*sx, py0=y0*sy, px1=x1*sx, py1=y1*sy, px2=x2*sx, py2=y2*sy;

    ctx.beginPath();
    ctx.moveTo(px0, py0);
    ctx.lineTo(px1, py1);
    ctx.lineTo(px2, py2);
    ctx.closePath();

    if (tri.interlaceDim) ctx.globalAlpha = 0.5;

    switch (config.renderStyle) {
      case 'wireframe':
        ctx.strokeStyle = tri.colors[0];
        ctx.lineWidth = 0.5;
        ctx.stroke();
        break;
      case 'gouraud': {
        const g = ctx.createLinearGradient(px0, py0, px2, py2);
        g.addColorStop(0,   tri.colors[1]);
        g.addColorStop(0.5, tri.colors[2]);
        g.addColorStop(1,   tri.colors[3]);
        ctx.fillStyle = g;
        ctx.fill();
        break;
      }
      case 'dither': {
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
        const cx = ((px0+px1+px2)/3)|0, cy = ((py0+py1+py2)/3)|0;
        const bv = BAYER4[(cy&3)*4+(cx&3)] / 16;
        if (bv < 0.5) { ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill(); }
        break;
      }
      case 'vector':
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
        ctx.strokeStyle = tri.colors[0];
        ctx.lineWidth = 0.5;
        ctx.stroke();
        break;
      default: // flat
        ctx.fillStyle = tri.colors[0];
        ctx.fill();
    }

    if (tri.interlaceDim) ctx.globalAlpha = 1;
  }
}

function drawFrameToCanvas(frame) {
  const canvas = document.getElementById('output-canvas');
  if (!canvas || canvas.hidden) return;
  drawFrame(canvas.getContext('2d'), frame, ENGINE.CONFIG, canvas.width, canvas.height);
}
// Expose for export.js
window.drawFrameToCanvas = drawFrameToCanvas;
window.drawFrame = drawFrame;

// ---------- Drop zone ----------
function initDropZone() {
  const zone  = document.getElementById('drop-zone');
  const input = document.getElementById('file-input');

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f && f.type.startsWith('video/')) handleVideoFile(f);
    else showError('Please drop a video file (MP4, MOV, WebM)');
  });
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', e => { if (e.target.files[0]) handleVideoFile(e.target.files[0]); });
}

function handleVideoFile(file) {
  console.log('[UI] Video:', file.name, `(${(file.size/1024/1024).toFixed(1)} MB)`);
  const vid = document.getElementById('video-el');
  vid.src = URL.createObjectURL(file);
  vid.load();
  vid.addEventListener('loadedmetadata', () => {
    const { videoWidth: w, videoHeight: h, duration: d } = vid;
    console.log(`[UI] Metadata: ${w}x${h}, ${d.toFixed(1)}s`);
    setStatus('ready', `LOADED — ${w}×${h} · ${d.toFixed(1)}S`);

    // Update drop zone to show file info
    const zone = document.getElementById('drop-zone');
    zone.innerHTML = `
      <p class="drop-icon" style="color:var(--teal)">✓</p>
      <p class="drop-text">${file.name}</p>
      <p class="drop-subtext">${w}×${h} · ${d.toFixed(1)}s · <label class="browse-label" for="file-input">CHANGE</label></p>
      <input type="file" id="file-input" accept="video/*" hidden>
      <button class="btn" id="btn-process" style="margin-top:12px">▶ PROCESS VIDEO</button>
    `;
    document.getElementById('file-input').addEventListener('change', e => {
      if (e.target.files[0]) handleVideoFile(e.target.files[0]);
    });
    document.getElementById('btn-process').addEventListener('click', () => {
      ENGINE.startProcessing(vid);
    });
  }, { once: true });

  vid.addEventListener('error', () => showError('Could not decode video. Try MP4 (H.264).'), { once: true });
}

// ---------- Presets ----------
function initPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.preset-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ENGINE.applyPreset(btn.dataset.preset);
      syncControls();
    });
  });
}

// ---------- Sliders ----------
let debounceTimers = {};
function initSliders() {
  const map = {
    'sl-density': ['polygonDensity', 'val-density'],
    'sl-edge':    ['edgeSensitivity','val-edge'],
    'sl-depth':   ['colorDepth',     'val-depth'],
    'sl-warp':    ['affineWarp',     'val-warp'],
    'sl-dither':  ['ditherStrength', 'val-dither'],
    'sl-jitter':  ['vertexJitter',   'val-jitter'],
  };
  for (const [id, [key, valId]] of Object.entries(map)) {
    document.getElementById(id).addEventListener('input', function() {
      document.getElementById(valId).textContent = this.value;
      clearTimeout(debounceTimers[id]);
      debounceTimers[id] = setTimeout(() => { ENGINE.CONFIG[key] = parseInt(this.value, 10); }, 300);
    });
  }
}

// ---------- FX toggles ----------
function initFXToggles() {
  document.querySelectorAll('.pill[data-fx]').forEach(pill => {
    pill.addEventListener('click', () => {
      const fx = pill.dataset.fx;
      ENGINE.CONFIG[fx] = !ENGINE.CONFIG[fx];
      pill.classList.toggle('active', ENGINE.CONFIG[fx]);
      if (fx === 'scanlines') document.body.classList.toggle('no-scanlines', !ENGINE.CONFIG[fx]);
    });
  });
}

// ---------- Render style + palette ----------
function initRadios() {
  document.querySelectorAll('input[name="renderStyle"]').forEach(r => {
    r.addEventListener('change', () => { ENGINE.CONFIG.renderStyle = r.value; });
  });
  document.querySelectorAll('input[name="palette"]').forEach(r => {
    r.addEventListener('change', () => { ENGINE.CONFIG.palette = r.value; });
  });
}

// ---------- Sync controls to CONFIG ----------
function syncControls() {
  const C = ENGINE.CONFIG;
  const sl = (id, valId, v) => {
    const el = document.getElementById(id); if (el) el.value = v;
    const ve = document.getElementById(valId); if (ve) ve.textContent = v;
  };
  sl('sl-density','val-density', C.polygonDensity);
  sl('sl-edge',   'val-edge',    C.edgeSensitivity);
  sl('sl-depth',  'val-depth',   C.colorDepth);
  sl('sl-warp',   'val-warp',    C.affineWarp);
  sl('sl-dither', 'val-dither',  C.ditherStrength);
  sl('sl-jitter', 'val-jitter',  C.vertexJitter);

  document.querySelectorAll('.pill[data-fx]').forEach(p => {
    p.classList.toggle('active', !!C[p.dataset.fx]);
  });
  const rsEl = document.querySelector(`input[name="renderStyle"][value="${C.renderStyle}"]`);
  if (rsEl) rsEl.checked = true;
  const palEl = document.querySelector(`input[name="palette"][value="${C.palette}"]`);
  if (palEl) palEl.checked = true;
}

// ---------- Cancel button ----------
function initCancel() {
  document.getElementById('btn-cancel').addEventListener('click', () => ENGINE.cancelProcessing());
}

// ---------- Playback ----------
let playRAF = null, playIdx = 0, playLast = 0;

function initPlayback() {
  document.getElementById('btn-play-loop').addEventListener('click', startPlayback);
  document.getElementById('btn-stop').addEventListener('click', stopPlayback);
  document.getElementById('btn-reprocess').addEventListener('click', () => {
    stopPlayback();
    document.getElementById('playback-panel').hidden = true;
    document.getElementById('export-panel').hidden   = true;
    document.getElementById('drop-zone').hidden      = false;
    setStatus('ready', 'READY');
  });
}

function startPlayback() {
  if (playRAF) return;
  playIdx = 0;
  const msPerFrame = 1000 / ENGINE.CONFIG.targetFPS;
  function loop(now) {
    playRAF = requestAnimationFrame(loop);
    if (now - playLast < msPerFrame) return;
    playLast = now;
    const frames = ENGINE.processedFrames;
    if (!frames.length) return;
    playIdx = playIdx % frames.length;
    drawFrameToCanvas(frames[playIdx]);
    document.getElementById('playback-info').textContent = `FRAME ${playIdx+1} / ${frames.length}`;
    playIdx++;
  }
  playRAF = requestAnimationFrame(loop);
}

function stopPlayback() {
  if (playRAF) { cancelAnimationFrame(playRAF); playRAF = null; }
}

// ---------- Export panel ----------
function initExportPanel() {
  document.getElementById('aspect-916').addEventListener('click', () => {
    ENGINE.CONFIG.exportAspect = '9:16';
    document.getElementById('aspect-916').classList.add('active');
    document.getElementById('aspect-src').classList.remove('active');
  });
  document.getElementById('aspect-src').addEventListener('click', () => {
    ENGINE.CONFIG.exportAspect = 'source';
    document.getElementById('aspect-src').classList.add('active');
    document.getElementById('aspect-916').classList.remove('active');
  });
  document.getElementById('btn-mp4').addEventListener('click', () => EXPORT.exportMP4());
  document.getElementById('btn-gif').addEventListener('click', () => EXPORT.exportGIF());
}

// ---------- Boot ----------
document.addEventListener('DOMContentLoaded', () => {
  initDropZone();
  initPresets();
  initSliders();
  initFXToggles();
  initRadios();
  initCancel();
  initPlayback();
  initExportPanel();
  console.log('[UI] Ready');
});
