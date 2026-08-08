/**
 * Planner Web Worker.
 *
 * Runs the requested algorithm to completion off the main thread,
 * measures wall-clock time, and computes the optimality reference
 * (Dijkstra shortest cost) before posting the finished trace back.
 */

import type { GridMap } from '@/types';
import { getPlanner, isSamplingPlanner } from '@/algorithms/registry';
import { optimalGridCost } from '@/algorithms/optimal';
import type { PlanRequest, PlanResponse } from './protocol';

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const req = e.data;
  try {
    const map: GridMap = {
      width: req.width,
      height: req.height,
      cells: new Uint8Array(req.cells),
      terrain: new Uint8Array(req.terrain),
    };

    const planner = getPlanner(req.algorithm);
    const t0 = performance.now();
    const result = planner.findPath({
      map,
      start: req.start,
      goal: req.goal,
      options: req.options,
    });
    result.stats.timeMs = performance.now() - t0;

    // Optimality reference: cost of the optimal grid path. Sampling
    // planners measure Euclidean cost, so diagonals give the fairest
    // grid reference for them.
    const allowDiagonal = isSamplingPlanner(req.algorithm)
      ? true
      : req.options.allowDiagonal;
    const optimal = optimalGridCost(map, req.start, req.goal, allowDiagonal);
    result.stats.optimalCost = optimal;
    // Sampling planners measure geometric cost and are terrain-blind, so
    // on weighted maps a cost ratio against the terrain-aware optimum
    // would be meaningless — leave optimality undefined there.
    const hasTerrain = map.terrain.some((t) => t !== 0);
    const terrainBlind = isSamplingPlanner(req.algorithm) && hasTerrain;
    if (
      !terrainBlind &&
      optimal !== null &&
      result.stats.pathCost !== null &&
      result.stats.pathCost > 0
    ) {
      result.stats.optimality = Math.min(1, optimal / result.stats.pathCost);
    }

    const response: PlanResponse = {
      id: req.id,
      ok: true,
      result: {
        algorithm: req.algorithm,
        events: req.lean ? [] : result.events,
        path: result.path,
        stats: result.stats,
      },
    };
    self.postMessage(response);
  } catch (err) {
    const response: PlanResponse = {
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
