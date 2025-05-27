// static/js/wizard.js

document.addEventListener('DOMContentLoaded', () => {
  const NAME           = window.GUEST_NAME;
  const PROGRESS_STEPS = window.PROGRESS_STEPS;   // e.g. 10 real steps
  const TOTAL_STEPS    = window.TOTAL_STEPS;      // PROGRESS_STEPS + 1
  const REDIRECT_URL   = window.REDIRECT_URL;     // where to go after splash
  const TAKEN          = window.TAKEN_SEATS || [];
  let current          = 1;

  const steps     = Array.from(document.querySelectorAll('.step'));
  const bar       = document.querySelector('.progress-bar .bar');
  const label     = document.querySelector('.progress-text .current');
  const nextBtn   = document.querySelector('.wizard-footer .next');
  const finishBtn = document.getElementById('finish');
  const backBtn   = document.querySelector('.back-btn');

  function showStep(n) {
    // Toggle active class
    steps.forEach(s =>
      s.classList.toggle('active', +s.dataset.step === n)
    );

    // Update progress bar + label
    if (n <= PROGRESS_STEPS) {
      const pct = (n - 1) / (PROGRESS_STEPS - 1) * 100;
      bar.style.width = pct + '%';
      label.textContent = n;
    } else {
      // splash step
      bar.style.width = '100%';
    }

    // Button visibility & text
    if (n < PROGRESS_STEPS) {
      nextBtn.style.display   = 'block';
      finishBtn.style.display = 'none';
      nextBtn.textContent     = 'Ďalšia otázka';
      // always allow Next on step 9 (optional)
      nextBtn.disabled        = (n === PROGRESS_STEPS - 1) ? false : true;
    }
    else if (n === PROGRESS_STEPS) {
      nextBtn.style.display   = 'none';
      finishBtn.style.display = 'block';
      finishBtn.textContent   = 'Hotovo';
      finishBtn.disabled = true;
    }
    else {
      // splash: hide both
      nextBtn.style.display   =
      finishBtn.style.display = 'none';
    }
  }

  async function saveAndAdvance(isFinish = false) {
    const stepEl = document.querySelector(`.step[data-step="${current}"]`);
    const payload = {};
    let val = null;

    // Collect answer for this step…
    if (current === 4) {
      // diet radio + optional text
      const r = stepEl.querySelector('input[name="diet"]:checked');
      if (r) {
        val = r.value === 'other'
          ? stepEl.querySelector('.diet-other').value.trim() || null
          : r.value;
      }

    } else if (current === 6) {
      // experience checkboxes + optional text
      const checked = Array.from(
        stepEl.querySelectorAll('input[type="checkbox"]:checked')
      ).map(i => i.value);

      if (checked.length) {
        if (checked.includes('other')) {
          const t   = stepEl.querySelector('.exp-other');
          const txt = t.value.trim();
          val = checked.filter(x => x !== 'other');
          if (txt) val.push(txt);
        } else {
          val = checked;
        }
      }

    } else if (current === 10) {
      // seating radio
      const sel = stepEl.querySelector('input[name="seating"]:checked');
      if (sel) val = sel.value;

    } else {
      // generic option-btn, select, or textarea
      const btn = stepEl.querySelector('.option-btn.selected');
      if (btn) {
        val = btn.dataset.value;
      } else if (stepEl.querySelector('.dropdown-select')) {
        const sel = stepEl.querySelector('.dropdown-select').value;
        val = sel === 'other'
          ? stepEl.querySelector('.other-textarea').value.trim() || null
          : sel;
      } else if (stepEl.querySelector('.textarea-input')) {
        val = stepEl.querySelector('.textarea-input').value.trim() || null;
      }
    }

    // Map to payload
    switch (current) {
      case 1:  payload.first_time = val;          break;
      case 2:
        payload.allergies = (!val || val === 'none')
          ? []
          : Array.isArray(val) ? val : [val];
        break;
      case 3:  payload.avoid      = val;          break;
      case 4:  payload.diet       = val;          break;
      case 5:  payload.will_drink = val;          break;
      case 6:  payload.experience = val || [];    break;
      case 7:  payload.intensity  = val;          break;
      case 8:  payload.likes      = val;          break;
      case 9:  payload.notes      = val;          break;
      case 10: payload.seating    = val;          break;
    }

    // Persist
    await fetch(
      `/api/guest/${encodeURIComponent(NAME)}`,
      {
        method:  'PATCH',
        headers: {'Content-Type': 'application/json'},
        body:    JSON.stringify(payload)
      }
    );

    // If Finish, jump straight to splash
    if (isFinish) {
      current = TOTAL_STEPS;   // e.g. 11
      showStep(current);

      setTimeout(() => {
        window.location.href = REDIRECT_URL;
      }, 4000);

      return;
    }

    // Otherwise advance normally
    current++;
    bindStep(current);
    showStep(current);
  }

  nextBtn.onclick   = () => saveAndAdvance(false);
  finishBtn.onclick = () => saveAndAdvance(true);
  backBtn.addEventListener('click', () => {
    if (current > 1) {
      current--;
      bindStep(current);
      showStep(current);
    } else {
      history.back();
    }
  });

  function bindStep(n) {
    const stepEl = document.querySelector(`.step[data-step="${n}"]`);
    // clear old handlers
    stepEl.querySelectorAll('button, select, textarea, input')
      .forEach(el => el.onclick = el.onchange = null);

    // OPTION BUTTONS (except 4 & 6)
    const opts = Array.from(stepEl.querySelectorAll('.option-btn'));
    if (opts.length && !stepEl.querySelector('select') && n !== 4 && n !== 6) {
      opts.forEach(b => {
        b.onclick = () => {
          opts.forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          nextBtn.disabled = finishBtn.disabled = false;
        };
      });
      return;
    }

    // DROPDOWN (step 2)
    const sel = stepEl.querySelector('.dropdown-select');
    if (sel) {
      const ota = stepEl.querySelector('.other-textarea');
      sel.onchange = () => {
        nextBtn.disabled = !sel.value;
        if (sel.value === 'other' && ota) ota.classList.add('visible');
        else if (ota) {
          ota.classList.remove('visible');
          ota.value = '';
        }
      };
      if (ota) ota.oninput = () => {
        nextBtn.disabled = ota.value.trim() === '';
      };
      return;
    }

    // DIET GRID (step 4)
    if (n === 4) {
      const radios = Array.from(stepEl.querySelectorAll('input[name="diet"]'));
      const dta    = stepEl.querySelector('.diet-other');
      radios.forEach(r => r.onchange = () => {
        radios.forEach(x =>
          x.closest('.option-btn').classList.remove('selected')
        );
        r.closest('.option-btn').classList.add('selected');
        if (r.value === 'other') dta.classList.add('visible');
        else {
          dta.classList.remove('visible');
          dta.value = '';
        }
        nextBtn.disabled = finishBtn.disabled = false;
      });
      return;
    }

    // EXPERIENCE (step 6)
    if (n === 6) {
      const checks   = Array.from(stepEl.querySelectorAll('input[type="checkbox"]'));
      const expOther = stepEl.querySelector('.exp-other');
      checks.forEach(c => c.onchange = () => {
        c.closest('.option-btn').classList.toggle('selected', c.checked);
        if (c.value === 'other' && expOther) {
          if (c.checked) expOther.classList.add('visible');
          else {
            expOther.classList.remove('visible');
            expOther.value = '';
          }
        }
        nextBtn.disabled = !stepEl.querySelector('input[type="checkbox"]:checked');
      });
      if (expOther) expOther.oninput = () => {
        nextBtn.disabled = !stepEl.querySelector('input[type="checkbox"]:checked');
      };
      return;
    }

    // OPTIONAL TEXT (step 9)
    if (n === 9) {
      nextBtn.disabled = false;
      return;
    }

    // SEAT PICKER (step 10)
    if (n === 10) {
      const seats = Array.from(stepEl.querySelectorAll('.seat'));
      seats.forEach(ch => {
        const inp = ch.querySelector('input');
        if (TAKEN.includes(inp.value)) {
          ch.classList.add('disabled');
          inp.disabled = true;
          return;
        }
        ch.onclick = () => {
          seats.forEach(x => x.classList.remove('selected'));
          inp.checked = true;
          ch.classList.add('selected');
          finishBtn.disabled = false;
        };
      });
      return;
    }

    // TEXTAREA FALLBACK (3,8)
    const fields = Array.from(stepEl.querySelectorAll('textarea'));
    fields.forEach(i => i.onchange = () => {
      const ok = i.value.trim() !== '';
      if (n === PROGRESS_STEPS) finishBtn.disabled = !ok;
      else                      nextBtn.disabled   = !ok;
    });
  }

  // Initialize
  bindStep(1);
  showStep(1);
});