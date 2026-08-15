// Shared agent management actions (M4): terminate, delete, and rate. Both the
// agent directory (agents.js) and the individual agent profile (agent-detail.js)
// drive the same flows through here, so the audit-backed behaviour lives in one
// place. Each opener takes the agent object and an { onDone } callback invoked
// with the server's updated agent (or null for a delete).
import { api, ApiError } from '../api.js';
import { esc, modal, toast, setButtonBusy } from '../ui.js';

const errFrom = (err, fallback) =>
  (err instanceof ApiError && err.detail) ? String(err.detail) : fallback;

// Inline SVG star row for a 0..5 rating (supports halves). `size` in px.
export function starRow(rating, size = 15) {
  const r = Number(rating) || 0;
  const star = (fill) => `
    <svg width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" style="display:block;">
      <defs><linearGradient id="g${fill}"><stop offset="${fill * 100}%" stop-color="#f5a623"/>
        <stop offset="${fill * 100}%" stop-color="#e6e2da"/></linearGradient></defs>
      <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.2l-4.94 2.6.94-5.5-4-3.9 5.53-.8z"
        fill="${fill <= 0 ? '#e6e2da' : fill >= 1 ? '#f5a623' : `url(#g${fill})`}"/>
    </svg>`;
  const stars = Array.from({ length: 5 }, (_, i) => {
    const fill = Math.max(0, Math.min(1, r - i));
    return star(fill);
  }).join('');
  const label = r > 0 ? `${r.toFixed(1)}` : 'Not rated';
  return `<span style="display:inline-flex;align-items:center;gap:6px;">
    <span style="display:inline-flex;gap:2px;">${stars}</span>
    <span style="font-size:13px;color:var(--color-ink-mute);font-weight:540;">${esc(label)}</span></span>`;
}

// Terminate an active agent with a mandatory reason.
export function openTerminate(agent, { onDone } = {}) {
  modal({
    title: `Terminate ${agent.name}?`,
    maxWidth: 480,
    bodyHtml: `
      <div style="font-size:13px;color:var(--color-ink-mute);line-height:1.5;margin-bottom:16px;">
        This ends the active partnership and marks the agent <strong>Terminated</strong>.
        The reason is recorded on the audit trail.</div>
      <label style="display:block;font-size:12px;font-weight:600;color:var(--color-ink-mute);
        text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Reason</label>
      <textarea data-reason rows="3" placeholder="e.g. Repeated compliance breaches; agreement not renewed"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--color-hairline);
        border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;"></textarea>
      <div data-err style="color:#a12020;font-size:12px;margin-top:8px;min-height:14px;"></div>`,
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Terminate agent', kind: 'danger', keepOpen: true,
        onClick: async (overlay) => {
          const ta = overlay.querySelector('[data-reason]');
          const errEl = overlay.querySelector('[data-err]');
          const btn = overlay.querySelectorAll('button')[1];
          const reason = ta.value.trim();
          if (!reason) { errEl.textContent = 'A reason is required.'; ta.focus(); return; }
          errEl.textContent = '';
          const restore = setButtonBusy(btn, 'Terminating…');
          try {
            const updated = await api.terminateAgent(agent.id, reason);
            overlay.remove();
            toast(`${agent.name} terminated`);
            onDone && onDone(updated);
          } catch (err) {
            restore();
            errEl.textContent = errFrom(err, 'Could not terminate the agent.');
          }
        },
      },
    ],
  });
}

// Permanent hard delete of the agent row.
export function openDelete(agent, { onDone } = {}) {
  modal({
    title: `Delete ${agent.name}?`,
    maxWidth: 460,
    bodyHtml: `
      <div style="font-size:13px;color:var(--color-ink-mute);line-height:1.5;">
        This permanently removes the agent row from the directory. This cannot be undone —
        for ending a live partnership, use <strong>Terminate</strong> instead so the record is retained.</div>
      <div data-err style="color:#a12020;font-size:12px;margin-top:10px;min-height:14px;"></div>`,
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Delete permanently', kind: 'danger', keepOpen: true,
        onClick: async (overlay) => {
          const errEl = overlay.querySelector('[data-err]');
          const btn = overlay.querySelectorAll('button')[1];
          errEl.textContent = '';
          const restore = setButtonBusy(btn, 'Deleting…');
          try {
            await api.deleteAgent(agent.id);
            overlay.remove();
            toast(`${agent.name} removed`);
            onDone && onDone(null);
          } catch (err) {
            restore();
            errEl.textContent = errFrom(err, 'Could not delete the agent.');
          }
        },
      },
    ],
  });
}

// Rate an agent 1..5 with an optional note. Interactive star picker.
export function openRate(agent, { onDone } = {}) {
  let picked = Math.round(Number(agent.rating) || 0) || 0;

  const close = modal({
    title: `Rate ${agent.name}`,
    maxWidth: 460,
    bodyHtml: `
      <div style="font-size:13px;color:var(--color-ink-mute);line-height:1.5;margin-bottom:16px;">
        Record a partnership rating from 1 to 5. This overwrites the current rating and is logged.</div>
      <div data-stars style="display:flex;gap:6px;margin-bottom:16px;"></div>
      <label style="display:block;font-size:12px;font-weight:600;color:var(--color-ink-mute);
        text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px;">Note (optional)</label>
      <textarea data-note rows="2" placeholder="What drove this rating?"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid var(--color-hairline);
        border-radius:8px;font-family:inherit;font-size:13px;resize:vertical;">${esc(agent.rating_note || '')}</textarea>
      <div data-err style="color:#a12020;font-size:12px;margin-top:8px;min-height:14px;"></div>`,
    actions: [
      { label: 'Cancel', kind: 'ghost' },
      {
        label: 'Save rating', kind: 'primary', keepOpen: true,
        onClick: async (overlay) => {
          const errEl = overlay.querySelector('[data-err]');
          const btn = overlay.querySelectorAll('button')[1];
          if (!picked) { errEl.textContent = 'Pick a rating from 1 to 5.'; return; }
          errEl.textContent = '';
          const restore = setButtonBusy(btn, 'Saving…');
          try {
            const note = overlay.querySelector('[data-note]').value.trim();
            const updated = await api.rateAgent(agent.id, picked, note);
            overlay.remove();
            toast(`${agent.name} rated ${picked}/5`);
            onDone && onDone(updated);
          } catch (err) {
            restore();
            errEl.textContent = errFrom(err, 'Could not save the rating.');
          }
        },
      },
    ],
  });

  // Build the interactive star picker inside the open modal.
  const wrap = document.querySelector('[data-stars]');
  function paintPicker() {
    wrap.innerHTML = Array.from({ length: 5 }, (_, i) => {
      const on = i < picked;
      return `<button data-val="${i + 1}" aria-label="${i + 1} star" style="background:none;border:none;
        cursor:pointer;padding:0;line-height:0;font-size:28px;color:${on ? '#f5a623' : '#d9d4cb'};
        font-family:inherit;">★</button>`;
    }).join('');
    wrap.querySelectorAll('button').forEach((b) => {
      b.addEventListener('click', () => { picked = Number(b.dataset.val); paintPicker(); });
    });
  }
  if (wrap) paintPicker();
  return close;
}
