// Invite step: choose delivery channels + send the portal invitation.
// Sending writes an audit event and returns to the applications list.
// Mirrors dc.html invite data L1787-1792. Email/WhatsApp/SMS are stubbed.
import { api, ApiError } from '../api.js';
import { esc, emptyState, toast, runWithSpinner } from '../ui.js';

export async function renderInvite(mount, id, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading…</div>`;
  let app;
  try {
    app = (await api.getApplication(id)).application;
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 404 ? `Application ${id} not found.` : 'Could not load the invite.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Unable to open', hint: msg });
    return;
  }

  const channels = [
    { name: 'Email', detail: app.email, checked: true },
    { name: 'WhatsApp', detail: app.phone, checked: true },
    { name: 'SMS', detail: app.phone, checked: false },
  ];

  const rows = channels.map((c, i) => `
    <label style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:8px;
      border:1px solid ${c.checked ? '#00843d' : 'var(--color-hairline)'};background:${c.checked ? '#e0f4e8' : '#fff'};
      margin-bottom:10px;cursor:pointer;" data-row="${i}">
      <input type="checkbox" data-channel="${esc(c.name)}" ${c.checked ? 'checked' : ''}>
      <div style="flex:1;"><div style="font-weight:540;font-size:14px;">${esc(c.name)}</div>
        <div style="font-size:12px;color:var(--color-ink-mute);">${esc(c.detail || '—')}</div></div>
    </label>`).join('');

  mount.innerHTML = `
    <div style="max-width:640px;">
      <button id="back-link" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:12px;
        background:none;border:none;font-family:inherit;padding:0;">← All applications</button>
      <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.6px;margin-bottom:6px;">Send portal invitation</div>
      <div style="font-size:14px;color:var(--color-ink-mute);margin-bottom:20px;">${esc(app.business)} · ${esc(app.flag)} ${esc(app.country)} — choose how to deliver the portal invite.</div>

      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);margin-bottom:14px;">Delivery channels</div>
        ${rows}
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="btn-send" style="padding:11px 20px;background:#00843d;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Send invitation</button>
      </div>
    </div>`;

  mount.querySelector('#back-link').addEventListener('click', () => navigate('applications'));
  // Toggle row highlight on checkbox change.
  mount.querySelectorAll('input[data-channel]').forEach((cb) =>
    cb.addEventListener('change', () => {
      const row = cb.closest('[data-row]');
      row.style.border = `1px solid ${cb.checked ? '#00843d' : 'var(--color-hairline)'}`;
      row.style.background = cb.checked ? '#e0f4e8' : '#fff';
    }));

  mount.querySelector('#btn-send').addEventListener('click', async (e) => {
    const selected = [...mount.querySelectorAll('input[data-channel]:checked')].map((c) => c.dataset.channel);
    if (!selected.length) { toast('Select at least one channel'); return; }
    try {
      await runWithSpinner(e.currentTarget, () => api.sendInvite(id, selected), 'Sending…');
    } catch {
      toast('Could not send the invitation — is the backend running?');
      return;
    }
    toast(`Portal invitation sent via ${selected.join(' + ')}`);
    navigate('applications');
  });
}
