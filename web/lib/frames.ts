// Each tab's live iframe and its back/forward, for the toolbar and the bridge. Kept outside React state: frames aren't data.
export interface TabHandle {
  iframe: HTMLIFrameElement;
  traverse(delta: -1 | 1): void;
}
export const tabFrames = new Map<string, TabHandle>();

export function tabIdOfWindow(win: Window): string | undefined {
  for (const [id, handle] of tabFrames) if (handle.iframe.contentWindow === win) return id;
  return undefined;
}
