// ============================================================
// POLYMORPH export.js — MP4/WebM + GIF export
// ============================================================

window.EXPORT = {

  exportMP4: async function() {
    const frames = ENGINE.processedFrames;
    const config = ENGINE.CONFIG;
    if (!frames || !frames.length) return alert('No processed frames yet.');
    if (typeof MediaRecorder === 'undefined') return alert('MediaRecorder not supported. Use Chrome or Edge.');

    const outW = config.exportAspect === '9:16' ? 1080 : config.sourceWidth;
    const outH = config.exportAspect === '9:16' ? 1920 : config.sourceHeight;

    const recCanvas = document.createElement('canvas');
    recCanvas.width = outW; recCanvas.height = outH;
    const recCtx = recCanvas.getContext('2d');

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const stream   = recCanvas.captureStream(config.targetFPS);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });

    const chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'polymorph-export.webm';
      a.click();
      URL.revokeObjectURL(a.href);
      hideProgress('export-workbar');
      document.getElementById('btn-mp4').disabled = false;
      console.log(`[EXPORT] MP4 done — ${(blob.size/1024/1024).toFixed(1)} MB`);
    };

    recorder.start();
    document.getElementById('btn-mp4').disabled = true;

    const msPerFrame = 1000 / config.targetFPS;
    for (let i = 0; i < frames.length; i++) {
      drawFrame(recCtx, frames[i], config, outW, outH);
      setProgress('export-workbar', `ENCODING FRAME ${i+1} / ${frames.length}`, (i+1)/frames.length*100);
      await new Promise(r => setTimeout(r, msPerFrame));
    }
    recorder.stop();
  },

  exportGIF: function() {
    const frames = ENGINE.processedFrames;
    const config = ENGINE.CONFIG;
    if (!frames || !frames.length) return alert('No processed frames yet.');
    if (typeof GIF === 'undefined') return alert('GIF encoder not loaded. Check internet connection.');

    const GIF_W = 480;
    const fps   = config.targetFPS;
    const skip  = Math.max(1, Math.round(fps / 15));
    const srcW  = config.sourceWidth  || frames[0].width;
    const srcH  = config.sourceHeight || frames[0].height;
    const gifH  = Math.round(GIF_W * srcH / srcW);

    const gif = new GIF({
      workers: 2, quality: 10,
      width: GIF_W, height: gifH,
      workerScript: 'https://cdn.jsdelivr.net/npm/gif.js/dist/gif.worker.js',
    });

    const tmp = document.createElement('canvas');
    tmp.width = GIF_W; tmp.height = gifH;
    const tmpCtx = tmp.getContext('2d');

    let count = 0;
    for (let i = 0; i < frames.length; i += skip) {
      drawFrame(tmpCtx, frames[i], config, GIF_W, gifH);
      gif.addFrame(tmp, { delay: Math.round(1000 / 15), copy: true });
      count++;
    }

    document.getElementById('btn-gif').disabled = true;
    gif.on('progress', p => setProgress('export-workbar', `ENCODING GIF — ${Math.round(p*100)}%`, p*100));
    gif.on('finished', blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'polymorph-export.gif';
      a.click();
      URL.revokeObjectURL(a.href);
      hideProgress('export-workbar');
      document.getElementById('btn-gif').disabled = false;
      console.log(`[EXPORT] GIF done — ${count} frames, ${(blob.size/1024/1024).toFixed(1)} MB`);
    });
    gif.render();
  },
};

console.log('[EXPORT] export.js loaded');
