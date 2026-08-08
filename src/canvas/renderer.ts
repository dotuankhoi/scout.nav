/**
 * SceneRenderer — draws the whole planning scene each animation frame.
 *
 * Rendering is layered for performance:
 *  - obstacle layer: offscreen canvas, rebuilt only when the map changes
 *  - cell-state layer: ImageData at map resolution (open/closed/heatmap),
 *    rebuilt only when the playback cursor or view options change
 *  - dynamic overlays (tree, path, robot, flag, markers): drawn per frame
 *
 * The renderer is pure visualization: it reads a {@link TraceView}
 * snapshot and never touches algorithm or store code.
 */

import type { Cell, GridMap, HeatmapMode, Vec2 } from '@/types';
import { cellIndex } from '@/types';
import { chaikinSmooth, samplePolyline } from '@/utils/geometry';
import { heatColor, type CanvasPalette } from '@/utils/colors';
import type { Camera } from './camera';
import type { TraceView } from './visState';

/** Offscreen resolution of the obstacle layer, px per cell. */
const OBSTACLE_RES = 10;

export interface PaintRipple {
  x: number;
  y: number;
  /** Time (s) at which the cell was painted. */
  at: number;
  value: 0 | 1;
}

export interface FrameArgs {
  ctx: CanvasRenderingContext2D;
  cssWidth: number;
  cssHeight: number;
  dpr: number;
  camera: Camera;
  map: GridMap;
  mapVersion: number;
  start: Cell;
  goal: Cell;
  view: TraceView | null;
  palette: CanvasPalette;
  /** Cache key for theme-dependent layers ('dark' | 'light' | 'minimal'). */
  theme: string;
  showGrid: boolean;
  heatmap: HeatmapMode;
  smoothPath: boolean;
  /** Monotonic time in seconds (drives idle animations). */
  time: number;
  /** Path reveal progress ∈ [0, 1]. */
  pathProgress: number;
  /** Robot position along the path ∈ [0, 1], or null to sit at start. */
  robotT: number | null;
  /** Recently painted cells (obstacle fade-in ripples). */
  ripples: PaintRipple[];
}

function parseColor(c: string): [number, number, number, number] {
  if (c.startsWith('#')) {
    const r = parseInt(c.slice(1, 3), 16);
    const g = parseInt(c.slice(3, 5), 16);
    const b = parseInt(c.slice(5, 7), 16);
    return [r, g, b, 255];
  }
  const m = c.match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\)/);
  if (!m) return [255, 0, 255, 255];
  return [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
    Math.round((m[4] === undefined ? 1 : Number(m[4])) * 255),
  ];
}

export class SceneRenderer {
  private obstacleCanvas = document.createElement('canvas');
  private obstacleKey = '';
  private cellCanvas = document.createElement('canvas');
  private cellKey = '';
  private densityBuf: Float32Array | null = null;

