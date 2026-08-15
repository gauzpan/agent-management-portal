// Hash-based client router. Guards routes by auth + role, renders the shell
// once per authed route, then dispatches the page into the shell's mount.
// Supports param routes like #/application/2087.
import { store } from './store.js';
import { NAV, defaultRouteForRole } from './nav.js';
import { renderLogin } from './pages/login.js';
import { renderShell } from './pages/shell.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderApplications } from './pages/applications.js';
import { renderAgents } from './pages/agents.js';
import { renderAgentDetail } from './pages/agent-detail.js';
import { renderApplication } from './pages/application.js';
import { renderAgreement } from './pages/agreement.js';
import { renderInvite } from './pages/invite.js';
import { renderAgentDashboard } from './pages/agent-dashboard.js';
import { renderMarketing } from './pages/marketing.js';
import { renderAgentProfile } from './pages/agent-profile.js';
import { renderAudit } from './pages/audit.js';
import { renderCompliance } from './pages/compliance.js';
import { renderIntake } from './pages/intake.js';
import { renderPlaceholder } from './pages/placeholder.js';

const KNOWN_ROUTES = new Set([
  'dashboard', 'applications', 'application', 'agents', 'agent', 'invite',
  'marketing', 'invoices', 'reports', 'audit', 'settings', 'agent-view',
  'agent-profile', 'agreement', 'gov-registration', 'offboard', 'apply',
  'compliance',
]);

// Routes reachable WITHOUT authentication (public front doors).
const PUBLIC_ROUTES = new Set(['apply']);

// Detail routes highlight their parent nav item and inherit its role gating.
const PARENT_NAV = {
  application: 'applications',
  agreement: 'applications',
  invite: 'applications',
  agent: 'agents',
};

const app = document.getElementById('app');

export function navigate(route) {
  location.hash = `#/${route}`;
}

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return { route: null, param: null };
  const [route, param = null] = raw.split('/');
  return { route, param };
}

function logout() {
  store.clearSession();
  navigate('login');
}

async function dispatchPage(pageMount, route, param) {
  switch (route) {
    case 'dashboard': return renderDashboard(pageMount, { navigate });
    case 'applications': return renderApplications(pageMount, { navigate });
    case 'agents': return renderAgents(pageMount, { navigate });
    case 'agent': return renderAgentDetail(pageMount, param, { navigate });
    case 'application': return renderApplication(pageMount, param, { navigate });
    case 'agreement': return renderAgreement(pageMount, param, { navigate });
    case 'invite': return renderInvite(pageMount, param, { navigate });
    case 'agent-view': return renderAgentDashboard(pageMount, { navigate });
    case 'marketing': return renderMarketing(pageMount, { navigate });
    case 'agent-profile': return renderAgentProfile(pageMount, { navigate });
    case 'audit': return renderAudit(pageMount, { navigate });
    case 'compliance': return renderCompliance(pageMount, { navigate });
    default: return renderPlaceholder(pageMount, route);
  }
}

async function render() {
  const authed = store.isAuthed();
  const { route, param } = currentRoute();

  // Public front doors render standalone (no shell), auth or not.
  if (PUBLIC_ROUTES.has(route)) { renderIntake(app, { navigate }); return; }

  // Unauthenticated → login.
  if (!authed) {
    if (route !== 'login') { navigate('login'); return; }
    renderLogin(app, { navigate });
    return;
  }

  const role = store.getRole();
  const home = defaultRouteForRole(role);

  // Authed but no/unknown/login route → send to role home.
  if (!route || route === 'login' || !KNOWN_ROUTES.has(route)) {
    navigate(home);
    return;
  }

  // Role gating: check the route (or its parent nav) against the role.
  const navRoute = PARENT_NAV[route] || route;
  const navEntry = NAV.find((n) => n.route === navRoute);
  if (navEntry && !navEntry.roles.includes(role)) {
    navigate(home);
    return;
  }

  const pageMount = renderShell(app, {
    route, activeNav: navRoute, navigate, onLogout: logout,
  });
  await dispatchPage(pageMount, route, param);
}

export function startRouter() {
  window.addEventListener('hashchange', render);
  render();
}
