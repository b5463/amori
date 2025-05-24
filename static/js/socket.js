document.addEventListener('DOMContentLoaded', () => {
  const img = document.getElementById('displayImage');
  if (!img) return;

  const socket = io();
  socket.on('image_updated', ({ last_modified }) => {
    const prev = localStorage.getItem('last_modified');
    if (!prev || prev < last_modified) {
      localStorage.setItem('last_modified', last_modified);
      img.src = `${img.src.split('?')[0]}?t=${last_modified}`;
    }
  });
});