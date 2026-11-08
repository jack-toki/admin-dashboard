export function safeCockpitReturn(value) {
  const raw = String(value || '');
  if (!raw.startsWith('/cockpit')) return '/cockpit';
  if (raw.startsWith('//') || raw.includes('\\') || raw.includes('://')) return '/cockpit';
  return raw;
}
