// Individual agent profile (M4, admin view): the full record for one partner
// agency, reached from the directory (#/agent/{id}). Shows partnership status,
// performance, rating, and this agent's slice of the audit trail — plus the
// management actions (rate / terminate / delete), all routed through the shared
// agent-actions module. Distinct from agent-profile.js, which is the agent's own
// read-only self view via /agent/me.
import { api, ApiError } from '../api.js';
import { esc, statusPill, emptyState } from '../ui.js';
import { openTerminate, openDelete, openRate, starRow } from './agent-actions.js';

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export async function renderAgentDetail(mount, id, { navigate } = {}) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading agent…</div>`;

  async function load() {
    let data;
    try {
      data = await api.getAgent(id);
    } catch (err) {
      const msg = err instanceof ApiError && err.status === 404
        ? 'This agent no longer exists.'
        : (err instanceof ApiError && err.status === 0
          ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
          : 'Could not load this agent.');
      mount.innerHTML = `
        <button id="back-link" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:12px;background:none;border:none;font-family:inherit;padding:0;">← Agent directory</button>
        ${emptyState({ icon: '⚠️', title: 'Unable to load agent', hint: msg })}`;
      mount.querySelector('#back-link').addEventListener('click', () => navigate('agents'));
      return;
    }
    draw(data.agent, data.activity || []);
  }

  function row(label, value) {
    return `
      <div style="display:grid;grid-template-columns:180px 1fr;gap:16px;padding:12px 0;border-top:1px solid #f3f0eb;font-size:14px;">
        <div style="color:var(--color-ink-mute);font-weight:540;">${esc(label)}</div>
        <div style="color:var(--color-ink);">${value}</div>
      </div>`;
  }

  function actionButton(label, kind, id_) {
    const styles = kind === 'danger'
      ? 'color:#a12020;border-color:#e6c4c4;background:#fff;'
      : kind === 'primary'
        ? 'color:#fff;background:var(--color-primary);border-color:var(--color-primary);'
        : 'color:var(--color-ink);border-color:var(--color-hairline);background:#fff;';
    return `<button id="${id_}" style="padding:8px 16px;border-radius:8px;font-size:13px;font-weight:600;
      cursor:pointer;border:1px solid;${styles}font-family:inherit;">${esc(label)}</button>`;
  }

  function draw(agent, activity) {
    const terminated = agent.status === 'Terminated';

    const activityHtml = activity.length ? activity.map((e) => `
      <div style="display:flex;gap:12px;padding:12px 0;border-top:1px solid #f3f0eb;">
        <div style="width:8px;height:8px;border-radius:50%;background:var(--color-primary);margin-top:5px;flex-shrink:0;"></div>
        <div style="flex:1;">
          <div style="font-size:13px;color:var(--color-ink);font-weight:540;">${esc(e.action)}</div>
          ${e.detail ? `<div style="font-size:13px;color:var(--color-ink-mute);margin-top:2px;">${esc(e.detail)}</div>` : ''}
          <div style="font-size:11px;color:var(--color-ink-faint);margin-top:3px;">${esc(e.actor || 'System')} · ${fmtTime(e.at)}</div>
        </div>
      </div>`).join('')
      : `<div style="font-size:13px;color:var(--color-ink-mute);padding:12px 0;">No recorded activity yet.</div>`;

    mount.innerHTML = `
      <button id="back-link" style="font-size:13px;color:var(--color-ink-mute);cursor:pointer;margin-bottom:16px;background:none;border:none;font-family:inherit;padding:0;">← Agent directory</button>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:24px;">
        <div style="display:flex;gap:16px;align-items:center;">
          <div style="width:56px;height:56px;border-radius:14px;background:${esc(agent.avatar_bg || '#ffcd00')};
            display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:600;font-size:20px;color:#292827;">
            ${esc(agent.initials || (agent.name || '?').slice(0, 2).toUpperCase())}</div>
          <div>
            <div style="font-family:var(--font-display);font-weight:540;font-size:24px;letter-spacing:-0.4px;">${esc(agent.name)}</div>
            <div style="font-size:13px;color:var(--color-ink-mute);margin-top:2px;">
              ${esc(agent.flag)} ${esc(agent.country)} · partner since ${esc(agent.since || '—')}</div>
            <div style="margin-top:8px;">${statusPill(agent.status)}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          ${actionButton('Rate', 'primary', 'act-rate')}
          ${terminated ? '' : actionButton('Terminate', 'ghost', 'act-terminate')}
          ${actionButton('Delete', 'danger', 'act-delete')}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start;">
        <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:8px 24px 20px;">
          <div style="font-family:var(--font-display);font-weight:540;font-size:16px;padding-top:16px;">Performance</div>
          ${row('Enrolments', `<strong>${esc(String(agent.enrol ?? 0))}</strong>`)}
          ${row('Conversion rate', esc(agent.conv || '—'))}
        </div>
        <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:8px 24px 20px;">
          <div style="font-family:var(--font-display);font-weight:540;font-size:16px;padding-top:16px;">Rating</div>
          ${row('Partner rating', starRow(agent.rating, 16))}
          ${row('Latest note', agent.rating_note ? esc(agent.rating_note) : '<span style="color:var(--color-ink-faint);">No note</span>')}
          ${row('Times rated', esc(String(agent.rating_count ?? 0)))}
        </div>
      </div>

      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:8px 24px 20px;margin-top:16px;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:16px;padding:16px 0 4px;">Activity</div>
        ${activityHtml}
      </div>

      <div style="font-size:12px;color:var(--color-ink-faint);margin-top:14px;">
        Certification &amp; licence validity tracking arrives in a later release.</div>`;

    mount.querySelector('#back-link').addEventListener('click', () => navigate('agents'));

    // Management actions re-load the page on success so the record + activity
    // stay in sync; a delete returns to the directory.
    const rate = mount.querySelector('#act-rate');
    if (rate) rate.addEventListener('click', () => openRate(agent, { onDone: () => load() }));
    const term = mount.querySelector('#act-terminate');
    if (term) term.addEventListener('click', () => openTerminate(agent, { onDone: () => load() }));
    const del = mount.querySelector('#act-delete');
    if (del) del.addEventListener('click', () => openDelete(agent, { onDone: () => navigate('agents') }));
  }

  load();
}
