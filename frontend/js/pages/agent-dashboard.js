// Agent dashboard (M3): the partner agent's home. Pulls the agent's own record
// from GET /agent/me and shows status + headline stats, with quick links into
// the marketing collateral and their profile. Read-only in M3 (performance
// analytics + expiry tracking land in M4).
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';

export async function renderAgentDashboard(mount, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading your portal…</div>`;

  let data;
  try {
    data = await api.agentMe();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : err instanceof ApiError && (err.status === 401 || err.status === 403)
        ? 'This portal is for agent accounts. Sign in with an agent login.'
        : 'Could not load your portal.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Unable to load portal', hint: msg });
    return;
  }

  const { agent, user, stats } = data;

  const stat = (label, value, sub = '') => `
    <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px;">
      <div style="font-size:12px;color:var(--color-ink-mute);text-transform:uppercase;letter-spacing:0.6px;font-weight:600;">${esc(label)}</div>
      <div style="font-family:var(--font-display);font-weight:540;font-size:32px;letter-spacing:-0.6px;margin-top:8px;">${esc(value)}</div>
      ${sub ? `<div style="font-size:12px;color:var(--color-ink-faint);margin-top:4px;">${esc(sub)}</div>` : ''}
    </div>`;

  const linkCard = (route, icon, title, hint) => `
    <div class="ag-link" data-route="${esc(route)}" role="link" tabindex="0"
      style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:20px;cursor:pointer;
        display:flex;gap:14px;align-items:center;transition:border-color 0.15s,box-shadow 0.15s;">
      <div style="font-size:26px;">${icon}</div>
      <div style="flex:1;">
        <div style="font-weight:600;font-size:15px;color:var(--color-ink);">${esc(title)}</div>
        <div style="font-size:12px;color:var(--color-ink-mute);margin-top:2px;">${esc(hint)}</div>
      </div>
      <div style="color:var(--color-primary);font-weight:600;">→</div>
    </div>`;

  mount.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:24px;">
      <div>
        <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.6px;">
          Welcome back, ${esc((user.name || '').split(' ')[0] || 'Partner')}</div>
        <div style="font-size:13px;color:var(--color-ink-mute);margin-top:4px;">
          ${esc(agent.flag)} ${esc(agent.name)} · ${esc(agent.country)} · partner since ${esc(agent.since)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:12px;color:var(--color-ink-mute);">Partnership status</span>${statusPill(agent.status)}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px;">
      ${stat('Enrolments', stats.enrolments, 'Students placed with the college')}
      ${stat('Conversion', stats.conversion, 'Applications → enrolments')}
      ${stat('Compliance score', stats.compliance, 'Based on your latest review')}
    </div>

    <div style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.6px;color:var(--color-ink-mute);margin-bottom:12px;">Quick actions</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      ${linkCard('marketing', '📁', 'Marketing collateral', 'Download the latest brochures, guides & fee schedules')}
      ${linkCard('agent-profile', '👤', 'My profile', 'Review your partnership status & performance')}
    </div>`;

  mount.querySelectorAll('.ag-link').forEach((card) => {
    const go = () => navigate(card.dataset.route);
    card.addEventListener('click', go);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
    card.addEventListener('mouseenter', () => {
      card.style.borderColor = 'var(--color-primary)';
      card.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
    });
    card.addEventListener('mouseleave', () => {
      card.style.borderColor = 'var(--color-hairline)';
      card.style.boxShadow = 'none';
    });
  });
}
