/**
 * Color utilities for canvas rendering: theme palettes and the
 * blue → yellow → red heat gradient used by all heatmap modes.
 */

export interface CanvasPalette {
  background: string;
  /** Subtle fill/stroke behind the map area (transparent = frameless). */
  plateFill: string;
  plateStroke: string;
  gridLine: string;
  gridLineMajor: string;
  obstacle: string;
  obstacleEdge: string;
  /** Terrain overlays, indexed by TerrainId 1..3 (rough, sand, hazard). */
  terrainRough: string;
  terrainSand: string;
  terrainHazard: string;
  open: string;
  closed: string;
  current: string;
  currentRing: string;
  treeEdge: string;
  treeNode: string;
  sample: string;
  reject: string;
  path: string;
  pathGlow: string;
  robotBody: string;
  robotEye: string;
  flag: string;
  flagPole: string;
  minimapViewport: string;
  text: string;
}

/** Canvas palette for the dark theme. */
export const DARK_PALETTE: CanvasPalette = {
  background: '#0b1020',
  plateFill: 'rgba(148, 163, 184, 0.05)',
  plateStroke: 'rgba(148, 163, 184, 0.16)',
  gridLine: 'rgba(148, 163, 184, 0.08)',
  gridLineMajor: 'rgba(148, 163, 184, 0.16)',
  obstacle: '#334155',
  obstacleEdge: '#475569',
  terrainRough: 'rgba(180, 120, 60, 0.30)',
  terrainSand: 'rgba(217, 175, 80, 0.38)',
  terrainHazard: 'rgba(220, 60, 60, 0.32)',
  open: 'rgba(56, 189, 248, 0.35)',
  closed: 'rgba(99, 102, 241, 0.28)',
  current: '#f472b6',
  currentRing: 'rgba(244, 114, 182, 0.45)',
  treeEdge: 'rgba(45, 212, 191, 0.55)',
  treeNode: 'rgba(94, 234, 212, 0.9)',
  sample: 'rgba(250, 204, 21, 0.9)',
  reject: 'rgba(248, 113, 113, 0.9)',
  path: '#22d3ee',
  pathGlow: 'rgba(34, 211, 238, 0.35)',
  robotBody: '#22d3ee',
  robotEye: '#0b1020',
  flag: '#f472b6',
  flagPole: '#94a3b8',
  minimapViewport: 'rgba(34, 211, 238, 0.9)',
  text: '#e2e8f0',
};

/** Canvas palette for the light theme. */
export const LIGHT_PALETTE: CanvasPalette = {
  background: '#f8fafc',
  plateFill: 'rgba(15, 23, 42, 0.03)',
  plateStroke: 'rgba(100, 116, 139, 0.22)',
  gridLine: 'rgba(100, 116, 139, 0.12)',
  gridLineMajor: 'rgba(100, 116, 139, 0.22)',
  obstacle: '#475569',
  obstacleEdge: '#334155',
  terrainRough: 'rgba(160, 100, 40, 0.28)',
  terrainSand: 'rgba(190, 150, 50, 0.35)',
  terrainHazard: 'rgba(200, 40, 40, 0.28)',
  open: 'rgba(2, 132, 199, 0.30)',
  closed: 'rgba(79, 70, 229, 0.22)',
  current: '#db2777',
  currentRing: 'rgba(219, 39, 119, 0.4)',
  treeEdge: 'rgba(13, 148, 136, 0.55)',
  treeNode: 'rgba(15, 118, 110, 0.9)',
  sample: 'rgba(202, 138, 4, 0.9)',
  reject: 'rgba(220, 38, 38, 0.9)',
  path: '#0891b2',
  pathGlow: 'rgba(8, 145, 178, 0.30)',
  robotBody: '#0891b2',
  robotEye: '#f8fafc',
  flag: '#db2777',
  flagPole: '#64748b',
  minimapViewport: 'rgba(8, 145, 178, 0.9)',
  text: '#0f172a',
};

/**
 * Canvas palette for the minimal (cyber-industrial) UI profile.
 * Cyber cyan (#00e5ff) is reserved for the path, the active node and the
 * start/goal markers; the open frontier reads as electric-blue data
 * (#0077ff); everything else sits in cold steel greys and the grid
 * dissolves into the backdrop (no plate, hairline grid lines).
 */
export const MINIMAL_PALETTE: CanvasPalette = {
  background: '#0d0f12',
  plateFill: 'transparent',
  plateStroke: 'transparent',
  gridLine: 'rgba(255, 255, 255, 0.03)',
  gridLineMajor: 'rgba(255, 255, 255, 0.05)',
  obstacle: '#1d2129',
  obstacleEdge: '#272c36',
  terrainRough: 'rgba(126, 116, 88, 0.16)',
  terrainSand: 'rgba(150, 138, 92, 0.18)',
  terrainHazard: 'rgba(229, 72, 77, 0.16)',
  open: 'rgba(0, 119, 255, 0.18)',
  closed: 'rgba(86, 98, 117, 0.12)',
  current: '#00e5ff',
  currentRing: 'rgba(0, 229, 255, 0.30)',
  treeEdge: 'rgba(86, 98, 117, 0.40)',
  treeNode: 'rgba(120, 138, 160, 0.75)',
  sample: 'rgba(120, 138, 160, 0.8)',
  reject: 'rgba(229, 72, 77, 0.8)',
  path: '#00e5ff',
  pathGlow: 'rgba(0, 229, 255, 0.18)',
  robotBody: '#00e5ff',
  robotEye: '#0d0f12',
  flag: '#00e5ff',
  flagPole: '#566275',
  minimapViewport: 'rgba(0, 229, 255, 0.85)',
  text: '#c9d1d9',
};

/** Heat gradient stops: blue → yellow → red. */
const HEAT_STOPS: Array<[number, number, number]> = [
  [37, 99, 235], // blue-600
  [250, 204, 21], // yellow-400
  [239, 68, 68], // red-500
];

/**
 * Map a normalized value t ∈ [0, 1] onto the blue → yellow → red gradient.
 * Returns [r, g, b].
 */
export function heatColor(t: number): [number, number, number] {
  const clamped = Math.min(1, Math.max(0, t));
  const scaled = clamped * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(scaled));
  const f = scaled - i;
  const a = HEAT_STOPS[i];
  const b = HEAT_STOPS[i + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * f),
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
  ];
}
