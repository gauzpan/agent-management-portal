// Dashboard (M1): a light "wiring proof" — pulls live counts from the backend
// so we can confirm the full PWA→FastAPI→SQLite path end-to-end. The rich
// widgets from the comp (risk donut, pipeline, top performers) land in M2.
import { api, ApiError } from '../api.js';
import { esc, emptyState } from '../ui.js';

const KPIS = [
  { key: 'applications', label: 'Total applications', hint: 'View all applications →', route: 'applications' },
  { key: 'agents', label: 'Active agents', hint: 'from /agents' },
  { key: 'marketing', label: 'Marketing assets', hint: 'from /marketing' },
  { key: 'audit', label: 'Audit events', hint: 'from /audit' },
];

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
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px;">${cards}</div>
      ${emptyState({
        icon: '🚧',
        title: 'Stay tuned',
        hint: '',
      })}`;

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
