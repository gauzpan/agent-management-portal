// Dashboard: live KPI counts (the M1 wiring proof) plus two activity widgets —
// the Recent Activity audit trail and the top 5 active agents by enrolment.
import { api, ApiError } from '../api.js';
import { esc, emptyState } from '../ui.js';

const KPIS = [
  { key: 'applications', label: 'Total applications', hint: 'View all applications →', route: 'applications' },
  { key: 'agents', label: 'Active agents', hint: 'View agents →', route: 'agents' },
  { key: 'marketing', label: 'Marketing assets', hint: 'View marketing collateral →', route: 'marketing' },
  { key: 'audit', label: 'Audit events', hint: 'View audit trail →', route: 'audit' },
];

const RECENT_LIMIT = 7;
const TOP_AGENTS_LIMIT = 5;

// --- small helpers (kept local; mirror audit.js) --------------------------
function parseAt(iso) {
  if (!iso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
function relativeTime(d) {
  if (!d) return '';
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}
function initials(name) {
  return (name || '?').split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';
}
// Consistent avatar hue per actor by hashing the name.
function actorColor(name) {
  let h = 0;
  for (let i = 0; i < (name || '').length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 88%)`;
}
// Link an event's entity to its detail screen when it names an app or agent.
function entityLink(entity) {
  let m = /^Application\s+(\d+)$/.exec(entity || '');
  if (m) return `<a href="#/application/${m[1]}" style="color:var(--color-primary);font-weight:600;text-decoration:none;">${esc(entity)}</a>`;
  m = /^Agent\s+(\d+)$/.exec(entity || '');
  if (m) return `<a href="#/agent/${m[1]}" style="color:var(--color-primary);font-weight:600;text-decoration:none;">${esc(entity)}</a>`;
  return entity ? `<span style="font-weight:600;color:var(--color-ink);">${esc(entity)}</span>` : '';
}

// --- widgets ---------------------------------------------------------------
function recentActivity(events) {
  const rows = events.slice(0, RECENT_LIMIT).map((e) => {
    const d = parseAt(e.at);
    return `
      <div style="display:flex;gap:12px;padding:12px 0;border-top:1px solid #f3f0eb;">
        <div title="${esc(e.actor || 'System')}" style="flex:none;width:32px;height:32px;border-radius:50%;
          background:${actorColor(e.actor || 'System')};display:flex;align-items:center;justify-content:center;
          font-size:11px;font-weight:700;color:#4a463f;">${esc(initials(e.actor || 'System'))}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;color:var(--color-ink);">
            <span style="font-weight:540;">${esc(e.action)}</span>${e.entity ? ` · ${entityLink(e.entity)}` : ''}</div>
          ${e.detail ? `<div style="font-size:12px;color:var(--color-ink-mute);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(e.detail)}</div>` : ''}
          <div style="font-size:11px;color:var(--color-ink-faint);margin-top:3px;">${esc(e.actor || 'System')} · ${esc(relativeTime(d))}</div>
        </div>
      </div>`;
  }).join('');

  return `
    <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px 24px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
        <div style="font-size:13px;color:var(--color-ink-mute);font-weight:540;">Recent activity</div>
        <a href="#/audit" style="font-size:12px;color:var(--color-teal-deep);font-weight:600;text-decoration:none;">View audit trail →</a>
      </div>
      ${events.length ? rows : `<div style="font-size:13px;color:var(--color-ink-mute);padding:14px 0;">No activity recorded yet.</div>`}
    </div>`;
}

function topAgents(agents) {
  const top = agents
    .filter((a) => a.status === 'Active')
    .sort((a, b) => (b.enrol ?? 0) - (a.enrol ?? 0))
    .slice(0, TOP_AGENTS_LIMIT);

  const rows = top.map((a, i) => `
    <div class="top-agent-row" data-id="${a.id}" role="link" tabindex="0"
      style="display:flex;align-items:center;gap:12px;padding:12px 0;border-top:1px solid #f3f0eb;cursor:pointer;">
      <div style="flex:none;width:22px;text-align:center;font-size:13px;font-weight:700;color:var(--color-ink-faint);">${i + 1}</div>
      <div style="flex:none;width:32px;height:32px;border-radius:50%;background:${esc(a.avatar_bg || '#ffcd00')};
        display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#3a2f00;">
        ${esc(a.initials || initials(a.name))}</div>
      <div style="flex:1;min-width:0;">
        <div style="font-size:13px;font-weight:540;color:var(--color-ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name)}</div>
        <div style="font-size:12px;color:var(--color-ink-mute);margin-top:1px;">${esc(a.flag)} ${esc(a.country)}</div>
      </div>
      <div style="flex:none;text-align:right;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:18px;letter-spacing:-0.4px;color:var(--color-ink);">${esc(String(a.enrol ?? 0))}</div>
        <div style="font-size:11px;color:var(--color-ink-faint);">enrolments</div>
      </div>
    </div>`).join('');

  return `
    <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px 24px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px;">
        <div style="font-size:13px;color:var(--color-ink-mute);font-weight:540;">Top active agents</div>
        <a href="#/agents" style="font-size:12px;color:var(--color-teal-deep);font-weight:600;text-decoration:none;">View agents →</a>
      </div>
      ${top.length ? rows : `<div style="font-size:13px;color:var(--color-ink-mute);padding:14px 0;">No active agents yet.</div>`}
    </div>`;
}

export async function renderDashboard(mount, { navigate } = {}) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading live data…</div>`;
  try {
    const [applications, agents, marketing, audit] = await Promise.all([
      api.applications(), api.agents(), api.marketing(), api.audit(),
    ]);
    const counts = {
      applications: applications.length,
      agents: agents.length,
      marketing: marketing.length,
      audit: audit.length,
    };
    const cards = KPIS.map((k) => {
      const clickable = !!k.route;
      const hintColor = clickable ? 'var(--color-teal-deep)' : 'var(--color-ink-faint)';
      return `
      <div ${clickable ? `class="kpi-card" data-route="${esc(k.route)}" role="link" tabindex="0"` : ''}
        style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px;${clickable ? 'cursor:pointer;transition:border-color 0.15s,box-shadow 0.15s;' : ''}">
        <div style="font-size:12px;color:var(--color-ink-mute);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">${esc(k.label)}</div>
        <div style="font-family:var(--font-display);font-weight:540;font-size:32px;letter-spacing:-0.6px;margin-top:8px;">${counts[k.key]}</div>
        <div style="font-size:12px;color:${hintColor};margin-top:4px;font-weight:${clickable ? '600' : '400'};">${esc(k.hint)}</div>
      </div>`;
    }).join('');

    mount.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:28px;">${cards}</div>
      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:16px;align-items:start;">
        ${recentActivity(audit)}
        ${topAgents(agents)}
      </div>`;

    // Top-agent rows link to the individual agent profile.
    mount.querySelectorAll('.top-agent-row').forEach((row) => {
      const go = () => navigate && navigate(`agent/${row.dataset.id}`);
      row.addEventListener('click', go);
      row.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); go(); }
      });
    });

    // Clickable KPI cards redirect to their list page.
    mount.querySelectorAll('.kpi-card').forEach((card) => {
      const go = () => navigate && navigate(card.dataset.route);
      card.addEventListener('click', go);
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--color-teal-deep)';
        card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
      });
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'var(--color-hairline)';
        card.style.boxShadow = 'none';
      });
    });
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load dashboard data.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
  }
}
