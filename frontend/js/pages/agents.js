// Agents list (M4, Journey 4): the admin roster of active partners with a
// compliance rollup per row. Mirrors dc.html L536-587. Rows open the individual
// agent profile. Filter state is page-local (kept in a closure), matching
// applications.js.
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';

const STATUSES = ['Active', 'Expiring Soon', 'Suspended', 'Terminated'];

// Thin compliance meter, coloured by the numeric score parsed from "96%".
function compBar(comp) {
  const pct = parseInt(comp, 10) || 0;
  const color = pct >= 85 ? 'var(--color-primary)' : pct >= 65 ? '#c9a227' : '#a12020';
  return `<div>
    <div style="width:96px;height:6px;background:#f3f0eb;border-radius:999px;overflow:hidden;">
      <div style="width:${pct}%;height:100%;background:${color};"></div>
    </div>
    <div style="font-size:11px;color:var(--color-ink-mute);margin-top:2px;">${esc(comp || '—')}</div>
  </div>`;
}

function complianceChip(agent) {
  if (agent.expired_count > 0) {
    return `<span title="Certifications expired" style="font-size:11px;font-weight:600;color:#a12020;
      background:#fbe3e3;padding:2px 8px;border-radius:999px;white-space:nowrap;">⚠ ${agent.expired_count} expired</span>`;
  }
  if (agent.expiring_count > 0) {
    return `<span title="Certifications expiring soon" style="font-size:11px;font-weight:600;color:#8a6b00;
      background:#fff4d4;padding:2px 8px;border-radius:999px;white-space:nowrap;">⚠ ${agent.expiring_count} expiring</span>`;
  }
  return '';
}

export async function renderAgents(mount, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading agents…</div>`;

  let all;
  try {
    all = await api.agents();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load agents.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  let filter = 'all';

  function draw() {
    const counts = { all: all.length };
    STATUSES.forEach((s) => { counts[s] = all.filter((a) => a.status === s).length; });
    const rows = filter === 'all' ? all : all.filter((a) => a.status === filter);
    const cols = '2fr 1fr 1.2fr 0.9fr 0.9fr 1fr 90px';

    const chips = ['all', ...STATUSES].map((f) => {
      const selected = f === filter;
      const label = f === 'all' ? 'All' : f;
      const bg = selected ? 'var(--color-primary)' : '#fff';
      const color = selected ? '#fff' : 'var(--color-ink)';
      const border = selected ? 'var(--color-primary)' : 'var(--color-hairline)';
      return `<button class="ag-chip" data-filter="${esc(f)}" style="padding:8px 14px;
        border-radius:999px;font-size:13px;font-weight:540;cursor:pointer;background:${bg};
        color:${color};border:1px solid ${border};font-family:inherit;">
        ${esc(label)} <span style="opacity:0.6;margin-left:4px;">${counts[f] || 0}</span></button>`;
    }).join('');

    const body = rows.length ? rows.map((a) => `
      <div class="ag-row" data-id="${a.id}" style="display:grid;grid-template-columns:${cols};
        padding:14px 20px;border-bottom:1px solid var(--color-hairline);font-size:13px;
        align-items:center;cursor:pointer;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:32px;height:32px;border-radius:8px;background:${esc(a.avatar_bg || '#ffcd00')};
            color:#00247d;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;flex-shrink:0;">
            ${esc(a.initials || '—')}</div>
          <div style="min-width:0;">
            <div style="font-weight:540;color:var(--color-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
            <div style="color:var(--color-ink-faint);font-size:11px;">Since ${esc(a.since || '—')}</div>
          </div>
        </div>
        <div style="color:var(--color-ink-mute);"><span style="margin-right:6px;">${esc(a.flag)}</span>${esc(a.country)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">${statusPill(a.status)}${complianceChip(a)}</div>
        <div style="font-weight:540;">${esc(a.students)}</div>
        <div style="color:var(--color-primary);font-weight:540;">${esc(a.conv || '—')}</div>
        ${compBar(a.comp)}
        <div style="text-align:right;"><span style="color:var(--color-primary);font-weight:600;">Open →</span></div>
      </div>`).join('')
      : `<div style="padding:32px;text-align:center;color:var(--color-ink-mute);font-size:13px;">No agents with status “${esc(filter)}”.</div>`;

    mount.innerHTML = `
      <div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:16px;">
        ${all.length} partner agent(s) · certification validity and ratings tracked below</div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">${chips}</div>
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:${cols};padding:14px 20px;
          background:var(--color-canvas-soft);font-size:11px;font-weight:600;color:var(--color-ink-mute);
          text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid var(--color-hairline);">
          <div>Agent</div><div>Country</div><div>Status</div><div>Students</div>
          <div>Conversion</div><div>Compliance</div><div></div>
        </div>
        ${body}
      </div>`;

    mount.querySelectorAll('.ag-chip').forEach((c) =>
      c.addEventListener('click', () => { filter = c.dataset.filter; draw(); }));
    mount.querySelectorAll('.ag-row').forEach((r) =>
      r.addEventListener('click', () => navigate(`agent/${r.dataset.id}`)));
  }

  draw();
}
