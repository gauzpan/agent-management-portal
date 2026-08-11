// Agent profile (M3): read-only view of the logged-in agent's own record —
// partnership status, tenure, and performance. Editing + expiry/validity
// tracking arrive in M4.
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';

export async function renderAgentProfile(mount) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading your profile…</div>`;

  let data;
  try {
    data = await api.agentMe();
  } catch (err) {
    const msg = err instanceof ApiError && (err.status === 401 || err.status === 403)
      ? 'This page is for agent accounts. Sign in with an agent login.'
      : 'Could not load your profile.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Unable to load profile', hint: msg });
    return;
  }

  const { agent, user } = data;

  const row = (label, value) => `
    <div style="display:grid;grid-template-columns:200px 1fr;gap:16px;padding:14px 0;border-top:1px solid #f3f0eb;font-size:14px;">
      <div style="color:var(--color-ink-mute);font-weight:540;">${esc(label)}</div>
      <div style="color:var(--color-ink);">${value}</div>
    </div>`;

  mount.innerHTML = `
    <div style="max-width:720px;">
      <div style="display:flex;gap:16px;align-items:center;margin-bottom:24px;">
        <div style="width:56px;height:56px;border-radius:14px;background:${esc(agent.avatar_bg || '#ffcd00')};
          display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:600;font-size:20px;color:#292827;">
          ${esc(agent.initials || '—')}</div>
        <div>
          <div style="font-family:var(--font-display);font-weight:540;font-size:22px;letter-spacing:-0.4px;">${esc(agent.name)}</div>
          <div style="font-size:13px;color:var(--color-ink-mute);">${esc(agent.flag)} ${esc(agent.country)} · ${esc(user.email)}</div>
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:8px 24px 20px;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;padding-top:16px;">Partnership</div>
        ${row('Status', statusPill(agent.status))}
        ${row('Partner since', esc(agent.since))}
        ${row('Country', `${esc(agent.flag)} ${esc(agent.country)}`)}
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;padding-top:24px;">Performance</div>
        ${row('Enrolments', esc(agent.enrol))}
        ${row('Conversion rate', esc(agent.conv))}
        ${row('Compliance score', esc(agent.comp))}
      </div>

      <div style="font-size:12px;color:var(--color-ink-faint);margin-top:14px;">
        Performance figures reflect your latest college review. Certification &amp; validity tracking arrive in a later release.</div>
    </div>`;
}
