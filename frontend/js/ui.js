// Shared render helpers used across pages. Keep these tiny and dependency-free.

export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Status pill colours mirror the comp's status() helper.
const STATUS_COLORS = {
  'New': ['#e8eefc', '#00247d'],
  'In Review': ['#fff6d6', '#8a6d00'],
  'Pending Documents': ['#fce8db', '#a8531a'],
  'Pending Agent Response': ['#efe4fb', '#6a3fa0'],
  'Approved': ['#e0f4e8', '#00843d'],
  'Agreement Sent': ['#e8eefc', '#00247d'],
  'Agreement Signed': ['#e0f4e8', '#00843d'],
  'Rejected': ['#fbe3e3', '#a12020'],
  'Active': ['#e0f4e8', '#00843d'],
  'Expiring Soon': ['#fff6d6', '#8a6d00'],
  'Suspended': ['#fbe3e3', '#a12020'],
  'Terminated': ['#eeece9', '#73706d'],
};

export function statusPill(status) {
  const [bg, color] = STATUS_COLORS[status] || ['#eeece9', '#73706d'];
  return `<span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;background:${bg};color:${color};">${esc(status)}</span>`;
}

// M2.5 review helpers ------------------------------------------------------
const SYSTEM_COLORS = {
  pass: ['#e0f4e8', '#00843d', 'Verified'],
  flag: ['#fff4d4', '#8a6b00', 'Flagged'],
  fail: ['#fbe3e3', '#a12020', 'Failed'],
  pending: ['#eeece9', '#73706d', 'Not scanned'],
  na: ['#eeece9', '#73706d', 'N/A'],
};
const ADMIN_COLORS = {
  approved: ['#e0f4e8', '#00843d', 'Approved'],
  rejected: ['#fbe3e3', '#a12020', 'Flagged'],
  pending: ['#eeece9', '#73706d', 'Pending'],
};

function pill(bg, color, text, prefix = '') {
  return `<span style="font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;
    background:${bg};color:${color};">${prefix}${esc(text)}</span>`;
}

// Two-tier badge: what the system found + whether a human signed off.
export function dualBadge(systemStatus, adminStatus) {
  const [sb, sc, st] = SYSTEM_COLORS[systemStatus] || SYSTEM_COLORS.pending;
  const [ab, ac, at] = ADMIN_COLORS[adminStatus] || ADMIN_COLORS.pending;
  return `<span style="display:inline-flex;gap:6px;align-items:center;">
    ${pill(sb, sc, st, 'System: ')}${pill(ab, ac, at, 'Admin: ')}</span>`;
}

export function signalIcon(status) {
  const map = { pass: ['#00843d', '✓'], flag: ['#8a6b00', '!'], fail: ['#a12020', '✕'],
    human: ['#00247d', '☺'], na: ['#9a9794', '–'] };
  const [color, ch] = map[status] || map.na;
  return `<span style="color:${color};font-size:18px;font-weight:700;line-height:1;
    display:inline-flex;align-items:center;justify-content:center;width:20px;flex-shrink:0;">${ch}</span>`;
}

export function confidenceChip(conf) {
  if (conf == null) return '';
  return `<span style="font-size:10px;color:var(--color-ink-faint);border:1px solid var(--color-hairline);
    border-radius:999px;padding:1px 6px;">Confidence: ${conf}</span>`;
}

// Legitimacy score: how much we trust the value is genuine/valid (PRD rules).
// Verified / Review / Suspect bucket; exact % on hover (title attr).
export function confidenceBucketChip(conf) {
  if (conf == null) return '';
  const pct = Math.round(conf * 100);
  const [label, bg, color] = conf >= 0.85 ? ['Verified', '#e0f4e8', '#00843d']
    : conf >= 0.60 ? ['Review', '#fff4d4', '#8a6b00']
    : ['Suspect', '#fbe3e3', '#a12020'];
  return `<span title="Legitimacy: ${pct}%" style="font-size:10px;font-weight:600;
    background:${bg};color:${color};border-radius:999px;padding:2px 8px;cursor:help;">${label}</span>`;
}

// M2.6: source-page marker with a tooltip.
export function sourcePage(page) {
  if (!page) return '';
  return `<span title="Found on page ${page}" style="font-size:10px;color:var(--color-ink-faint);
    cursor:help;">p.${page}</span>`;
}

export function emptyState({ icon = '🗂', title, hint }) {
  return `
    <div class="empty-state">
      <div class="empty-state__icon">${icon}</div>
      <div class="empty-state__title">${esc(title)}</div>
      <div class="empty-state__hint">${esc(hint)}</div>
    </div>`;
}

// Modal dialog matching the comp's overlay + card. `actions` is an array of
// { label, kind: 'primary'|'danger'|'dark'|'ghost', onClick }. Returns a close()
// fn; clicking the overlay or a non-ghost action closes automatically.
export function modal({ title, bodyHtml, actions = [], maxWidth = 520, onClose }) {
  const kinds = {
    primary: 'background:var(--color-primary);color:#fff;border:none;',
    danger: 'background:#a12020;color:#fff;border:none;',
    dark: 'background:var(--color-ink);color:#fff;border:none;',
    ghost: 'background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);',
  };
  const overlay = el(`
    <div style="position:fixed;inset:0;background:rgba(41,40,39,0.4);display:flex;
      align-items:center;justify-content:center;z-index:100;padding:24px;">
      <div role="dialog" style="background:#fff;border-radius:16px;padding:32px;
        max-width:${maxWidth}px;width:100%;box-shadow:var(--shadow-2);">
        <div style="font-family:var(--font-display);font-weight:540;font-size:22px;
          letter-spacing:-0.4px;margin-bottom:12px;">${esc(title)}</div>
        <div data-body></div>
        <div data-actions style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;"></div>
      </div>
    </div>`);
  overlay.querySelector('[data-body]').innerHTML = bodyHtml || '';

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.remove();
    if (onClose) onClose();
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const actionsRow = overlay.querySelector('[data-actions]');
  actions.forEach((a) => {
    const btn = el(`<button style="padding:10px 18px;border-radius:8px;font-size:13px;
      font-weight:600;cursor:pointer;font-family:inherit;${kinds[a.kind] || kinds.ghost}">${esc(a.label)}</button>`);
    btn.addEventListener('click', () => {
      if (a.onClick) a.onClick(overlay);
      if (!a.keepOpen) close();
    });
    actionsRow.appendChild(btn);
  });

  document.body.appendChild(overlay);
  return close;
}

let toastTimer = null;
export function toast(message) {
  let node = document.getElementById('amp-toast');
  if (!node) {
    node = el(`<div id="amp-toast" style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
      background:#292827;color:#fff;padding:12px 20px;border-radius:8px;font-size:13px;
      box-shadow:var(--shadow-2);z-index:1000;opacity:0;transition:opacity .2s;"></div>`);
    document.body.appendChild(node);
  }
  node.textContent = message;
  requestAnimationFrame(() => { node.style.opacity = '1'; });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.style.opacity = '0'; }, 2600);
}
