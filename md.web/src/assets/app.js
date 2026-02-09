import { applyMaterialIcons } from '../utils/iconAdapter.js';

const scheduleApply = () => {
  requestAnimationFrame(() => applyMaterialIcons(document));
};

const observeIconTargets = () => {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyMaterialIcons(document);
    });
  });

  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 3000);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    scheduleApply();
    observeIconTargets();
  });
} else {
  scheduleApply();
  observeIconTargets();
}

