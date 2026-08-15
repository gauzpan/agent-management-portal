// Authenticated app shell: green sidebar (role-gated nav) + sticky topbar +
// a <main> content mount the router fills per route.
import { store } from '../store.js';
import { NAV, PAGE_META } from '../nav.js';
import { esc } from '../ui.js';

// Titles for detail routes that aren't top-level nav items.
const DETAIL_META = {
  application: ['Reviewing application', 'Business, documents & referee review'],
  agreement: ['Send agent agreement', 'Approval → Agreement → Invite'],
  invite: ['Send portal invitation', 'Grant the approved agent portal access'],
};

export function renderShell(mount, { route, activeNav, navigate, onLogout }) {
  const session = store.getSession();
  const role = session.role;
  const items = NAV.filter((n) => n.roles.includes(role));
  const [title, sub] = PAGE_META[route] || DETAIL_META[route] || [route, ''];
  const highlight = activeNav || route;

  const navHtml = items.map((n) => {
    const active = n.route === highlight ? ' is-active' : '';
    const badge = n.badge ? `<span class="nav-item__badge">${esc(n.badge)}</span>` : '';
    return `<button class="nav-item${active}" data-route="${n.route}"><span>${esc(n.label)}</span>${badge}</button>`;
  }).join('');

  mount.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar amp-scroll">
        <div class="sidebar__brand">
          <div class="sidebar__logo"><img src="icons/logo.svg" alt="Corridor"></div>
          <div style="line-height:1.15;">
            <div class="brand-wordmark" style="font-size:18px;">Corridor</div>
            <div class="sidebar__college">Agent Management Portal</div>
          </div>
        </div>
        <div class="sidebar__section">Workspace</div>
        ${navHtml}
        <div style="flex:1;"></div>
        <div class="sidebar__footer">
          <div class="sidebar__user">
            <div class="sidebar__avatar">${esc(session.initials || '—')}</div>
            <div style="font-size:13px;line-height:1.3;">
              <div style="font-weight:540;">${esc(session.name)}</div>
              <div style="color:var(--color-on-dark-mute);font-size:11px;">${esc(session.title || role)}</div>
            </div>
          </div>
          <div class="sidebar__logout" id="logout-btn">Log out</div>
        </div>
      </aside>
      <main class="main amp-scroll">
        <header class="topbar">
          <div>
            <div class="topbar__title">${esc(title)}</div>
            <div class="topbar__sub">${esc(sub)}</div>
          </div>
          <input class="topbar__search" placeholder="Search agents, applications, documents…">
        </header>
        <div class="page" id="page-mount"></div>
      </main>
    </div>`;

  mount.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.route));
  });
  mount.querySelector('#logout-btn').addEventListener('click', onLogout);

  return mount.querySelector('#page-mount');
}
