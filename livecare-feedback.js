(function () {
  let form = document.getElementById('patientFeedbackForm');
  if (!form) {
    const section = document.createElement('section');
    section.id = 'patientFeedback';
    section.className = 'patientFeedbackSection';
    section.setAttribute('aria-labelledby', 'patientFeedbackTitle');
    section.innerHTML = `<div class="patientFeedbackIntro"><span class="eyebrow darkEyebrow">Help make Nexus better</span><h2 id="patientFeedbackTitle">How was your transportation experience?</h2><p>Your feedback helps us improve communication, accessibility, timeliness, and patient care. Please do not include medical diagnoses or other sensitive health information.</p><div class="patientFeedbackPromise"><strong>Every response matters</strong><span>Feedback is reviewed by the Nexus team and does not affect your current or future transportation.</span></div></div><form id="patientFeedbackForm" class="patientFeedbackCard"><fieldset><legend>Overall rating</legend><div class="patientRating" aria-label="Choose a rating from 1 to 5 stars">${[1,2,3,4,5].map(value=>`<label class="patientRatingStar" data-rating="${value}"><input type="radio" name="rating" value="${value}" ${value===1?'required':''}><span aria-hidden="true">★</span><small>${value}</small></label>`).join('')}</div></fieldset><label>What is your feedback about?<select name="category" required><option value="">Choose a topic</option><option value="DRIVER">Driver experience</option><option value="TIMELINESS">Pickup or arrival time</option><option value="COMMUNICATION">Communication</option><option value="BOOKING">Booking experience</option><option value="ACCESSIBILITY">Accessibility and mobility support</option><option value="LIVECARE">LiveCare experience</option><option value="OTHER">Something else</option></select></label><label>Your suggestion<textarea name="suggestion" required minlength="10" maxlength="2000" rows="5" placeholder="Tell us what worked well or what we could do better."></textarea><small>10–2,000 characters. Do not include medical information.</small></label><label>Ride reference <span>(optional)</span><input name="bookingReference" maxlength="40" autocomplete="off" placeholder="NMT-20260822-1234"></label><label class="patientFeedbackConsent"><input type="checkbox" name="contactPermission"><span>Nexus may contact me through the information already associated with my account or ride to follow up.</span></label><label class="patientFeedbackTrap" aria-hidden="true">Website<input name="website" tabindex="-1" autocomplete="off"></label><button class="button" type="submit">Send feedback securely</button><p id="patientFeedbackMessage" class="patientFeedbackMessage" role="status" aria-live="polite"></p></form>`;
    const liveCommand = document.getElementById('liveCommand');
    if (liveCommand) liveCommand.insertAdjacentElement('beforebegin', section);
    else document.querySelector('main#main')?.appendChild(section);
    form = document.getElementById('patientFeedbackForm');
  }
  if (!form) return;
  const submit = form.querySelector('[type="submit"]');
  const message = document.getElementById('patientFeedbackMessage');
  function syncRating() {
    const checked = form.querySelector('input[name="rating"]:checked');
    form.querySelectorAll('.patientRatingStar').forEach((label) => label.classList.toggle('is-selected', Number(label.dataset.rating) <= Number(checked?.value || 0)));
  }
  form.querySelectorAll('input[name="rating"]').forEach((input) => input.addEventListener('change', syncRating));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    message.className = 'patientFeedbackMessage';
    message.textContent = '';
    if (!form.reportValidity()) return;
    const data = Object.fromEntries(new FormData(form));
    data.rating = Number(data.rating);
    data.contactPermission = form.elements.contactPermission.checked;
    submit.disabled = true;
    submit.textContent = 'Sending feedback...';
    try {
      let token = '';
      try { token = sessionStorage.getItem('nexusAccessToken') || ''; } catch {}
      const response = await fetch('/api/patient-feedback', {method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(data)});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'We could not send your feedback. Please try again.');
      form.reset();
      syncRating();
      message.className = 'patientFeedbackMessage is-success';
      message.textContent = `Thank you for helping us improve. Feedback reference: ${result.reference}`;
    } catch (error) {
      message.className = 'patientFeedbackMessage is-error';
      message.textContent = error.message;
    } finally {
      submit.disabled = false;
      submit.textContent = 'Send feedback securely';
    }
  });
})();
