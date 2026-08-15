// Audit trail (M5): the admin's immutable, timestamped record of every action
// taken in the portal. Reads the append-only AuditEvent log from GET /audit
// (newest-first) and renders it as a searchable, day-grouped activity feed.
// Events are emitted server-side across the mutation endpoints (create/upload/
// intake, scan, field corrections, sign-offs, document verify/flag, agreement
// workflow, deletes) — this screen is the read view over that log.
import { api, ApiError } from '../api.js';
import { esc, emptyState } from '../ui.js';

// Colour an actor consistently by hashing their name → a hue. Keeps the same
// person the same colour across the feed without a hard-coded map.
function actorColor(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h} 42% 42%)`;
}

function initials(name) {
  const parts = name.replace(/·.*/, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// Server datetimes are naive UTC (datetime.utcnow); treat as UTC so local
// rendering is correct.
function parseAt(iso) {
  if (!iso) return null;
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
  return isNaN(d.getTime()) ? null : d;
}

function relativeTime(d) {
  const secs = Math.round((Date.now() - d.getTime()) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

function dayLabel(d) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a, b) => a.toDateString() === b.toDateString();
  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// If an event's entity names an application, link to its review screen.
function entityLink(entity) {
  const m = /^Application\s+(\d+)$/.exec(entity || '');
  if (m) return `<a href="#/application/${m[1]}" class="audit-entity-link"
    style="color:var(--color-primary);font-weight:600;text-decoration:none;">${esc(entity)}</a>`;
  return entity ? `<span style="font-weight:600;color:var(--color-ink);">${esc(entity)}</span>` : '';
}

export async function renderAudit(mount, { navigate }) {
  mount.innerHTML = `<div style="color:var(--color-ink-mute);font-size:13px;">Loading audit trail…</div>`;

  let events;
  try {
    events = await api.audit();
  } catch (err) {
    const msg = err instanceof ApiError && err.status === 0
      ? 'Cannot reach the backend. Start it with python3 main.py.'
      : 'Could not load the audit trail.';
    mount.innerHTML = emptyState({ icon: '⚠️', title: 'Audit trail unavailable', hint: msg });
    return;
  }

  // Newest-first from the server; keep that order.
  const actors = [...new Set(events.map((e) => e.actor).filter(Boolean))].sort();
  let query = '';
  let actorFilter = 'all';

  function filtered() {
    const q = query.trim().toLowerCase();
    return events.filter((e) => {
      if (actorFilter !== 'all' && e.actor !== actorFilter) return false;
      if (!q) return true;
      return [e.actor, e.action, e.entity, e.detail]
        .some((f) => (f || '').toLowerCase().includes(q));
    });
  }

  function draw() {
    const rows = filtered();

    const chip = (val, label, count) => {
      const on = val === actorFilter;
      return `<button class="audit-actor" data-actor="${esc(val)}" style="padding:7px 13px;border-radius:999px;
        font-size:12px;font-weight:540;cursor:pointer;font-family:inherit;white-space:nowrap;
        background:${on ? 'var(--color-primary)' : '#fff'};color:${on ? '#fff' : 'var(--color-ink)'};
        border:1px solid ${on ? 'var(--color-primary)' : 'var(--color-hairline)'};">
        ${esc(label)}<span style="opacity:0.6;margin-left:5px;">${count}</span></button>`;
    };
    const chips = [chip('all', 'All actors', events.length)]
      .concat(actors.map((a) => chip(a, a, events.filter((e) => e.actor === a).length)))
      .join('');

    // Group the filtered rows by calendar day (they arrive newest-first).
    let feed;
    if (!rows.length) {
      feed = `<div style="padding:40px;text-align:center;color:var(--color-ink-mute);font-size:13px;">
        No activity matches your filters.</div>`;
    } else {
      const groups = [];
      let current = null;
      rows.forEach((e) => {
        const d = parseAt(e.at);
        const key = d ? d.toDateString() : 'unknown';
        if (!current || current.key !== key) {
          current = { key, label: d ? dayLabel(d) : 'Unknown date', items: [] };
          groups.push(current);
        }
        current.items.push({ e, d });
      });

      feed = groups.map((g) => `
        <div style="padding:12px 20px 6px;font-size:11px;font-weight:700;text-transform:uppercase;
          letter-spacing:0.6px;color:var(--color-ink-mute);background:var(--color-canvas-soft);
          border-bottom:1px solid var(--color-hairline);position:sticky;top:0;">${esc(g.label)}</div>
        ${g.items.map(({ e, d }) => {
          const color = actorColor(e.actor || '?');
          const time = d ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '';
          const rel = d ? relativeTime(d) : '';
          return `<div style="display:flex;gap:14px;padding:14px 20px;border-bottom:1px solid var(--color-hairline);align-items:flex-start;">
            <div title="${esc(e.actor)}" style="flex:none;width:34px;height:34px;border-radius:50%;background:${color};
              color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">
              ${esc(initials(e.actor || '?'))}</div>
            <div style="min-width:0;flex:1;">
              <div style="font-size:13px;color:var(--color-ink);line-height:1.45;">
                <span style="font-weight:600;">${esc(e.actor || 'Unknown')}</span>
                <span style="color:var(--color-ink-mute);"> ${esc(e.action || '')}</span>
                ${e.entity ? ` · ${entityLink(e.entity)}` : ''}
              </div>
              ${e.detail ? `<div style="font-size:12px;color:var(--color-ink-mute);margin-top:3px;line-height:1.45;">${esc(e.detail)}</div>` : ''}
            </div>
            <div title="${d ? esc(d.toLocaleString()) : ''}" style="flex:none;text-align:right;font-size:11px;color:var(--color-ink-faint);white-space:nowrap;">
              <div>${esc(time)}</div>
              <div style="margin-top:2px;">${esc(rel)}</div>
            </div>
          </div>`;
        }).join('')}`).join('');
    }

    mount.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap;">
        <div style="font-size:13px;color:var(--color-ink-mute);">
          ${rows.length} of ${events.length} event(s) · immutable, timestamped record</div>
        <input id="audit-search" type="search" placeholder="Search actor, action, entity or detail…"
          value="${esc(query)}" style="flex:1;min-width:220px;max-width:360px;padding:9px 14px;
          border:1px solid var(--color-hairline);border-radius:8px;font-size:13px;font-family:inherit;
          background:#fff;outline:none;box-sizing:border-box;">
      </div>
      <div style="display:flex;gap:8px;margin-bottom:18px;flex-wrap:wrap;">${chips}</div>
      <div style="background:#fff;border:1px solid var(--color-hairline);border-radius:12px;overflow:hidden;">
        ${feed}
      </div>`;

    const search = mount.querySelector('#audit-search');
    search.addEventListener('input', () => {
      query = search.value;
      const pos = search.selectionStart;
      draw();
      const s = mount.querySelector('#audit-search');
      s.focus();
      try { s.setSelectionRange(pos, pos); } catch { /* search inputs may reject */ }
    });
    mount.querySelectorAll('.audit-actor').forEach((b) =>
      b.addEventListener('click', () => { actorFilter = b.dataset.actor; draw(); }));
    mount.querySelectorAll('.audit-entity-link').forEach((a) =>
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        navigate(a.getAttribute('href').replace(/^#\//, ''));
      }));
  }

  draw();
}
