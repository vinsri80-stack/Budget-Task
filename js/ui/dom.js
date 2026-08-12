/**
 * ui/dom.js — a ~70-line view layer. No framework, no build step.
 * `h()` is deliberately shaped like React.createElement so the view modules
 * read the same way when ported to React Native (see docs/react-native/).
 */

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const frag = (...children) => {
  const f = document.createDocumentFragment();
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    f.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return f;
};

export function mount(container, ...children) {
  container.replaceChildren(frag(...children));
  return container;
}

/* ---------------- shared widgets ---------------- */

export function card(title, ...body) {
  return h('section', { class: 'card' },
    title && h('h3', { class: 'card-title' }, title),
    ...body);
}

/** Same as card(), plus a coloured left stripe and matching title. */
export function tintedCard(accent, title, ...body) {
  return h('section', { class: 'card', 'data-accent': accent },
    title && h('h3', { class: 'card-title' }, title),
    ...body);
}

export function statCard(label, value, opts = {}) {
  return h('div', { class: `stat ${opts.tone ? `stat-${opts.tone}` : ''}` },
    h('p', { class: 'stat-label' }, label),
    h('p', { class: 'stat-value' }, value),
    opts.caption && h('p', { class: 'stat-caption' }, opts.caption));
}

export function row(left, right, opts = {}) {
  return h('div', { class: `row ${opts.class ?? ''}` },
    h('div', { class: 'row-main' },
      h('span', { class: 'row-label' }, left),
      opts.detail && h('span', { class: 'row-detail' }, opts.detail)),
    h('div', { class: 'row-right' },
      h('span', { class: `row-amount ${opts.amountClass ?? ''}` }, right),
      opts.badge && h('span', { class: `badge badge-${opts.badgeTone ?? 'due'}` }, opts.badge),
      opts.action));
}

export function progressBar(pct, tone = '') {
  return h('div', { class: 'bar' },
    h('div', { class: `bar-fill ${tone}`, style: { width: `${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%` } }));
}

export function empty(text) {
  return h('p', { class: 'empty' }, text);
}

export function iconBtn(label, onclick, cls = '') {
  return h('button', { class: `icon-btn ${cls}`, type: 'button', title: label, onClick: onclick }, label);
}

/* ---------------- toast ---------------- */

let toastTimer;
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast' });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------------- modal ---------------- */

export function modal(title, bodyEl, { onSubmit, submitLabel = 'Save' } = {}) {
  const close = () => overlay.remove();
  const form = h('form', { class: 'modal-body', onSubmit: (e) => { e.preventDefault(); onSubmit?.(new FormData(form), close); } },
    bodyEl,
    h('div', { class: 'modal-actions' },
      h('button', { type: 'button', class: 'btn btn-ghost', onClick: close }, 'Cancel'),
      h('button', { type: 'submit', class: 'btn btn-primary' }, submitLabel)));

  const overlay = h('div', { class: 'overlay', onClick: (e) => { if (e.target === overlay) close(); } },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' },
      h('div', { class: 'modal-head' },
        h('h3', {}, title),
        h('button', { type: 'button', class: 'icon-btn', onClick: close, 'aria-label': 'Close' }, '×')),
      form));

  document.body.appendChild(overlay);
  overlay.querySelector('input,select,textarea')?.focus();
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  return close;
}

export function field(label, input, hint) {
  return h('label', { class: 'field' },
    h('span', { class: 'field-label' }, label),
    input,
    hint && h('span', { class: 'field-hint' }, hint));
}

export const input = (name, attrs = {}) => h('input', { name, class: 'input', ...attrs });

export const select = (name, options, value, attrs = {}) =>
  h('select', { name, class: 'input', ...attrs },
    ...options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)));