  /** Rebuild the offscreen obstacle layer when the map/theme changes. */
  private syncObstacleLayer(map: GridMap, mapVersion: number, palette: CanvasPalette, theme: string): void {
    const key = `${mapVersion}|${theme}|${map.width}x${map.height}`;
    if (key === this.obstacleKey) return;
    this.obstacleKey = key;
    const c = this.obstacleCanvas;
    c.width = map.width * OBSTACLE_RES;
    c.height = map.height * OBSTACLE_RES;
    const octx = c.getContext('2d');
    if (!octx) return;
    octx.clearRect(0, 0, c.width, c.height);

    // Terrain underlay (rough / sand / hazard tints beneath everything).
    const terrainColors = [null, palette.terrainRough, palette.terrainSand, palette.terrainHazard];
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const i = cellIndex(x, y, map.width);
        const t = map.terrain[i];
        if (t === 0 || map.cells[i] === 1) continue;
        const color = terrainColors[t];
        if (!color) continue;
        octx.fillStyle = color;
        octx.fillRect(x * OBSTACLE_RES, y * OBSTACLE_RES, OBSTACLE_RES, OBSTACLE_RES);
        // Hazard cells get a subtle diagonal warning stripe.
        if (t === 3) {
          octx.strokeStyle = color;
          octx.lineWidth = 1.5;
          octx.beginPath();
          octx.moveTo(x * OBSTACLE_RES, (y + 1) * OBSTACLE_RES);
          octx.lineTo((x + 1) * OBSTACLE_RES, y * OBSTACLE_RES);
          octx.stroke();
        }
      }
    }

    octx.fillStyle = palette.obstacle;
    octx.strokeStyle = palette.obstacleEdge;
    octx.lineWidth = 1;
    const r = 2.5;
    const inset = 0.75;
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.cells[cellIndex(x, y, map.width)] !== 1) continue;
        const px = x * OBSTACLE_RES + inset;
        const py = y * OBSTACLE_RES + inset;
        const s = OBSTACLE_RES - inset * 2;
        octx.beginPath();
        octx.roundRect(px, py, s, s, r);
        octx.fill();
        octx.stroke();
      }
    }
  }

  /** Rebuild the cell-state ImageData layer (open/closed/heatmaps). */
  private syncCellLayer(
    map: GridMap,
    view: TraceView | null,
    heatmap: HeatmapMode,
    palette: CanvasPalette,
    theme: string,
  ): void {
    const idx = view ? view.index : -1;
    const key = `${idx}|${heatmap}|${theme}|${map.width}x${map.height}|${view ? view.open.size : 0}`;
    if (key === this.cellKey) return;
    this.cellKey = key;

    const w = map.width;
    const h = map.height;
    this.cellCanvas.width = w;
    this.cellCanvas.height = h;
    const cctx = this.cellCanvas.getContext('2d');
    if (!cctx) return;
    cctx.clearRect(0, 0, w, h);
    if (!view) return;

    const img = cctx.createImageData(w, h);
    const data = img.data;
    const openRgba = parseColor(palette.open);
    const closedRgba = parseColor(palette.closed);

    if (heatmap === 'none') {
      for (const i of view.closed) {
        const o = i * 4;
        data[o] = closedRgba[0];
        data[o + 1] = closedRgba[1];
        data[o + 2] = closedRgba[2];
        data[o + 3] = closedRgba[3];
      }
      for (const i of view.open.keys()) {
        const o = i * 4;
        data[o] = openRgba[0];
        data[o + 1] = openRgba[1];
        data[o + 2] = openRgba[2];
        data[o + 3] = openRgba[3];
      }
    } else {
      const n = w * h;
      let values: ArrayLike<number>;
      let max = 1;
      if (heatmap === 'frequency') {
        values = view.visits;
        max = view.maxVisits;
      } else if (heatmap === 'order') {
        values = view.order;
        max = Math.max(1, view.touchCounter - 1);
      } else {
        // density: 3×3 box sum of visit counts
        if (!this.densityBuf || this.densityBuf.length !== n) {
          this.densityBuf = new Float32Array(n);
        }
        const buf = this.densityBuf;
        buf.fill(0);
        max = 1;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let dy = -1; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && ny >= 0 && nx < w && ny < h) {
                  sum += view.visits[ny * w + nx];
                }
              }
            }
            buf[y * w + x] = sum;
            if (sum > max) max = sum;
          }
        }
        values = buf;
      }

      for (let i = 0; i < n; i++) {
        const raw = values[i];
        const touched = heatmap === 'order' ? raw >= 0 : raw > 0;
        if (!touched) continue;
        const t = heatmap === 'order' ? raw / max : raw / max;
        const [r, g, b] = heatColor(t);
        const o = i * 4;
        data[o] = r;
        data[o + 1] = g;
        data[o + 2] = b;
        data[o + 3] = 165;
      }
    }
    cctx.putImageData(img, 0, 0);
  }

  /** Draw one full frame. */
  render(args: FrameArgs): void {
    const {
      ctx, cssWidth, cssHeight, dpr, camera, map, mapVersion, start, goal,
      view, palette, theme, showGrid, heatmap, smoothPath, time,
      pathProgress, robotT, ripples,
    } = args;

    this.syncObstacleLayer(map, mapVersion, palette, theme);
    this.syncCellLayer(map, view, heatmap, palette, theme);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // Enter world space: 1 unit = 1 cell.
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    const px = 1 / camera.zoom; // one screen pixel in world units

    // Map plate (transparent in the minimal profile — frameless grid).
    if (palette.plateFill !== 'transparent' || palette.plateStroke !== 'transparent') {
      ctx.beginPath();
      ctx.roundRect(-0.25, -0.25, map.width + 0.5, map.height + 0.5, 0.5);
      if (palette.plateFill !== 'transparent') {
        ctx.fillStyle = palette.plateFill;
        ctx.fill();
      }
      if (palette.plateStroke !== 'transparent') {
        ctx.strokeStyle = palette.plateStroke;
        ctx.lineWidth = 2 * px;
        ctx.stroke();
      }
    }

    // Cell-state layer (crisp cells — no smoothing).
    if (view) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.cellCanvas, 0, 0, map.width, map.height);
      ctx.imageSmoothingEnabled = true;
    }

    // Obstacles.
    ctx.drawImage(this.obstacleCanvas, 0, 0, map.width, map.height);

    // Obstacle paint ripples (fade-in feedback).
    for (const rp of ripples) {
      const age = time - rp.at;
      if (age > 0.45) continue;
      const t = age / 0.45;
      ctx.strokeStyle = rp.value === 1 ? palette.obstacleEdge : palette.path;
      ctx.globalAlpha = 1 - t;
      ctx.lineWidth = 2 * px;
      ctx.beginPath();
      ctx.arc(rp.x + 0.5, rp.y + 0.5, 0.2 + t * 0.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Grid lines.
    if (showGrid && camera.zoom >= 6) {
      const x0 = Math.max(0, Math.floor(-camera.x / camera.zoom));
      const y0 = Math.max(0, Math.floor(-camera.y / camera.zoom));
      const x1 = Math.min(map.width, Math.ceil((cssWidth - camera.x) / camera.zoom));
      const y1 = Math.min(map.height, Math.ceil((cssHeight - camera.y) / camera.zoom));
      ctx.lineWidth = px;
      for (let x = x0; x <= x1; x++) {
        ctx.strokeStyle = x % 5 === 0 ? palette.gridLineMajor : palette.gridLine;
        ctx.beginPath();
        ctx.moveTo(x, Math.max(0, y0));
        ctx.lineTo(x, Math.min(map.height, y1));
        ctx.stroke();
      }
      for (let y = y0; y <= y1; y++) {
        ctx.strokeStyle = y % 5 === 0 ? palette.gridLineMajor : palette.gridLine;
        ctx.beginPath();
        ctx.moveTo(Math.max(0, x0), y);
        ctx.lineTo(Math.min(map.width, x1), y);
        ctx.stroke();
      }
    }

    // Sampling tree (RRT / RRT*).
    if (view && view.tree.length > 1) {
      ctx.strokeStyle = palette.treeEdge;
      ctx.lineWidth = Math.max(px, 0.06);
      ctx.beginPath();
      for (const node of view.tree) {
        if (!node || node.parent < 0) continue;
        const p = view.tree[node.parent];
        if (!p) continue;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(node.x, node.y);
      }
      ctx.stroke();
      if (camera.zoom >= 10) {
        ctx.fillStyle = palette.treeNode;
        ctx.beginPath();
        for (const node of view.tree) {
          if (!node) continue;
          ctx.moveTo(node.x, node.y);
          ctx.arc(node.x, node.y, 0.09, 0, Math.PI * 2);
        }
        ctx.fill();
      }
    }

    // Sample / reject markers with index-based fade.
    if (view) {
      this.drawMarker(ctx, view, view.lastSample, palette.sample, px, false);
      this.drawMarker(ctx, view, view.lastReject, palette.reject, px, true);
    }

    // Current node pulse.
    if (view?.current) {
      const cx = view.current.x + 0.5;
      const cy = view.current.y + 0.5;
      const pulse = 0.35 + 0.1 * Math.sin(time * 7);
      ctx.fillStyle = palette.current;
      ctx.beginPath();
      ctx.roundRect(view.current.x + 0.12, view.current.y + 0.12, 0.76, 0.76, 0.18);
      ctx.fill();
      ctx.strokeStyle = palette.currentRing;
      ctx.lineWidth = 3 * px;
      ctx.beginPath();
      ctx.arc(cx, cy, 0.5 + pulse, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Final path with animated reveal + marching glow.
    const rawPath = view?.path ?? null;
    if (rawPath && rawPath.length > 1 && pathProgress > 0) {
      const pts = smoothPath ? chaikinSmooth(rawPath, 3) : rawPath;
      const shown = this.partialPolyline(pts, pathProgress);
      if (shown.length > 1) {
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.strokeStyle = palette.pathGlow;
        ctx.lineWidth = 0.42;
        this.strokePolyline(ctx, shown);
        ctx.strokeStyle = palette.path;
        ctx.lineWidth = 0.16;
        ctx.setLineDash([0.6, 0.35]);
        ctx.lineDashOffset = -time * 1.6;
        this.strokePolyline(ctx, shown);
        ctx.setLineDash([]);
      }
    }

    // Goal flag (waving) and start pad.
    this.drawStartPad(ctx, start, palette, px);
    this.drawFlag(ctx, goal, palette, time);

    // Robot: travels the path once revealed, otherwise idles at start.
    const travelPath = rawPath && pathProgress >= 1 ? (smoothPath ? chaikinSmooth(rawPath, 3) : rawPath) : null;
    if (travelPath && robotT !== null) {
      const { point, angle } = samplePolyline(travelPath, robotT);
      this.drawRobot(ctx, point, angle, palette, time, px);
    } else {
      this.drawRobot(
        ctx,
        { x: start.x + 0.5, y: start.y + 0.5 + Math.sin(time * 2.4) * 0.05 },
        0,
        palette,
        time,
        px,
      );
    }
  }

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    view: TraceView,
    marker: { point: Vec2; from?: Vec2; at: number } | null,
    color: string,
    px: number,
    cross: boolean,
  ): void {
    if (!marker) return;
    const age = view.index - marker.at;
    if (age > 40) return;
    const alpha = Math.max(0, 1 - age / 40);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * px;
    const { x, y } = marker.point;
    const r = 0.28;
    if (marker.from) {
      ctx.setLineDash([0.25, 0.2]);
      ctx.beginPath();
      ctx.moveTo(marker.from.x, marker.from.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    if (cross) {
      ctx.moveTo(x - r, y - r);
      ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r);
      ctx.lineTo(x - r, y + r);
    } else {
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private partialPolyline(pts: Vec2[], progress: number): Vec2[] {
    if (progress >= 1) return pts;
    const count = Math.max(2, Math.ceil(pts.length * progress));
    return pts.slice(0, count);
  }

  private strokePolyline(ctx: CanvasRenderingContext2D, pts: Vec2[]): void {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  private drawStartPad(
    ctx: CanvasRenderingContext2D,
    start: Cell,
    palette: CanvasPalette,
    px: number,
  ): void {
    const cx = start.x + 0.5;
    const cy = start.y + 0.5;
    ctx.strokeStyle = palette.robotBody;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.arc(cx, cy, 0.62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawFlag(
    ctx: CanvasRenderingContext2D,
    goal: Cell,
    palette: CanvasPalette,
    time: number,
  ): void {
    const bx = goal.x + 0.32;
    const by = goal.y + 0.88;
    ctx.save();
    // pole
    ctx.strokeStyle = palette.flagPole;
    ctx.lineWidth = 0.07;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - 0.78);
    ctx.stroke();
    // waving cloth
    const wave = Math.sin(time * 5) * 0.07;
    const wave2 = Math.sin(time * 5 + 1.2) * 0.06;
    ctx.fillStyle = palette.flag;
    ctx.beginPath();
    ctx.moveTo(bx, by - 0.78);
    ctx.quadraticCurveTo(bx + 0.28, by - 0.82 + wave, bx + 0.55, by - 0.72 + wave2);
    ctx.quadraticCurveTo(bx + 0.3, by - 0.6 + wave, bx, by - 0.5);
    ctx.closePath();
    ctx.fill();
    // base
    ctx.fillStyle = palette.flagPole;
    ctx.beginPath();
    ctx.ellipse(bx, by, 0.14, 0.05, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  private drawRobot(
    ctx: CanvasRenderingContext2D,
    p: Vec2,
    angle: number,
    palette: CanvasPalette,
    time: number,
    px: number,
  ): void {
    ctx.save();
    ctx.translate(p.x, p.y);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 0.34, 0.3, 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(angle);
    // body
    ctx.fillStyle = palette.robotBody;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 2 * px;
    ctx.beginPath();
    ctx.roundRect(-0.32, -0.26, 0.64, 0.52, 0.16);
    ctx.fill();
    ctx.stroke();
    // eyes (blink)
    const blink = Math.sin(time * 1.7) > 0.97 ? 0.02 : 0.075;
    ctx.fillStyle = palette.robotEye;
    ctx.beginPath();
    ctx.ellipse(0.12, -0.08, 0.075, blink, 0, 0, Math.PI * 2);
    ctx.ellipse(0.12, 0.08, 0.075, blink, 0, 0, Math.PI * 2);
    ctx.fill();
    // antenna
    ctx.strokeStyle = palette.robotBody;
    ctx.lineWidth = 0.05;
    ctx.beginPath();
    ctx.moveTo(-0.3, 0);
    ctx.lineTo(-0.44, 0);
    ctx.stroke();
    ctx.fillStyle = palette.flag;
    ctx.beginPath();
    ctx.arc(-0.47, 0, 0.055 + Math.sin(time * 6) * 0.012, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
