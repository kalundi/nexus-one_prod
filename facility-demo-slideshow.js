(() => {
  'use strict';
  const carousel = document.getElementById('nexusShowcase');
  if (!carousel) return;
  const screen = document.getElementById('loginScreen');
  const slides = [...carousel.querySelectorAll('.nexusSlide')];
  const dots = [...carousel.querySelectorAll('[data-slide-index]')];
  const pause = document.getElementById('nexusSlidePause');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let current = 0;
  let stopped = reduced.matches;
  let hovered = false;
  let focused = false;
  let timer;
  function schedule() {
    clearTimeout(timer);
    pause.textContent = stopped ? 'Play slideshow' : 'Pause slideshow';
    pause.setAttribute('aria-pressed', String(stopped));
    if (!stopped && !hovered && !focused && !document.hidden && !screen.hidden) {
      timer = setTimeout(() => show(current + 1), 8000);
    }
  }
  function show(index) {
    current = (index + slides.length) % slides.length;
    slides.forEach((slide, i) => {
      slide.classList.toggle('isActive', i === current);
      slide.setAttribute('aria-hidden', String(i !== current));
      dots[i].setAttribute('aria-pressed', String(i === current));
    });
    schedule();
  }
  carousel.addEventListener('click', event => {
    const dot = event.target.closest('[data-slide-index]');
    const step = event.target.closest('[data-slide-step]');
    if (dot) show(Number(dot.dataset.slideIndex));
    if (step) show(current + Number(step.dataset.slideStep));
  });
  pause.addEventListener('click', () => { stopped = !stopped; schedule(); });
  carousel.addEventListener('mouseenter', () => { hovered = true; schedule(); });
  carousel.addEventListener('mouseleave', () => { hovered = false; schedule(); });
  carousel.addEventListener('focusin', () => { focused = true; schedule(); });
  carousel.addEventListener('focusout', event => {
    focused = carousel.contains(event.relatedTarget);
    schedule();
  });
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => { stopped = reduced.matches; schedule(); });
  new MutationObserver(schedule).observe(screen, { attributes: true, attributeFilter: ['hidden'] });
  schedule();
})();
