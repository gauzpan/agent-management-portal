// Individual agent profile (M4, Journey 4): the admin's view of one partner —
// headline metrics, an illustrative enrolments trend, and the core deliverable:
// the certification/license validity ledger with computed expiry flags.
// Mirrors dc.html L589-657. Message/Terminate are M5 (offboarding) — rendered
// inert here so the layout matches without wiring an unbuilt flow.
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';

// Compliance-ledger state pill: colour + copy from the read-time validity state.
const LEDGER_STATE = {
  valid: ['#e0f4e8', '#00843d'],
  expiring: ['#fff4d4', '#8a6b00'],
  expired: ['#fbe3e3', '#a12020'],
  none: ['#eeece9', '#73706d'],
};

function ledgerPill(state, label) {
  const [bg, color] = LEDGER_STATE[state] || LEDGER_STATE.none;
  return `<span style="font-size:11px;font-weight:600;color:${color};background:${bg};
    padding:3px 9px;border-radius:999px;white-space:nowrap;">${esc(label)}</span>`;
}

// Static, illustrative trailing-12mo sparkline (no real time-series yet — the
// comp's shape, clearly labelled as illustrative so it doesn't imply live data).
function enrolmentsChart() {
  return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;">
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:16px;">
      <div style="font-family:var(--font-display);font-weight:540;font-size:16px;">Enrolments · trailing 12 months</div>
      <div style="font-size:11px;color:var(--color-ink-faint);">Illustrative trend</div>
    </div>
    <svg viewBox="0 0 600 200" style="width:100%;height:180px;">
      <line x1="0" y1="180" x2="600" y2="180" stroke="var(--color-hairline)"></line>
      <line x1="0" y1="130" x2="600" y2="130" stroke="#f3f0eb"></line>
      <line x1="0" y1="80" x2="600" y2="80" stroke="#f3f0eb"></line>
      <line x1="0" y1="30" x2="600" y2="30" stroke="#f3f0eb"></line>
      <path d="M0,175 L50,165 L100,160 L150,145 L200,135 L250,140 L300,115 L350,100 L400,105 L450,85 L500,80 L550,70 L600,65 L600,180 L0,180 Z"
        fill="var(--color-primary)" opacity="0.12"></path>
      <path d="M0,175 L50,165 L100,160 L150,145 L200,135 L250,140 L300,115 L350,100 L400,105 L450,85 L500,80 L550,70 L600,65"
        fill="none" stroke="var(--color-primary)" stroke-width="2.5"></path>
    </svg>
    <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-ink-faint);margin-top:6px;">
      <span>Sep</span><span>Nov</span><span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span>
    </div>
  </div>`;
}

export async function renderAgent(mount, id, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading agent profile…</div>`;

  let data;
  try {
    data = await api.agent(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      mount.innerHTML = emptyState({ icon: '🔍', title: 'Agent not found',
        hint: `No agent with id ${esc(id)}. It may have been removed.` });
      return;
    }
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load the agent profile.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  const { agent, metrics, ledger, compliance_state: compliance } = data;

  const subline = [
    `${agent.flag || ''} ${agent.country || ''}`.trim(),
    agent.since ? `Onboarded ${agent.since}` : null,
    agent.marn ? `MARN ${agent.marn}` : null,
    agent.next_review ? `Next review ${agent.next_review}` : null,
  ].filter(Boolean).join(' · ');

  // Six metric tiles, in the comp's order. Rating carries a star + count hint.
  const tileOrder = ['students', 'enrol', 'conversion', 'compliance', 'rating', 'tenure'];
  const tiles = tileOrder.map((k) => {
    const m = metrics[k];
    if (!m) return '';
    const value = k === 'rating' && m.value !== '—' ? `${m.value} <span style="color:#c9a227;">★</span>` : esc(m.value);
    const hint = m.hint ? `<div style="font-size:11px;color:var(--color-ink-faint);margin-top:2px;">${esc(m.hint)}</div>` : '';
    return `<div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:16px;">
      <div style="font-size:10px;font-weight:600;color:var(--color-ink-mute);text-transform:uppercase;letter-spacing:0.6px;">${esc(m.label)}</div>
      <div style="font-family:var(--font-display);font-weight:540;font-size:22px;letter-spacing:-0.4px;margin-top:6px;">${value}</div>
      ${hint}
    </div>`;
  }).join('');

  const ledgerRows = ledger.length ? ledger.map((l) => `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;
      padding:11px 0;border-top:1px solid #f3f0eb;font-size:13px;">
      <div style="min-width:0;">
        <div style="font-weight:540;">${esc(l.item)}</div>
        <div style="color:var(--color-ink-faint);font-size:11px;">${esc(l.detail || '—')}${l.expires ? ` · expires ${esc(l.expires)}` : ''}</div>
      </div>
      ${ledgerPill(l.state, l.label)}
    </div>`).join('')
    : `<div style="padding:20px 0;color:var(--color-ink-mute);font-size:13px;">No certifications on file.</div>`;

  const inertBtn = (label, danger) => `<button disabled title="Available in M5 (offboarding & messaging)"
    style="padding:9px 14px;background:#fff;color:${danger ? '#c99' : 'var(--color-ink-faint)'};
    border:1px solid var(--color-hairline);border-radius:8px;font-size:13px;font-weight:540;
    cursor:not-allowed;font-family:inherit;opacity:0.7;">${esc(label)}</button>`;

  mount.innerHTML = `
    <div class="ag-back" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:12px;">← All agents</div>

    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:16px;min-width:0;">
        <div style="width:56px;height:56px;border-radius:12px;background:${esc(agent.avatar_bg || '#ffcd00')};
          color:#00247d;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;flex-shrink:0;">
          ${esc(agent.initials || '—')}</div>
        <div style="min-width:0;">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:4px;flex-wrap:wrap;">
            <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.6px;">${esc(agent.name)}</div>
            ${statusPill(agent.status)}
          </div>
          <div style="font-size:13px;color:var(--color-ink-mute);">${esc(subline)}</div>
          <div style="font-size:12px;color:var(--color-ink-faint);margin-top:2px;">Compliance: <b style="color:var(--color-ink-mute);">${esc(compliance)}</b></div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">${inertBtn('Message', false)}${inertBtn('Terminate', true)}</div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:12px;margin-bottom:24px;">${tiles}</div>

    <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;align-items:start;">
      ${enrolmentsChart()}
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:24px;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;margin-bottom:4px;">Certification & licence validity</div>
        <div style="font-size:12px;color:var(--color-ink-faint);margin-bottom:8px;">Expiry flags computed against today</div>
        ${ledgerRows}
      </div>
    </div>`;

  mount.querySelector('.ag-back').addEventListener('click', () => navigate('agents'));
}
