/**
 * Registry of live canvas elements per pane, used by the PNG exporter.
 * (A module-level object keeps the store free of DOM references.)
 */

import type { PaneId } from '@/types';

export const canvasRegistry: Record<PaneId, HTMLCanvasElement | null> = {
  A: null,
  B: null,
};
