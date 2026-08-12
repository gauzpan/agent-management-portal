// Agent directory: the active-partner roster pulled live from /agents. Status
// filter chips + a table of every partner agency with its performance and
// compliance snapshot. Mirrors the Applications list pattern (filter state is
// page-local, kept in a closure).
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';

const STATUSES = ['Active', 'Expiring Soon', 'Suspended', 'Terminated'];
const COLS = '2fr 1.2fr 1.1fr 1fr 0.9fr 0.9fr 0.9fr';

export async function renderAgents(mount) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading agents…</div>`;

  let all;
  try {
    all = await api.agents();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load the agent directory.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  if (!all.length) {
    mount.innerHTML = emptyState({ icon: '👥', title: 'No agents yet', hint: 'Approved partner agencies will appear here.' });
    return;
  }

  let filter = 'all';

  function avatar(a) {
    return `<div style="width:34px;height:34px;border-radius:50%;background:${esc(a.avatar_bg || '#ffcd00')};
      display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#3a2f00;flex-shrink:0;">
      ${esc(a.initials || (a.name || '?').slice(0, 2).toUpperCase())}</div>`;
  }

  function draw() {
    const counts = { all: all.length };
    STATUSES.forEach((s) => { counts[s] = all.filter((a) => a.status === s).length; });
    const rows = filter === 'all' ? all : all.filter((a) => a.status === filter);

    const chips = ['all', ...STATUSES].map((f) => {
      const selected = f === filter;
      const label = f === 'all' ? 'All' : f;
      const bg = selected ? 'var(--color-primary)' : '#fff';
      const color = selected ? '#fff' : 'var(--color-ink)';
      const border = selected ? 'var(--color-primary)' : 'var(--color-hairline)';
      return `<button class="agent-chip" data-filter="${esc(f)}" style="padding:8px 14px;
        border-radius:999px;font-size:13px;font-weight:540;cursor:pointer;background:${bg};
        color:${color};border:1px solid ${border};font-family:inherit;">
        ${esc(label)} <span style="opacity:0.6;margin-left:4px;">${counts[f] || 0}</span></button>`;
    }).join('');

    const body = rows.length ? rows.map((a) => `
      <div style="display:grid;grid-template-columns:${COLS};padding:14px 20px;
        border-bottom:1px solid var(--color-hairline);font-size:13px;align-items:center;">
        <div style="display:flex;gap:12px;align-items:center;">
          ${avatar(a)}
          <div style="font-weight:540;color:var(--color-ink);">${esc(a.name)}</div>
        </div>
        <div style="color:var(--color-ink-mute);"><span style="margin-right:6px;">${esc(a.flag)}</span>${esc(a.country)}</div>
        <div>${statusPill(a.status)}</div>
        <div style="color:var(--color-ink-mute);">${esc(a.since)}</div>
        <div style="color:var(--color-ink);font-weight:540;">${esc(String(a.enrol ?? ''))}</div>
        <div style="color:var(--color-ink-mute);">${esc(a.conv)}</div>
        <div style="color:var(--color-ink-mute);">${esc(a.comp)}</div>
      </div>`).join('')
      : `<div style="padding:32px;text-align:center;color:var(--color-ink-mute);font-size:13px;">No agents with status “${esc(filter)}”.</div>`;

    mount.innerHTML = `
      <div style="font-size:13px;color:var(--color-ink-mute);margin-bottom:16px;">
        ${all.length} partner agenc${all.length === 1 ? 'y' : 'ies'} · live from /agents</div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">${chips}</div>
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;overflow:hidden;">
        <div style="display:grid;grid-template-columns:${COLS};padding:14px 20px;
          background:var(--color-canvas-soft);font-size:11px;font-weight:600;color:var(--color-ink-mute);
          text-transform:uppercase;letter-spacing:0.6px;border-bottom:1px solid var(--color-hairline);">
          <div>Agent</div><div>Country</div><div>Status</div><div>Since</div>
          <div>Enrolments</div><div>Conversion</div><div>Compliance</div>
        </div>
        ${body}
      </div>`;

    mount.querySelectorAll('.agent-chip').forEach((c) => c.addEventListener('click', () => {
      filter = c.dataset.filter; draw();
    }));
  }

  draw();
}
