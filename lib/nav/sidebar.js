// Cockpit navigation only. Not a native app and not the reference image's product.

export const NAV_STORAGE_KEY = 'toki.cockpit.nav.v1';

export const NAV_ITEMS = [
  { id: 'jrl', label: 'JRL', hint: 'Personal finances, kept off the Toki board' },
  { id: 'toki', label: 'Toki', hint: 'Business plan' },
  { id: 'automations', label: 'Automations', hint: 'Run monitoring' },
];

export const TOKI_VIEWS = [
  { id: 'sources', label: 'Income and costs' },
];

export const COCKPIT_ROUTES = {
  home: '/cockpit',
  login: '/cockpit/login',
  workspace: '/api/cockpit/workspace',
  jrl: '/api/cockpit/jrl',
  ingest: '/api/ingest/[account]',
  nativeApp: false,
};

export function visibleNav(areas) {
  const allowed = new Set(areas || []);
  return NAV_ITEMS.filter((item) => allowed.has(item.id));
}

export function readCollapsed(storage) {
  const value = storage?.getItem?.(NAV_STORAGE_KEY);
  return value === 'compact';
}

export function writeCollapsed(storage, collapsed) {
  storage.setItem(NAV_STORAGE_KEY, collapsed ? 'compact' : 'expanded');
  return collapsed;
}

export function toggleCollapsed(storage) {
  return writeCollapsed(storage, !readCollapsed(storage));
}
