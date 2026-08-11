// Generic placeholder for routes whose real screen lands in a later milestone.
// Keeps the shell fully navigable in M1 without faking functionality.
import { emptyState } from '../ui.js';
import { NAV, PAGE_META } from '../nav.js';

// application / agreement / invite are real pages as of M2 — no longer here.
const EXTRA_META = {
  agent:              ['Agent profile', 'Performance, compliance & validity tracking'],
  'gov-registration': ['Government registration', 'PRISMS · ASQAnet · TEQSA'],
  offboard:           ['Terminate agent', 'Offboarding & compliance actions'],
};

export function renderPlaceholder(mount, route) {
  const meta = PAGE_META[route] || EXTRA_META[route] || [route, ''];
  const nav = NAV.find((n) => n.route === route);
  const milestone = nav ? nav.milestone : 'a later milestone';
  mount.innerHTML = emptyState({
    icon: '🧭',
    title: `${meta[0]} — coming in ${milestone}`,
    hint: `This screen is scaffolded and routable. Its functionality is planned for ${milestone}. ${meta[1]}`,
  });
}
