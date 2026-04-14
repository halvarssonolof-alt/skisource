// ============================================================
// POLYMORPH worker.js  —  Full PS1 pipeline per frame
// Sobel → Point sampling → Delaunator → Color → FX effects
// ============================================================

importScripts('https://cdn.jsdelivr.net/npm/delaunator@5/delaunator.min.js');

// ---------- Palette data ----------
const PALETTES = {
  ps1dark:  [[0,229,204],[155,77,255],[255,45,120],[10,10,20],[30,30,58],[200,200,232]],
  acid:     [[57,255,20],[255,0,255],[255,255,0],[0,0,0],[17,17,17],[255,255,255]],
  vhswarm:  [[255,107,53],[247,197,159],[239,239,208],[0,78,137],[26,39,82],[255,238,221]],
  dmggreen: [[15,56,15],[48,98,48],[139,172,15],[155,188,15],[196,207,161],[224,240,208]],
  n64:      [[228,3,3],[0,80,240],[0,216,0],[255,255,255],[255,153,0],[0,0,0]],
};

// ---------- Step 1: Sobel edge detection ----------
function sobelEdgeDetect(pixels, width, height) {
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    gray[i] = pixels[o] * 0.299 + pixels[o+1] * 0.587 + pixels[o+2] * 0.114;
  }
  const edge = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const tl = gray[(y-1)*width+(x-1)], t  = gray[(y-1)*width+x], tr = gray[(y-1)*width+(x+1)];
      const ml = gray[ y   *width+(x-1)],                            mr = gray[ y   *width+(x+1)];
      const bl = gray[(y+1)*width+(x-1)], b  = gray[(y+1)*width+x], br = gray[(y+1)*width+(x+1)];
      const gx = -tl - 2*ml - bl + tr + 2*mr + br;
      const gy = -tl - 2*t  - tr + bl + 2*b  + br;
      edge[y * width + x] = Math.sqrt(gx*gx + gy*gy);
    }
  }
  return edge;
}

// ---------- Step 2: Point sampling ----------
function samplePoints(edgeMap, width, height, density, edgeSensitivity) {
  const pts = [];
  const edgeCount   = Math.floor(density * edgeSensitivity / 100);
  const randomCount = density - edgeCount;

  // High-edge candidates
  let maxEdge = 0;
  for (let i = 0; i < edgeMap.length; i++) if (edgeMap[i] > maxEdge) maxEdge = edgeMap[i];
  const threshold = maxEdge * 0.2;
  const candidates = [];
  for (let i = 0; i < edgeMap.length; i++) if (edgeMap[i] >= threshold) candidates.push(i);

  for (let i = 0; i < edgeCount; i++) {
    if (candidates.length === 0) break;
    const idx = candidates[Math.floor(Math.random() * candidates.length)];
    pts.push(idx % width, Math.floor(idx / width));
  }
  for (let i = 0; i < randomCount; i++) {
    pts.push(Math.random() * width, Math.random() * height);
  }
  // Corners so triangulation covers the whole frame
  pts.push(0, 0, width-1, 0, 0, height-1, width-1, height-1);
  return pts;
}

// ---------- Color helpers ----------
function sampleRGB(pixels, width, height, x, y) {
  const px = Math.max(0, Math.min(width-1,  Math.round(x)));
  const py = Math.max(0, Math.min(height-1, Math.round(y)));
  const i  = (py * width + px) * 4;
  return [pixels[i], pixels[i+1], pixels[i+2]];
}

function nearestPalette(rgb, palette) {
  let best = palette[0], minDist = Infinity;
  for (const c of palette) {
    const d = (rgb[0]-c[0])**2 + (rgb[1]-c[1])**2 + (rgb[2]-c[2])**2;
    if (d < minDist) { minDist = d; best = c; }
  }
  return [best[0], best[1], best[2]];
}

function applyQuantization(rgb, colorDepth) {
  const step = Math.max(1, Math.round(256 / colorDepth));
  return [
    Math.min(255, Math.round(rgb[0] / step) * step),
    Math.min(255, Math.round(rgb[1] / step) * step),
    Math.min(255, Math.round(rgb[2] / step) * step),
  ];
}

function applyColorBanding(rgb) {
  return [Math.floor(rgb[0]/85)*85, Math.floor(rgb[1]/85)*85, Math.floor(rgb[2]/85)*85];
}

function applyFog(rgb, cy, frameHeight) {
  const s = Math.min(0.8, (cy / frameHeight) * 0.6);
  return [
    Math.round(rgb[0]*(1-s) + 10*s),
    Math.round(rgb[1]*(1-s) + 10*s),
    Math.round(rgb[2]*(1-s) + 20*s),
  ];
}

