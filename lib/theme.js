export const THEME_KEY = 'jrl-theme';

export function readTheme(storage) {
  const value = storage?.getItem?.(THEME_KEY);
  return value === 'dark' ? 'dark' : 'light';
}

export function writeTheme(storage, theme) {
  const next = theme === 'dark' ? 'dark' : 'light';
  storage.setItem(THEME_KEY, next);
  return next;
}
