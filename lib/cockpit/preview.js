// The preview fixture is a local review aid. Production must ignore the flag
// so a deployed server only renders rows from the store.
export function previewFixtureEnabled(env = process.env) {
  return env.NODE_ENV !== 'production' && env.COCKPIT_PREVIEW_FIXTURE === '1';
}
