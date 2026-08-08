/**
 * Map persistence: save/load JSON and export the canvas as PNG.
 */

import type { Cell, GridMap } from '@/types';

/** Serialized map format (version-tagged for forward compatibility). */
export interface MapFile {
  format: 'scout-nav-map';
  version: 1 | 2;
  width: number;
  height: number;
  /** Indices of obstacle cells (row-major) — compact for sparse maps. */
  obstacles: number[];
  /** v2: [cellIndex, terrainId] pairs for non-clear terrain. */
  terrain?: Array<[number, number]>;
  start: Cell;
  goal: Cell;
}

/** Serialize the current world to a JSON string. */
export function serializeMap(map: GridMap, start: Cell, goal: Cell): string {
  const obstacles: number[] = [];
  for (let i = 0; i < map.cells.length; i++) {
    if (map.cells[i] === 1) obstacles.push(i);
  }
  const terrain: Array<[number, number]> = [];
  for (let i = 0; i < map.terrain.length; i++) {
    if (map.terrain[i] !== 0) terrain.push([i, map.terrain[i]]);
  }
  const file: MapFile = {
    format: 'scout-nav-map',
    version: 2,
    width: map.width,
    height: map.height,
    obstacles,
    terrain,
    start,
    goal,
  };
  return JSON.stringify(file);
}

/** Parse and validate a map JSON string. Throws on invalid input. */
export function deserializeMap(json: string): { map: GridMap; start: Cell; goal: Cell } {
  const raw: unknown = JSON.parse(json);
  const file = raw as Partial<MapFile>;
  if (
    !file ||
    file.format !== 'scout-nav-map' ||
    typeof file.width !== 'number' ||
    typeof file.height !== 'number' ||
    !Array.isArray(file.obstacles) ||
    !file.start ||
    !file.goal
  ) {
    throw new Error('Not a valid scout.nav map file.');
  }
  const width = Math.max(4, Math.min(400, Math.floor(file.width)));
  const height = Math.max(4, Math.min(400, Math.floor(file.height)));
  const cells = new Uint8Array(width * height);
  for (const i of file.obstacles) {
    if (typeof i === 'number' && i >= 0 && i < cells.length) cells[i] = 1;
  }
  const terrain = new Uint8Array(width * height);
  if (Array.isArray(file.terrain)) {
    for (const entry of file.terrain) {
      if (
        Array.isArray(entry) &&
        typeof entry[0] === 'number' &&
        typeof entry[1] === 'number' &&
        entry[0] >= 0 &&
        entry[0] < terrain.length
      ) {
        terrain[entry[0]] = Math.max(0, Math.min(3, Math.floor(entry[1])));
      }
    }
  }
  const clampCell = (c: Cell): Cell => ({
    x: Math.max(0, Math.min(width - 1, Math.floor(c.x))),
    y: Math.max(0, Math.min(height - 1, Math.floor(c.y))),
  });
  return {
    map: { width, height, cells, terrain },
    start: clampCell(file.start),
    goal: clampCell(file.goal),
  };
}

/** Trigger a browser download of a text file. */
export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export a canvas snapshot as a PNG download. */
export function exportCanvasPng(canvas: HTMLCanvasElement, filename: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/** Open a file picker and resolve with the chosen file's text. */
export function pickTextFile(accept = '.json'): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}
