// static/js/rate.js
document.addEventListener('DOMContentLoaded', () => {
  console.log('rate.js loaded');
  const socket = io();

  // 1) Redirect guest when admin triggers a rating
  socket.on('rate_course', ({ course_id }) => {
    if (!window.GUEST_NAME) return;
    const dest = `/rate/${course_id}/${window.GUEST_NAME}`;
    if (location.pathname !== dest) {
      console.log('Redirecting guest to', dest);
      location.href = dest;
    }
  });

  // 2) Hook up the feedback form
  const form = document.getElementById('rate-form');
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const [ , , courseId, guest ] = location.pathname.split('/');
    const payload = {
      guest,
      course_id: parseInt(courseId, 10),
      score: parseInt(form.score.value, 10),
      feedback: form.feedback.value.trim()
    };
    console.log('Posting feedback:', payload);

    try {
      const res  = await fetch('/api/rate', {
        method: 'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await res.json();
      if (body.success) {
        console.log('Feedback saved, returning to menu');
        location.href = `/menu/${guest}`;
      } else {
        throw new Error('Server returned success=false');
      }
    } catch(err) {
      console.error('Failed to submit rating', err);
      alert('Oops! Could not save feedback. Please try again.');
    }
  });
});