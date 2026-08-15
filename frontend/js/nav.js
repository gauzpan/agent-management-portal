// Navigation config. `roles` gates which nav items each role sees (M1 role
// gating). Routes map 1:1 to the designer's view flags. `milestone` marks when
// the real screen lands so placeholder pages can say so.
export const NAV = [
  { route: 'dashboard',  label: 'Dashboard',            badge: '',   roles: ['admin'],          milestone: 'M2' },
  { route: 'applications', label: 'Applications',       badge: '',   roles: ['admin'],          milestone: 'M2' },
  { route: 'agents',     label: 'Agents',               badge: '',   roles: ['admin'],          milestone: 'M4' },
  { route: 'compliance', label: 'Compliance',           badge: '',   roles: ['admin'],          milestone: 'M4' },
  { route: 'marketing',  label: 'Marketing collateral', badge: '',   roles: ['admin', 'agent'], milestone: 'M3' },
  { route: 'invoices',   label: 'Invoices',             badge: '',   roles: ['admin'],          milestone: 'M5' },
  { route: 'reports',    label: 'Reports',              badge: '',   roles: ['admin'],          milestone: 'M5' },
  { route: 'audit',      label: 'Audit trail',          badge: '',   roles: ['admin'],          milestone: 'M5' },
  { route: 'settings',   label: 'Settings',             badge: '',   roles: ['admin'],          milestone: 'M5' },
  { route: 'agent-view', label: 'Agent portal',         badge: '',   roles: ['agent'],          milestone: 'M3' },
  { route: 'agent-profile', label: 'My profile',        badge: '',   roles: ['agent'],          milestone: 'M3' },
];

// Per-route page header (title + subtitle), mirroring the comp's pageMeta.
export const PAGE_META = {
  dashboard:    ['Dashboard', 'Applications, agents and activity at a glance'],
  applications: ['Applications', 'Review and track every agent application'],
  agents:       ['Agent directory', 'Track partnership status, performance and compliance'],
  compliance:   ['PRISMS compliance', 'The 30-day agent-registration window, tracked against PRISMS'],
  marketing:    ['Marketing collateral', 'The single source of truth shared with every agent'],
  invoices:     ['Invoices & commissions', 'Kensington Melbourne College · Agent billing ledger'],
  reports:      ['Reports', 'Generate exec-ready reports on agent activity, performance and compliance'],
  audit:        ['Audit trail', 'Immutable, timestamped record of every action'],
  settings:     ['Settings', 'Workspace, staff members and role-based access'],
  'agent-view': ['Agent portal', 'Partner view · marketing & course collateral'],
  'agent-profile': ['My profile', 'Your partnership status & performance'],
};

export function defaultRouteForRole(role) {
  return role === 'agent' ? 'agent-view' : 'dashboard';
}
