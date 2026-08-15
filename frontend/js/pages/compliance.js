// PRISMS Compliance Tracker: the 30-day window to register each newly-signed
// agent in PRISMS. The clock starts when a signed agreement is verified; the
// backend periodically polls the (mock) PRISMS system and flips a tracker from
// "Pending Upload" to "Completed" once the agent's PRISMS Agent ID is detected.
// This page shows the live countdown per agent and polls on an interval too.
import { api, ApiError } from '../api.js';
import { esc, emptyState, toast, setButtonBusy } from '../ui.js';

const POLL_MS = 15000;
let pollTimer = null;

const PILL = {
  'Completed': ['#e0f4e8', '#00843d'],
  'Pending Upload': ['#fff6d6', '#8a6d00'],
  'Overdue': ['#fbe3e3', '#a12020'],
};
function pill(label) {
  const [bg, color] = PILL[label] || ['#eeece9', '#73706d'];
  return `<span style="font-size:11px;font-weight:600;padding:3px 10px;border-radius:999px;background:${bg};color:${color};">${esc(label)}</span>`;
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export async function renderCompliance(mount, { navigate } = {}) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading compliance…</div>`;

  let trackers = [];
  try {
    trackers = await api.prismsCompliance();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend on :8000. Start it with python3 main.py.'
      : 'Could not load the compliance tracker.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Backend unavailable', hint: msg });
    return;
  }

  // Poll the PRISMS system (reconcile) then re-render, unless the page is gone.
  async function poll() {
    if (!document.body.contains(mount)) { clearInterval(pollTimer); pollTimer = null; return; }
    try {
      const res = await api.checkPrismsCompliance();
      trackers = res.trackers || [];
      draw();
    } catch { /* transient; try again next tick */ }
  }

  function label(t) {
    if (t.status === 'Completed') return 'Completed';
    return t.overdue ? 'Overdue' : 'Pending Upload';
  }

  function countdown(t) {
    if (t.status === 'Completed') {
      return `<div style="font-size:13px;color:var(--color-ink);">Registered as
        <strong>${esc(t.prisms_agent_id || '—')}</strong>${t.completed_at ? ` on ${fmtDate(t.completed_at)}` : ''}</div>`;
    }
    const overdue = t.overdue;
    const days = Math.abs(t.days_left);
    const big = overdue ? '#a12020' : (t.days_left <= 7 ? '#8a6d00' : 'var(--color-ink)');
    // 30-day progress (elapsed share of the window).
    const elapsed = Math.max(0, Math.min(1, (t.deadline_days - t.days_left) / t.deadline_days));
    const barColor = overdue ? '#a12020' : (t.days_left <= 7 ? '#e0a800' : '#00843d');
    return `
      <div style="display:flex;align-items:baseline;gap:8px;">
        <div style="font-family:var(--font-display);font-weight:540;font-size:26px;letter-spacing:-0.5px;color:${big};">${days}</div>
        <div style="font-size:12px;color:var(--color-ink-mute);">day${days === 1 ? '' : 's'} ${overdue ? 'overdue' : 'left'} · due ${fmtDate(t.due_at)}</div>
      </div>
      <div style="height:6px;border-radius:3px;background:#f3f0eb;overflow:hidden;margin-top:8px;max-width:280px;">
        <div style="height:100%;width:${Math.round(elapsed * 100)}%;background:${barColor};"></div>
      </div>`;
  }

  function card(t) {
    const isPending = t.status !== 'Completed';
    const link = t.agent_id ? `agent/${t.agent_id}` : (t.application_id ? `application/${t.application_id}` : null);
    return `
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;padding:18px 22px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
          <div style="min-width:0;">
            <div style="font-family:var(--font-display);font-weight:540;font-size:16px;letter-spacing:-0.2px;">${esc(t.business)}</div>
            <div style="font-size:12px;color:var(--color-ink-mute);margin-top:2px;">Signed agreement verified ${fmtDate(t.started_at)} · ${t.deadline_days}-day PRISMS window</div>
          </div>
          ${pill(label(t))}
        </div>
        ${countdown(t)}
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid #f3f0eb;">
          <div style="font-size:11px;color:var(--color-ink-faint);">
            ${t.last_checked_at ? `Last PRISMS poll ${fmtDate(t.last_checked_at)}` : 'Not yet polled'}${link ? ` · <a href="#/${link}" style="color:var(--color-teal-deep);text-decoration:none;font-weight:600;">Open record →</a>` : ''}</div>
          ${isPending ? `<button class="sim-btn" data-id="${t.id}" title="Demo: registers this agent in the mock PRISMS database"
            style="padding:6px 12px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;background:#fff;color:var(--color-ink);border:1px solid var(--color-hairline);">Simulate PRISMS registration</button>` : ''}
        </div>
      </div>`;
  }

  function draw() {
    const pending = trackers.filter((t) => t.status !== 'Completed');
    const overdue = pending.filter((t) => t.overdue).length;
    const completed = trackers.length - pending.length;

    const summary = `
      <div style="display:flex;gap:20px;flex-wrap:wrap;font-size:13px;color:var(--color-ink-mute);margin-bottom:2px;">
        <span><strong style="color:var(--color-ink);">${trackers.length}</strong> tracked</span>
        <span><strong style="color:#8a6d00;">${pending.length - overdue}</strong> pending</span>
        <span><strong style="color:#a12020;">${overdue}</strong> overdue</span>
        <span><strong style="color:#00843d;">${completed}</strong> completed</span>
      </div>`;

    mount.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
        <div>
          <div style="font-size:13px;color:var(--color-ink-mute);line-height:1.5;max-width:640px;">
            Each newly-signed agent must be registered in PRISMS within 30 days. Corridor polls the PRISMS
            system automatically; a tracker flips to <strong>Completed</strong> the moment the agent's PRISMS
            Agent ID is detected. This page also refreshes every ${POLL_MS / 1000}s.</div>
          ${summary}
        </div>
        <button id="check-now" style="padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;
          font-family:inherit;background:var(--color-primary);color:#fff;border:none;white-space:nowrap;">↻ Check PRISMS now</button>
      </div>
      ${trackers.length
        ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:16px;align-items:start;">${trackers.map(card).join('')}</div>`
        : emptyState({ icon: '🗂', title: 'No registrations to track', hint: 'A tracker starts when a signed agreement is verified.' })}`;

    mount.querySelector('#check-now')?.addEventListener('click', async (e) => {
      setButtonBusy(e.currentTarget, 'Checking…');  // poll() re-renders, clearing it
      await poll();
      toast('PRISMS system polled');
    });
    mount.querySelectorAll('.sim-btn').forEach((b) => b.addEventListener('click', async () => {
      const restore = setButtonBusy(b, 'Registering…');
      try {
        await api.simulatePrismsRegistration(Number(b.dataset.id));
        await poll();  // re-renders on success
        toast('Registered in PRISMS · compliance completed');
      } catch {
        restore();
        toast('Could not simulate registration.');
      }
    }));
  }

  draw();
  pollTimer = setInterval(poll, POLL_MS);
}
