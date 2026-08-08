/**
 * MapCanvas — one interactive planning viewport.
 *
 * Owns a requestAnimationFrame loop that reads the store imperatively
 * (zero React re-renders at 60 fps), a SceneRenderer instance, and all
 * pointer interactions: draw / erase / move obstacles, drag start & goal,
 * pan and zoom. In compare mode two instances share one Camera so their
 * viewports stay in lockstep.
 */

import { useEffect, useRef } from 'react';
import type { Cell, PaneId } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { DARK_PALETTE, LIGHT_PALETTE, MINIMAL_PALETTE } from '@/utils/colors';
import { fireConfetti } from '@/utils/confetti';
import { obstacleBlob } from '@/utils/maze';
import { pathLength } from '@/utils/geometry';
import { fitToMap, screenToWorld, worldToScreen, zoomAt, type Camera } from '@/canvas/camera';
import { SceneRenderer, type PaintRipple } from '@/canvas/renderer';
import { syncTraceView } from '@/canvas/traceCache';
import { canvasRegistry } from '@/canvas/registry';

interface MapCanvasProps {
  pane: PaneId;
  camera: Camera;
  /** Only one pane should own camera auto-fitting. */
  primary?: boolean;
}

type DragMode =
  | 'none'
  | 'paint'
  | 'erase'
  | 'pan'
  | 'dragStart'
  | 'dragGoal'
  | 'moveBlob';

interface DragState {
  mode: DragMode;
  lastCell: Cell | null;
  lastClientX: number;
  lastClientY: number;
  blob: Set<number> | null;
}

