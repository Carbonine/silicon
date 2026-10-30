/** Shown in the bar under the address bar. `icon` is a small data URL copied from the page's favicon when bookmarked. */
export interface Bookmark { title: string; url: string; icon?: string }

export const sameUrl = (a: string, b: string): boolean => {
  try { return new URL(a).href === new URL(b).href; } catch { return a === b; }
};
