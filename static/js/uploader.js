document.addEventListener('DOMContentLoaded', () => {
  const uploadBtn = document.getElementById('uploadButton');
  const fileInput = document.getElementById('fileInput');
  const form      = document.getElementById('uploadForm');

  uploadBtn?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length) form.submit();
  });
});