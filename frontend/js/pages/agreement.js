// Agreement step: 3-step progress + agreement preview + key terms + Send.
// Sending records the agreement as Sent (+audit) and routes to Invite.
// Mirrors dc.html L659-716. Preview text is static (template content).
import { api, ApiError } from '../api.js';
import { esc, emptyState, toast, runWithSpinner } from '../ui.js';

const STEPS = [
  ['1', 'Approval', 'done'],
  ['2', 'Agreement', 'current'],
  ['3', 'Invite', 'upcoming'],
];

const TERMS = [
  ['Territory', 'India, Nepal, Sri Lanka', 'Non-exclusive appointment'],
  ['Commission', '15% of Year 1 tuition', 'Paid after census-date clearance'],
  ['Term', '24 months', 'Auto-renews unless terminated'],
  ['Compliance', 'MARN · QEAC · ESOS', 'Agent warrants current registration'],
  ['Governing law', 'Victoria, Australia', 'ESOS Act 2000 · ASQA'],
];

export async function renderAgreement(mount, id, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading…</div>`;
  let app;
  try {
    app = (await api.getApplication(id)).application;
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 404 ? `Application ${id} not found.` : 'Could not load the agreement.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Unable to open', hint: msg });
    return;
  }

  const stepper = STEPS.map(([n, label, state]) => {
    const bg = state === 'done' ? '#00843d' : state === 'current' ? '#00247d' : '#eeece9';
    const color = state === 'upcoming' ? '#9a9794' : '#fff';
    return `<div style="flex:1;display:flex;align-items:center;gap:10px;">
      <div style="width:26px;height:26px;border-radius:999px;display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:700;background:${bg};color:${color};">${state === 'done' ? '✓' : n}</div>
      <div><div style="font-size:11px;color:var(--color-ink-faint);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">Step ${n}</div>
        <div style="font-size:13px;font-weight:540;color:${state === 'upcoming' ? '#9a9794' : 'var(--color-ink)'};">${esc(label)}</div></div>
    </div>`;
  }).join('');

  const terms = TERMS.map(([label, value, hint]) => `
    <div style="display:grid;grid-template-columns:170px 1fr;padding:11px 0;border-top:1px solid #f3f0eb;font-size:13px;">
      <div style="color:var(--color-ink-mute);font-weight:540;">${esc(label)}</div>
      <div><div style="color:var(--color-ink);">${esc(value)}</div>
        <div style="color:var(--color-ink-faint);font-size:11px;margin-top:2px;">${esc(hint)}</div></div>
    </div>`).join('');

  mount.innerHTML = `
    <div style="max-width:960px;">
      <button id="back-link" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:12px;
        background:none;border:none;font-family:inherit;padding:0;">← All applications</button>
      <div style="display:flex;margin-bottom:24px;background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:12px 20px;">${stepper}</div>

      <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.6px;margin-bottom:6px;">Send official agreement</div>
      <div style="font-size:14px;color:var(--color-ink-mute);margin-bottom:20px;">${esc(app.business)} has been approved. Send the recruitment agreement to formalise the partnership before granting portal access.</div>

      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);margin-bottom:14px;">Agreement preview</div>
        <div style="background:var(--color-canvas-soft);border:1px solid var(--color-hairline);border-radius:8px;padding:22px 26px;font-family:'Times New Roman',serif;color:var(--color-ink);line-height:1.6;">
          <div style="text-align:center;font-weight:700;font-size:14px;letter-spacing:1px;margin-bottom:4px;">INTERNATIONAL RECRUITMENT AGREEMENT</div>
          <div style="text-align:center;color:var(--color-ink-mute);font-size:11px;margin-bottom:16px;">v6.2 · ESOS Act 2000 · ASQA compliant</div>
          <div style="font-size:12px;margin-bottom:8px;">This Agreement is made between <b>Kensington Melbourne College</b> ("the College") and <b>${esc(app.business)}</b> ("the Agent").</div>
          <div style="font-size:12px;margin-bottom:6px;font-weight:700;">1. Appointment &amp; Territory</div>
          <div style="font-size:12px;margin-bottom:10px;color:#5a5652;">The College appoints the Agent on a non-exclusive basis to promote its programs in the agreed territory …</div>
          <div style="font-size:12px;margin-bottom:6px;font-weight:700;">2. Commission</div>
          <div style="font-size:12px;margin-bottom:10px;color:#5a5652;">The College shall pay the Agent 15% of Year 1 tuition per enrolled student, following clearance of the census date …</div>
          <div style="font-size:12px;margin-bottom:6px;font-weight:700;">3. Compliance Obligations</div>
          <div style="font-size:12px;color:#5a5652;">The Agent warrants that it maintains current MARN registration, QEAC certification and ESOS attestation …</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;margin-bottom:16px;">
        <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);margin-bottom:14px;">Key terms</div>
        ${terms}
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="btn-back-app" style="padding:11px 18px;background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);border-radius:8px;font-size:14px;font-weight:540;cursor:pointer;">Back to application</button>
        <button id="btn-send" style="padding:11px 20px;background:#00843d;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Send agreement</button>
      </div>
    </div>`;

  mount.querySelector('#back-link').addEventListener('click', () => navigate('applications'));
  mount.querySelector('#btn-back-app').addEventListener('click', () => navigate(`application/${id}`));
  mount.querySelector('#btn-send').addEventListener('click', async (e) => {
    try {
      await runWithSpinner(e.currentTarget, () => api.sendAgreement(id), 'Sending…');
    } catch {
      toast('Could not send the agreement — is the backend running?');
      return;
    }
    toast('Agreement sent for signature');
    navigate(`application/${id}`);
  });
}
