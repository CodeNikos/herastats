/** Toast ligero (sin dependencias) para avisos breves en anotación en vivo. */

let toastRoot = null;

/**
 * @param {string} message
 * @param {{ duration?: number, variant?: 'warning' | 'error' | 'info' }} [options]
 */
export function showToast(message, options = {}) {
  if (typeof document === 'undefined') return;
  const { duration = 3500, variant = 'warning' } = options;
  const text = String(message ?? '').trim();
  if (!text) return;

  if (!toastRoot) {
    toastRoot = document.createElement('div');
    toastRoot.className = 'hera-toast-root';
    toastRoot.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastRoot);
  }

  const el = document.createElement('div');
  el.className = `hera-toast hera-toast--${variant}`;
  el.setAttribute('role', 'alert');
  el.textContent = text;
  toastRoot.appendChild(el);

  requestAnimationFrame(() => {
    el.classList.add('hera-toast--visible');
  });

  const dismiss = () => {
    el.classList.remove('hera-toast--visible');
    window.setTimeout(() => el.remove(), 280);
  };

  window.setTimeout(dismiss, duration);
}
