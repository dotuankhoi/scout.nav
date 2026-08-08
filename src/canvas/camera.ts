/**
 * 2D camera for the map viewport.
 *
 * `zoom` is expressed in screen pixels per cell; (x, y) is the screen
 * position of the map origin. The camera is a plain mutable object that
 * lives outside React — pan/zoom gestures update it at 60 fps without
 * triggering re-renders, and both comparison panes share one instance so
 * their viewports stay synchronized.
 */

import type { Vec2 } from '@/types';

export interface Camera {
  x: number;
  y: number;
  /** Screen pixels per cell. */
  zoom: number;
}

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 120;

export function createCamera(): Camera {
  return { x: 0, y: 0, zoom: 20 };
}

/** Convert a screen point (CSS px) to continuous cell coordinates. */
export function screenToWorld(cam: Camera, sx: number, sy: number): Vec2 {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

/** Convert continuous cell coordinates to screen CSS pixels. */
export function worldToScreen(cam: Camera, wx: number, wy: number): Vec2 {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

/** Zoom by `factor` keeping the screen point (sx, sy) fixed. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): void {
  const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, cam.zoom * factor));
  const applied = next / cam.zoom;
  cam.x = sx - (sx - cam.x) * applied;
  cam.y = sy - (sy - cam.y) * applied;
  cam.zoom = next;
}

/** Center the whole map in a viewport with padding. */
export function fitToMap(
  cam: Camera,
  mapWidth: number,
  mapHeight: number,
  viewWidth: number,
  viewHeight: number,
  padding = 32,
): void {
  const zx = (viewWidth - padding * 2) / mapWidth;
  const zy = (viewHeight - padding * 2) / mapHeight;
  cam.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(zx, zy)));
  cam.x = (viewWidth - mapWidth * cam.zoom) / 2;
  cam.y = (viewHeight - mapHeight * cam.zoom) / 2;
}
