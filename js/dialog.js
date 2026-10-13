// <dialog>의 showModal()이 없는 구형 브라우저(iPadOS 15.3 이하 등)를 위한 최소 대체 구현
(() => {
  if (typeof HTMLDialogElement === 'function' && 'showModal' in HTMLDialogElement.prototype) return;
  const patch = d => {
    if (d.showModal) return;
    d.classList.add('dialog-fallback');
    d.showModal = d.show = () => { d.setAttribute('open', ''); };
    d.close = () => {
      if (!d.hasAttribute('open')) return;
      d.removeAttribute('open');
      d.dispatchEvent(new Event('close'));
    };
  };
  const run = () => document.querySelectorAll('dialog').forEach(patch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  run();
})();
