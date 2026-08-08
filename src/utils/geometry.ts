import type { Cell, GridMap, Vec2 } from '@/types';
import { cellIndex } from '@/types';

/** Euclidean distance between two continuous points. */
export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Total geometric length of a polyline (in cell units). */
export function pathLength(points: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1], points[i]);
  return len;
}

/** True when (x, y) is a valid free cell of the map. */
export function isFreeCell(map: GridMap, x: number, y: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    x < map.width &&
    y < map.height &&
    map.cells[cellIndex(x, y, map.width)] === 0
  );
}

/**
 * Grid line-of-sight between two cell centers (supercover traversal).
 *
 * Visits every cell the segment passes through — including both cells at
 * exact corner crossings, so a diagonal cannot "slip between" two
 * diagonally-touching obstacles. Used by Theta* and path smoothing.
 */
export function lineOfSight(map: GridMap, a: Cell, b: Cell): boolean {
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (!isFreeCell(map, x0, y0)) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 === 0 && dx > 0 && dy > 0) {
      // Exact corner crossing: both adjacent cells must be free.
      if (!isFreeCell(map, x0 + sx, y0) || !isFreeCell(map, x0, y0 + sy)) {
        return false;
      }
    }
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Line-of-sight that additionally requires clear (cost-1) terrain along
 * the whole segment. Theta*'s any-angle shortcut prices a straight line
 * at Euclidean distance, which would silently under-count weighted
 * terrain — so on sand/rubble the shortcut is simply not taken.
 */
export function lineOfSightClearTerrain(map: GridMap, a: Cell, b: Cell): boolean {
  let x0 = a.x;
  let y0 = a.y;
  const x1 = b.x;
  const y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  for (;;) {
    if (!isFreeCell(map, x0, y0)) return false;
    if (map.terrain[cellIndex(x0, y0, map.width)] !== 0) return false;
    if (x0 === x1 && y0 === y1) return true;
    const e2 = 2 * err;
    if (e2 === 0 && dx > 0 && dy > 0) {
      if (!isFreeCell(map, x0 + sx, y0) || !isFreeCell(map, x0, y0 + sy)) {
        return false;
      }
    }
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/**
 * Collision check for a continuous segment against the occupancy grid.
 * Samples the segment at sub-cell resolution (used by RRT / RRT*).
 */
export function segmentFree(map: GridMap, a: Vec2, b: Vec2, resolution = 0.2): boolean {
  const length = dist(a, b);
  const steps = Math.max(1, Math.ceil(length / resolution));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = Math.floor(a.x + (b.x - a.x) * t);
    const y = Math.floor(a.y + (b.y - a.y) * t);
    if (!isFreeCell(map, x, y)) return false;
  }
  return true;
}

/** True when a continuous point lies inside a free cell. */
export function pointFree(map: GridMap, p: Vec2): boolean {
  return isFreeCell(map, Math.floor(p.x), Math.floor(p.y));
}

/**
 * Chaikin corner-cutting smoothing. Keeps endpoints fixed.
 * Each iteration replaces every interior corner with two points at
 * 1/4 and 3/4 of the adjoining segments, converging to a quadratic B-spline.
 */
export function chaikinSmooth(points: Vec2[], iterations = 2): Vec2[] {
  if (points.length < 3) return points;
  let pts = points;
  for (let it = 0; it < iterations; it++) {
    const next: Vec2[] = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i];
      const q = pts[i + 1];
      next.push({ x: p.x * 0.75 + q.x * 0.25, y: p.y * 0.75 + q.y * 0.25 });
      next.push({ x: p.x * 0.25 + q.x * 0.75, y: p.y * 0.25 + q.y * 0.75 });
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

/**
 * Sample a point at normalized position t ∈ [0, 1] along a polyline
 * (arc-length parameterized). Returns the point and the segment heading.
 */
export function samplePolyline(
  points: Vec2[],
  t: number,
): { point: Vec2; angle: number } {
  if (points.length === 0) return { point: { x: 0, y: 0 }, angle: 0 };
  if (points.length === 1) return { point: points[0], angle: 0 };
  const total = pathLength(points);
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i++) {
    const seg = dist(points[i - 1], points[i]);
    if (target <= seg || i === points.length - 1) {
      const f = seg === 0 ? 0 : target / seg;
      const p = points[i - 1];
      const q = points[i];
      return {
        point: { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f },
        angle: Math.atan2(q.y - p.y, q.x - p.x),
      };
    }
    target -= seg;
  }
  const last = points[points.length - 1];
  return { point: last, angle: 0 };
}