export function MapCanvas({ pane, camera, primary = false }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiRef = useRef<HTMLCanvasElement>(null);
  const tool = useAppStore((s) => s.tool);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    const confettiCanvas = confettiRef.current;
    if (!container || !canvas || !confettiCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvasRegistry[pane] = canvas;
    const renderer = new SceneRenderer();
    const ripples: PaintRipple[] = [];
    const drag: DragState = {
      mode: 'none',
      lastCell: null,
      lastClientX: 0,
      lastClientY: 0,
      blob: null,
    };

    // Path-reveal / robot-travel animation state, keyed per run.
    let animKey = '';
    let revealStart: number | null = null;
    let confettiFiredFor = '';
    let fittedFor = '';
    const startTime = performance.now();

    const cellFromEvent = (e: PointerEvent): Cell => {
      const rect = canvas.getBoundingClientRect();
      const w = screenToWorld(camera, e.clientX - rect.left, e.clientY - rect.top);
      return { x: Math.floor(w.x), y: Math.floor(w.y) };
    };

    const addRipple = (c: Cell, value: 0 | 1) => {
      ripples.push({ x: c.x, y: c.y, at: (performance.now() - startTime) / 1000, value });
      if (ripples.length > 240) ripples.splice(0, ripples.length - 240);
    };

    const paintAt = (c: Cell, value: 0 | 1) => {
      const s = useAppStore.getState();
      if (drag.lastCell) s.paintLine(drag.lastCell, c, value);
      else s.paintCell(c.x, c.y, value);
      if (!drag.lastCell || drag.lastCell.x !== c.x || drag.lastCell.y !== c.y) {
        addRipple(c, value);
      }
      drag.lastCell = c;
    };

    // ------------------------------------------------------- pointer input
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.button !== 1 && e.button !== 2) return;
      canvas.setPointerCapture(e.pointerId);
      const s = useAppStore.getState();
      const cell = cellFromEvent(e);
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      drag.lastCell = null;

      if (e.button === 1) {
        drag.mode = 'pan';
        return;
      }

      // Dragging endpoints always wins (snap-to-grid handles).
      const near = (c: Cell) =>
        Math.abs(cell.x - c.x) <= 0 && Math.abs(cell.y - c.y) <= 0;
      if (near(s.start) && e.button === 0) {
        drag.mode = 'dragStart';
        return;
      }
      if (near(s.goal) && e.button === 0) {
        drag.mode = 'dragGoal';
        return;
      }

      const erase = e.button === 2;
      switch (s.tool) {
        case 'draw':
          drag.mode = erase ? 'erase' : 'paint';
          paintAt(cell, erase ? 0 : 1);
          break;
        case 'erase':
          drag.mode = erase ? 'paint' : 'erase';
          paintAt(cell, erase ? 1 : 0);
          break;
        case 'move': {
          const blob = obstacleBlob(s.map, cell.x, cell.y);
          if (blob.size > 0) {
            drag.mode = 'moveBlob';
            drag.blob = blob;
            drag.lastCell = cell;
          } else {
            drag.mode = 'pan';
          }
          break;
        }
        case 'start':
          drag.mode = 'dragStart';
          s.setStart(cell);
          break;
        case 'goal':
          drag.mode = 'dragGoal';
          s.setGoal(cell);
          break;
        case 'pan':
          drag.mode = 'pan';
          break;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (drag.mode === 'none') return;
      const s = useAppStore.getState();
      const cell = cellFromEvent(e);
      switch (drag.mode) {
        case 'paint':
          paintAt(cell, 1);
          break;
        case 'erase':
          paintAt(cell, 0);
          break;
        case 'pan':
          camera.x += e.clientX - drag.lastClientX;
          camera.y += e.clientY - drag.lastClientY;
          break;
        case 'dragStart':
          s.setStart(cell);
          break;
        case 'dragGoal':
          s.setGoal(cell);
          break;
        case 'moveBlob': {
          if (!drag.blob || !drag.lastCell) break;
          const dx = cell.x - drag.lastCell.x;
          const dy = cell.y - drag.lastCell.y;
          if (dx !== 0 || dy !== 0) {
            const moved = s.translateBlob(drag.blob, dx, dy);
            if (moved) {
              drag.blob = moved;
              drag.lastCell = cell;
            }
          }
          break;
        }
      }
      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
    };

    const endDrag = () => {
      drag.mode = 'none';
      drag.blob = null;
      drag.lastCell = null;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      zoomAt(
        camera,
        e.clientX - rect.left,
        e.clientY - rect.top,
        Math.exp(-e.deltaY * 0.0016),
      );
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // ---------------------------------------------------------- rAF render
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = useAppStore.getState();
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = Math.max(1, Math.round(rect.width));
      const cssH = Math.max(1, Math.round(rect.height));
      if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        confettiCanvas.width = cssW * dpr;
        confettiCanvas.height = cssH * dpr;
        confettiCanvas.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      // Auto-fit the shared camera once per map size (primary pane only).
      const fitKey = `${s.map.width}x${s.map.height}`;
      if (primary && fitKey !== fittedFor && cssW > 40) {
        fitToMap(camera, s.map.width, s.map.height, cssW, cssH);
        fittedFor = fitKey;
      }

      const run = pane === 'B' ? s.runs.B : s.runs.A;
      const view = syncTraceView(
        pane,
        s.runId,
        run,
        s.map.width,
        s.map.height,
        s.playbackIndex,
      );

      // Path reveal + robot travel timing.
      const key = `${s.runId}|${pane}|${view?.path ? 'p' : '-'}`;
      let pathProgress = 0;
      let robotT: number | null = null;
      if (view?.path) {
        if (key !== animKey) {
          animKey = key;
          revealStart = now;
        }
        const elapsed = revealStart === null ? 1 : (now - revealStart) / 900;
        pathProgress = Math.min(1, elapsed);
        if (pathProgress >= 1) {
          const len = pathLength(view.path);
          const travelMs = Math.min(9000, Math.max(2200, len * 140));
          robotT = (((now - (revealStart ?? now)) - 900) % travelMs) / travelMs;
        }
        // Confetti the moment the path connects.
        if (confettiFiredFor !== key) {
          confettiFiredFor = key;
          const gp = worldToScreen(camera, s.goal.x + 0.5, s.goal.y + 0.5);
          fireConfetti(confettiCanvas, gp.x, gp.y);
        }
      } else {
        animKey = key;
        revealStart = null;
      }

      renderer.render({
        ctx,
        cssWidth: cssW,
        cssHeight: cssH,
        dpr,
        camera,
        map: s.map,
        mapVersion: s.mapVersion,
        start: s.start,
        goal: s.goal,
        view,
        palette:
          s.uiTheme === 'minimal'
            ? MINIMAL_PALETTE
            : s.theme === 'dark'
              ? DARK_PALETTE
              : LIGHT_PALETTE,
        theme: s.uiTheme === 'minimal' ? 'minimal' : s.theme,
        showGrid: s.showGrid,
        heatmap: s.heatmap,
        smoothPath: s.smoothPath,
        time: (now - startTime) / 1000,
        pathProgress,
        robotT,
        ripples,
      });
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvasRegistry[pane] = null;
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
    };
  }, [pane, camera, primary]);

  const cursor =
    tool === 'pan' || tool === 'move'
      ? 'cursor-grab-tool'
      : 'cursor-crosshair';

  return (
    <div ref={containerRef} className="relative size-full overflow-hidden">
      <canvas ref={canvasRef} className={`absolute inset-0 size-full touch-none ${cursor}`} />
      <canvas ref={confettiRef} className="pointer-events-none absolute inset-0 size-full" />
    </div>
  );
}
