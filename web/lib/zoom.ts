import { hostOf } from "./protocol";

export type ZoomMap = Record<string, number>;
const LEVELS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];

/** Zoom is remembered per site. All silicon:// pages share one level. */
export const zoomSite = (url: string): string => (/^https?:/i.test(url) ? hostOf(url) : "silicon://");
export const zoomOf = (map: ZoomMap, url: string): number => {
  const z = Number(map[zoomSite(url)]);
  return z >= 0.25 && z <= 5 ? z : 1;
};
export function zoomStep(current: number, dir: 1 | -1): number {
  let i = LEVELS.findIndex((l) => l >= current - 1e-6);
  if (i < 0) i = LEVELS.length - 1;
  if (Math.abs(LEVELS[i] - current) > 1e-6 && dir < 0) i++; // between steps, going down starts from the step below
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, i + dir))];
}
export function withZoom(map: ZoomMap, url: string, z: number): ZoomMap {
  const next = { ...map }, site = zoomSite(url);
  if (z === 1) delete next[site]; else next[site] = z;
  return next;
}
