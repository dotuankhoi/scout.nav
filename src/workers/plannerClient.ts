/**
 * Typed client for the planner Web Worker.
 *
 * One shared worker instance handles all panes; requests are matched to
 * promises by id, so concurrent A/B comparison runs simply queue up.
 */

import type { AlgorithmId, Cell, GridMap } from '@/types';
import type { PlannerOptions, RunResult } from '@/algorithms/types';
import type { PlanRequest, PlanResponse } from './protocol';

type Pending = {
  resolve: (r: RunResult) => void;
  reject: (e: Error) => void;
};

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./planner.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (e: MessageEvent<PlanResponse>) => {
      const res = e.data;
      const p = pending.get(res.id);
      if (!p) return;
      pending.delete(res.id);
      if (res.ok) p.resolve(res.result);
      else p.reject(new Error(res.error));
    };
    worker.onerror = (e) => {
      const error = new Error(e.message || 'Planner worker crashed');
      for (const p of pending.values()) p.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
    };
  }
  return worker;
}

/** Run a planner off the main thread. The map is copied, never shared. */
export function planInWorker(
  algorithm: AlgorithmId,
  map: GridMap,
  start: Cell,
  goal: Cell,
  options: PlannerOptions,
  lean = false,
): Promise<RunResult> {
  const id = nextId++;
  const cells = map.cells.slice().buffer;
  const terrain = map.terrain.slice().buffer;
  const req: PlanRequest = {
    id,
    algorithm,
    width: map.width,
    height: map.height,
    cells,
    terrain,
    start: { ...start },
    goal: { ...goal },
    options: JSON.parse(JSON.stringify(options)) as PlannerOptions,
    lean,
  };
  return new Promise<RunResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage(req, [cells, terrain]);
  });
}
