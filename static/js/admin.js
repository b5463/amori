// static/js/admin.js
// ────────────────────────────────────────────────────────────
// 1) Wait for the DOM, then wire everything up
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // 1a) Load Socket.IO
  const socket = io();

  // 1b) assign-drink dropdowns
  document.querySelectorAll('.assign-drink').forEach(select => {
    select.addEventListener('change', async () => {
      const name = select.dataset.guest;
      const val  = select.value;
      try {
        await fetch(`/api/guest/${encodeURIComponent(name)}`, {
          method:  'PATCH',
          headers: {'Content-Type':'application/json'},
          body:    JSON.stringify({ assigned_drink: val })
        });
        // flash highlight
        const td = select.closest('td');
        td.style.background = 'rgba(0,255,231,0.2)';
        setTimeout(() => td.style.background = '', 500);
      } catch(err) {
        console.error('assign-drink PATCH failed', err);
      }
    });
  });

  // 1c) ▶ Rate buttons (on BOTH admin.html *and* admin_ratings.html)
  document.querySelectorAll('.rate-course').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('admin_rate_course', { course_id: +btn.dataset.id });
    });
  });

  // 1d) Stop-Rating (only on admin.html)
  const stopBtn = document.getElementById('stop-rating');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      socket.emit('admin_stop_rating', {});
    });
  }

  // 1e) Live-reload on image updates
  socket.on('image_updated', () =>
    setTimeout(() => location.reload(), 300)
  );

  // 1f) Live-reload on new ratings (admin_ratings.html)
  socket.on('new_rating', () =>
    setTimeout(() => location.reload(), 300)
  );
});