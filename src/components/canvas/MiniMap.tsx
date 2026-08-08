/**
 * MiniMap — overview of the whole map with the current viewport rectangle.
 * Click or drag to recenter the shared camera.
 */

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { cellIndex } from '@/types';
import type { Camera } from '@/canvas/camera';

const WIDTH = 148;

export function MiniMap({ camera, viewportEl }: { camera: Camera; viewportEl: () => HTMLElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let mapKey = '';
    const base = document.createElement('canvas');

    const centerOn = (e: PointerEvent) => {
      const s = useAppStore.getState();
      const rect = canvas.getBoundingClientRect();
      const scale = rect.width / s.map.width;
      const wx = (e.clientX - rect.left) / scale;
      const wy = (e.clientY - rect.top) / scale;
      const host = viewportEl();
      if (!host) return;
      const hr = host.getBoundingClientRect();
      camera.x = hr.width / 2 - wx * camera.zoom;
      camera.y = hr.height / 2 - wy * camera.zoom;
    };

    let dragging = false;
    const down = (e: PointerEvent) => {
      dragging = true;
      canvas.setPointerCapture(e.pointerId);
      centerOn(e);
    };
    const move = (e: PointerEvent) => {
      if (dragging) centerOn(e);
    };
    const up = () => {
      dragging = false;
    };
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);

    const loop = () => {
      raf = requestAnimationFrame(loop);
      const s = useAppStore.getState();
      const { map } = s;
      const height = Math.round((WIDTH * map.height) / map.width);
      if (canvas.width !== WIDTH || canvas.height !== height) {
        canvas.width = WIDTH;
        canvas.height = height;
      }

      // Rebuild the obstacle backdrop only when the map changes.
      const minimal = s.uiTheme === 'minimal';
      const key = `${s.mapVersion}|${s.theme}|${s.uiTheme}|${map.width}x${map.height}`;
      if (key !== mapKey) {
        mapKey = key;
        base.width = map.width;
        base.height = map.height;
        const bctx = base.getContext('2d');
        if (bctx) {
          const img = bctx.createImageData(map.width, map.height);
          const dark = s.theme === 'dark';
          // Terrain tints (rough, sand, hazard) at low alpha.
          const terrainRgb: Array<[number, number, number] | null> = [
            null,
            [180, 120, 60],
            [217, 175, 80],
            [220, 60, 60],
          ];
          for (let i = 0; i < map.cells.length; i++) {
            const o = i * 4;
            if (map.cells[i] === 1) {
              img.data[o] = dark ? 100 : 71;
              img.data[o + 1] = dark ? 116 : 85;
              img.data[o + 2] = dark ? 139 : 105;
              img.data[o + 3] = 255;
            } else if (map.terrain[i] !== 0 && terrainRgb[map.terrain[i]]) {
              const [r, g, b] = terrainRgb[map.terrain[i]] as [number, number, number];
              img.data[o] = r;
              img.data[o + 1] = g;
              img.data[o + 2] = b;
              img.data[o + 3] = 110;
            } else {
              img.data[o + 3] = 0;
            }
          }
          bctx.putImageData(img, 0, 0);
        }
      }

      const dark = s.theme === 'dark' || minimal;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = minimal
        ? 'rgba(13, 15, 18, 0.9)'
        : dark
          ? 'rgba(11,16,32,0.85)'
          : 'rgba(248,250,252,0.85)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(base, 0, 0, canvas.width, canvas.height);

      const scale = canvas.width / map.width;

      // Final path (pane A).
      const path = s.runs.A?.path;
      if (path && path.length > 1) {
        ctx.strokeStyle = minimal ? '#00e5ff' : dark ? '#22d3ee' : '#0891b2';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(path[0].x * scale, path[0].y * scale);
        for (const p of path) ctx.lineTo(p.x * scale, p.y * scale);
        ctx.stroke();
      }

      // Start / goal dots.
      ctx.fillStyle = minimal ? '#00e5ff' : dark ? '#22d3ee' : '#0891b2';
      ctx.beginPath();
      ctx.arc((s.start.x + 0.5) * scale, (s.start.y + 0.5) * scale, 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = minimal ? '#00e5ff' : '#f472b6';
      ctx.beginPath();
      ctx.arc((s.goal.x + 0.5) * scale, (s.goal.y + 0.5) * scale, 2.4, 0, Math.PI * 2);
      ctx.fill();

      // Viewport rectangle.
      const host = viewportEl();
      if (host) {
        const hr = host.getBoundingClientRect();
        const x = (-camera.x / camera.zoom) * scale;
        const y = (-camera.y / camera.zoom) * scale;
        const w = (hr.width / camera.zoom) * scale;
        const h = (hr.height / camera.zoom) * scale;
        ctx.strokeStyle = minimal
          ? 'rgba(0,229,255,0.85)'
          : dark
            ? 'rgba(34,211,238,0.9)'
            : 'rgba(8,145,178,0.9)';
        ctx.lineWidth = 1.25;
        ctx.strokeRect(x, y, w, h);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
    };
  }, [camera, viewportEl]);

  return (
    <canvas
      ref={canvasRef}
      className="glass rounded-xl cursor-pointer"
      style={{ width: WIDTH }}
      aria-label="Mini-map overview"
    />
  );
}
