document.addEventListener('DOMContentLoaded', async () => {
    const name    = window.GUEST_NAME;
    const img     = document.getElementById('menuImage');
    const canvas  = document.getElementById('highlightCanvas');
    const drinkEl = document.getElementById('yourDrink');
    const toggle  = document.getElementById('drawToggle');
    let drawing = false, ctx;
  
    // 1) Fetch & display assigned drink
    try {
      const resp = await fetch(`/api/guest/${encodeURIComponent(name)}`);
      const data = await resp.json();
      drinkEl.textContent = data.assigned_drink || '(none)';
    } catch (e) {
      console.error('Failed to load drink:', e);
    }
  
    // 2) Live‐update via Socket.IO
    const socket = io();
    socket.on('image_updated', ({ last_modified, guest }) => {
      // Reload if base menu changed or this guest’s menu changed
      if (guest === null || guest === name) {
        img.src = `${img.src.split('?')[0]}?t=${last_modified}`;
      }
    });
  
    // 3) Setup canvas once image is loaded
    img.addEventListener('load', () => {
      canvas.width  = img.clientWidth;
      canvas.height = img.clientHeight;
      canvas.style.width  = img.clientWidth + 'px';
      canvas.style.height = img.clientHeight + 'px';
      canvas.style.display = 'none';
      ctx = canvas.getContext('2d');
      ctx.fillStyle = 'rgba(211,108,108,0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    });
  
    // 4) Toggle doodle mode
    toggle.addEventListener('click', () => {
      const show = canvas.style.display === 'none';
      canvas.style.display = show ? 'block' : 'none';
      toggle.textContent   = show ? '🖼️ View Only' : '✏️ Doodle';
      if (show) {
        ctx.strokeStyle = 'rgba(211,108,108,0.8)';
        ctx.lineWidth   = 3;
      }
    });
  
    // 5) Drawing handlers
    ['mousedown','touchstart'].forEach(evt => canvas.addEventListener(evt, start));
    ['mousemove','touchmove'].forEach(evt => canvas.addEventListener(evt, draw));
    ['mouseup','mouseout','touchend','touchcancel'].forEach(evt => canvas.addEventListener(evt, end));
  
    function getPos(e) {
      const r = canvas.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      const y = (e.touches ? e.touches[0].clientY : e.clientY) - r.top;
      return { x, y };
    }
  
    function start(e) {
      if (canvas.style.display === 'none') return;
      e.preventDefault();
      drawing = true;
      const { x, y } = getPos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  
    function draw(e) {
      if (!drawing) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  
    function end() {
      drawing = false;
    }
  });  