const BAYER4 = [0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
function applyDither(rgb, cx, cy, strength) {
  const t = (BAYER4[(Math.floor(cy)&3)*4 + (Math.floor(cx)&3)] / 16 - 0.5) * strength * 96;
  return [
    Math.max(0, Math.min(255, Math.round(rgb[0]+t))),
    Math.max(0, Math.min(255, Math.round(rgb[1]+t))),
    Math.max(0, Math.min(255, Math.round(rgb[2]+t))),
  ];
}

function toCSS(rgb) { return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`; }

// ---------- Main pipeline ----------
self.onmessage = function({ data }) {
  const { frameIndex, buffer, width, height, config } = data;
  const pixels = new Uint8ClampedArray(buffer);

  // Step 1
  const edgeMap = sobelEdgeDetect(pixels, width, height);

  // Step 2
  const flatPts = samplePoints(edgeMap, width, height, config.polygonDensity, config.edgeSensitivity);

  // Step 3: Triangulate
  let delaunay;
  try {
    delaunay = new Delaunator(flatPts);
  } catch(e) {
    self.postMessage({ frameIndex, triangles: [], width, height });
    return;
  }

  // Steps 4 + 5: Color sampling + effects
  const palette = (config.palette !== 'original') ? PALETTES[config.palette] : null;
  const triangles = [];

  for (let i = 0; i < delaunay.triangles.length; i += 3) {
    const i0 = delaunay.triangles[i]   * 2;
    const i1 = delaunay.triangles[i+1] * 2;
    const i2 = delaunay.triangles[i+2] * 2;

    let x0 = flatPts[i0], y0 = flatPts[i0+1];
    let x1 = flatPts[i1], y1 = flatPts[i1+1];
    let x2 = flatPts[i2], y2 = flatPts[i2+1];
    const cx = (x0+x1+x2)/3, cy = (y0+y1+y2)/3;

    // --- Affine Warp ---
    if (config.affineWarp > 0) {
      const ws = config.affineWarp * 0.015;
      x0 += Math.sin(frameIndex*0.1 + i0*0.7) * ws;
      y0 += Math.cos(frameIndex*0.1 + i0*0.5) * ws;
      x1 += Math.sin(frameIndex*0.1 + i1*0.7) * ws;
      y1 += Math.cos(frameIndex*0.1 + i1*0.5) * ws;
      x2 += Math.sin(frameIndex*0.1 + i2*0.7) * ws;
      y2 += Math.cos(frameIndex*0.1 + i2*0.5) * ws;
    }

    // --- Vertex Jitter ---
    if (config.vertexJitter > 0) {
      const j = config.vertexJitter * 0.08;
      x0 += (Math.random()-0.5)*j; y0 += (Math.random()-0.5)*j;
      x1 += (Math.random()-0.5)*j; y1 += (Math.random()-0.5)*j;
      x2 += (Math.random()-0.5)*j; y2 += (Math.random()-0.5)*j;
    }

    // --- Sub-pixel Wobble ---
    if (config.subpixelWobble) {
      const w = Math.sin(frameIndex * 0.3) * 0.5;
      x0 += w; x1 += w; x2 += w;
    }

    // --- Color sampling at vertices + centroid ---
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

    // --- Color Quantization ---
    if (config.colorDepth < 255) {
      c0 = applyQuantization(c0, config.colorDepth);
      c1 = applyQuantization(c1, config.colorDepth);
      c2 = applyQuantization(c2, config.colorDepth);
      cc = applyQuantization(cc, config.colorDepth);
    }

    // --- Color Banding ---
    if (config.colorBanding) {
      c0 = applyColorBanding(c0);
      c1 = applyColorBanding(c1);
      c2 = applyColorBanding(c2);
      cc = applyColorBanding(cc);
    }

    // --- Fog (centroid color) ---
    if (config.fogEffect) cc = applyFog(cc, cy, height);

    // --- Dithering (centroid) ---
    if (config.ditherStrength > 0) cc = applyDither(cc, cx, cy, config.ditherStrength / 100);

    triangles.push({
      verts:  [x0, y0, x1, y1, x2, y2],
      // colors[0]=centroid, [1..3]=vertices (for gouraud)
      colors: [toCSS(cc), toCSS(c0), toCSS(c1), toCSS(c2)],
      interlaceDim: config.interlaceFlash && (frameIndex % 2 === 1) && ((i/3 | 0) % 2 === 0),
    });
  }

  // --- Z-Fighting: swap a few triangle colors ---
  if (config.zFighting && triangles.length > 4) {
    for (let k = 0; k < 3; k++) {
      const a = Math.floor(Math.random() * triangles.length);
      const b = Math.floor(Math.random() * triangles.length);
      if (a !== b) { const t = triangles[a].colors; triangles[a].colors = triangles[b].colors; triangles[b].colors = t; }
    }
  }

  self.postMessage({ frameIndex, triangles, width, height });
};
