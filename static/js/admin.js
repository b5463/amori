// ────────────────────────────────────────────────────────────
// CosyPOS Admin client-side logic (extended version)
// ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ========== 0. Socket.IO ===================================================
  const socket = io();

  // ========== 1. Assign-drink dropdowns =====================================
  document.querySelectorAll('.assign-drink').forEach(select => {
    select.addEventListener('change', async () => {
      const name = select.dataset.guest;
      const val  = select.value;
      try {
        await fetch(`/api/guest/${encodeURIComponent(name)}`, {
          method:'PATCH',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({ assigned_drink:val })
        });
        // flash highlight
        const td = select.closest('td');
        td.style.background = 'rgba(0,255,231,0.2)';
        setTimeout(()=>td.style.background='',500);
      } catch(err){
        console.error('assign-drink PATCH failed',err);
      }
    });
  });

  // ========== 2. Rate buttons ===============================================
  document.querySelectorAll('.rate-course').forEach(btn => {
    btn.addEventListener('click', () => {
      socket.emit('admin_rate_course', { course_id:+btn.dataset.id });
    });
  });

  // stop-rating
  const stopBtn = document.getElementById('stop-rating');
  if (stopBtn){
    stopBtn.addEventListener('click', ()=>socket.emit('admin_stop_rating',{}));
  }

  // live reloads
  socket.on('image_updated', () => setTimeout(()=>location.reload(),300));
  socket.on('new_rating',   () => setTimeout(()=>location.reload(),300));

  // ========== 3. Tab switching (responsive tweak) ===========================
  const tabButtons  = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.querySelector('.tab-button.active')?.classList.remove('active');
      btn.classList.add('active');
      document.querySelector('.tab-content.active')?.classList.remove('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });

  // auto-select default tab depending on width
  const mq = window.matchMedia('(min-width:1024px)');
  const setDefaultTab = () => {
    const target = mq.matches
      ? document.querySelector('[data-tab="menus"]')
      : document.querySelector('[data-tab="drinks"]');
    target.click();
  };
  setDefaultTab();
  mq.addListener(setDefaultTab);

  // ========== 4. Scroll drink-mini list to bottom on add ====================
  const drinkMiniForm = document.querySelector('#drink-mini .drink-form');
  if (drinkMiniForm){
    drinkMiniForm.addEventListener('submit', ()=>{
      setTimeout(()=>{
        const list = document.querySelector('#drink-mini .drink-details');
        if (list) list.scrollTop = list.scrollHeight;
      },150);
    });
  }
});