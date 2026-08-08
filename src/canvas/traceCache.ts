/**
 * Per-pane TraceView cache.
 *
 * Lives outside React so the canvas render loop can sync a view to the
 * playback cursor without allocations or re-renders. Views are rebuilt
 * whenever a new run arrives for their pane.
 */

import type { PaneId } from '@/types';
import type { RunResult } from '@/algorithms/types';
import { TraceView } from './visState';

interface Entry {
  runId: number;
  run: RunResult;
  view: TraceView;
}

const cache = new Map<PaneId, Entry>();

/**
 * Get the TraceView for a pane, synced to `index` applied events.
 * Returns null when the pane has no run.
 */
export function syncTraceView(
  pane: PaneId,
  runId: number,
  run: RunResult | null,
  width: number,
  height: number,
  index: number,
): TraceView | null {
  if (!run) {
    cache.delete(pane);
    return null;
  }
  let entry = cache.get(pane);
  if (!entry || entry.runId !== runId || entry.run !== run) {
    entry = { runId, run, view: new TraceView(run, width, height) };
    cache.set(pane, entry);
  }
  entry.view.seek(index);
  return entry.view;
}
