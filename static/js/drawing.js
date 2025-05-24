// static/js/drawing.js

document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('imageContainer');
  const UPLOAD_URL = container.dataset.uploadUrl; // gets our baked-in URL
  const guestMatch = UPLOAD_URL.match(/guest=([^&]+)/);
  const GUEST = guestMatch ? decodeURIComponent(guestMatch[1]) : '';

  const img     = document.getElementById('currentImage');
  const canvas  = document.getElementById('drawingCanvas');
  const ctx     = canvas.getContext('2d');
  const undoBtn = document.getElementById('undoButton');
  const saveBtn = document.getElementById('saveButton');

  let undoStack = [];
  let drawing   = false;
  let resizeTimer;

  // Enable drawing
  canvas.style.pointerEvents = 'auto';
  canvas.style.cursor        = 'crosshair';

  // Resize canvas to match image
  function resizeCanvas() {
    if (!img.naturalWidth) return;
    const ratio = img.naturalWidth / img.naturalHeight;
    const w = img.clientWidth, h = img.clientHeight;
    if (w/h > ratio) {
      canvas.height = h;
      canvas.width  = h * ratio;
    } else {
      canvas.width  = w;
      canvas.height = w / ratio;
    }
    redraw();
  }
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 100);
  });
  img.addEventListener('load', resizeCanvas);
  resizeCanvas();

  // Helpers to get pointer coords
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width  / rect.width),
      y: (clientY - rect.top ) * (canvas.height / rect.height)
    };
  }

  // Drawing handlers
  function startDraw(e) { e.preventDefault(); drawing = true; const {x,y}=getPos(e); ctx.beginPath(); ctx.moveTo(x,y); }
  function drawLine(e) { if (!drawing) return; e.preventDefault(); const {x,y}=getPos(e); ctx.lineTo(x,y); ctx.stroke(); }
    function endDraw() {
    if (!drawing) return;
    drawing = false;
    // push the new state
    undoStack.push(canvas.toDataURL());
    // immediately auto-save to server (no page reload)
    saveDrawing(true);
  }

  ['mousedown','touchstart'].forEach(evt => canvas.addEventListener(evt, startDraw));
  ['mousemove','touchmove'].forEach(evt => canvas.addEventListener(evt, drawLine));
  ['mouseup','mouseout','touchend','touchcancel'].forEach(evt => canvas.addEventListener(evt, endDraw));

  function redraw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!undoStack.length) return;
    const imgState = new Image();
    imgState.src = undoStack[undoStack.length - 1];
    imgState.onload = () => ctx.drawImage(imgState, 0, 0, canvas.width, canvas.height);
  }

  undoBtn.addEventListener('click', () => {
    undoStack.pop();
    redraw();
    saveDrawing(true);
  });

  saveBtn.addEventListener('click', () => saveDrawing(false));

  function saveDrawing(isAuto) {
    if (!isAuto) {
      saveBtn.textContent = 'Saving…';
      saveBtn.disabled    = true;
    }
    const merged = document.createElement('canvas');
    const mctx   = merged.getContext('2d');
    merged.width  = img.naturalWidth;
    merged.height = img.naturalHeight;
    mctx.drawImage(img, 0, 0, merged.width, merged.height);
    const sx = merged.width  / canvas.width;
    const sy = merged.height / canvas.height;
    mctx.drawImage(canvas, 0, 0, canvas.width * sx, canvas.height * sy);

    merged.toBlob(blob => {
      const fd = new FormData();
      fd.append('file', blob, GUEST ? `current_${GUEST}.jpg` : 'current.jpg');
      fetch(UPLOAD_URL, {
        method: 'POST',
        headers: { 'X-Requested-With': 'XMLHttpRequest' },
        body: fd
      })
      .then(r => r.json())
      .then(() => {
        if (!isAuto) {
          saveBtn.textContent = '✔️ Saved';
          setTimeout(() => {
            saveBtn.textContent = 'Save ✔️';
            saveBtn.disabled    = false;
          }, 800);
        }
      })
      .catch(err => {
        console.error('Save error:', err);
        if (!isAuto) saveBtn.textContent = 'Error';
      });
    }, 'image/jpeg', 0.95);
  }
});