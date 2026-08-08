/**
 * The Algorithm Inspector's explanation engine.
 *
 * Turns a raw {@link TraceEvent} into a human explanation of *why* the
 * algorithm made that decision, phrased per algorithm. Explanations are
 * generated on demand for the event under the playback cursor, so the
 * trace itself stays compact.
 */

import type { AlgorithmId } from '@/types';
import { ALGORITHM_META } from './metadata';
import type { TraceEvent } from './types';

export interface Explanation {
  /** Short label, e.g. "Expanding node". */
  title: string;
  /** Full prose explanation of the decision. */
  detail: string;
  /** Semantic tone for styling. */
  tone: 'neutral' | 'expand' | 'discover' | 'reject' | 'improve' | 'success' | 'failure';
}

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const cellStr = (c: { x: number; y: number }) => `(${Math.round(c.x)}, ${Math.round(c.y)})`;
const ptStr = (p: { x: number; y: number }) => `(${p.x.toFixed(1)}, ${p.y.toFixed(1)})`;

/** Explain a trace event in the voice of the given algorithm. */
export function explainEvent(algorithm: AlgorithmId, ev: TraceEvent): Explanation {
  const name = ALGORITHM_META[algorithm].shortName;

  switch (ev.type) {
    case 'current': {
      if (algorithm === 'dijkstra') {
        return {
          title: 'Expanding node',
          detail: `Dijkstra expanded ${cellStr(ev.node)} because it has the lowest cost-so-far g = ${f2(ev.g)} among the ${ev.openSize + 1} frontier nodes. With no heuristic, the frontier spreads as a uniform wavefront — direction to the goal is ignored entirely.`,
          tone: 'expand',
        };
      }
      if (algorithm === 'dstar') {
        const x = ev.extra ?? {};
        const consistency = String(x.consistency ?? '');
        const suffix =
          consistency === 'over-consistent'
            ? `It is over-consistent (g = ${x.gValue} > rhs = ${x.rhsValue}), so its cost-to-goal can safely be lowered to rhs and the vertex becomes consistent.`
            : `It is under-consistent (g = ${x.gValue} < rhs = ${x.rhsValue}) — its old estimate is too optimistic, so g is reset to ∞ and the neighborhood is repaired.`;
        return {
          title: 'Processing vertex',
          detail: `D* Lite popped ${cellStr(ev.node)} with key [${x.k1}, ${x.k2}] — the smallest key in the queue (key = min(g, rhs) + h-to-start, tie-broken by min(g, rhs)). ${suffix}`,
          tone: 'expand',
        };
      }
      // A* / Theta*
      return {
        title: 'Expanding node',
        detail: `${name} selected ${cellStr(ev.node)} because it had the lowest f = g + h = ${f2(ev.g)} + ${f2(ev.h)} = ${f2(ev.f)} among the ${ev.openSize + 1} open nodes. The heuristic estimates ${f2(ev.h)} remaining cost to the goal.`,
        tone: 'expand',
      };
    }

    case 'open': {
      if (ev.parent === null) {
        return {
          title: 'Search initialized',
          detail:
            algorithm === 'dstar'
              ? `D* Lite starts from the goal ${cellStr(ev.node)} with rhs = 0 and searches backwards toward the start.`
              : `${name} placed the start ${cellStr(ev.node)} on the open set with g = 0.`,
          tone: 'discover',
        };
      }
      if (ev.extra?.lineOfSight) {
        return {
          title: 'Any-angle shortcut',
          detail: `Theta* discovered ${cellStr(ev.node)} but wired it straight to ${String(ev.extra.shortcutFrom)} — the grandparent has line-of-sight, so the intermediate cell is skipped. Cost via the shortcut: g = ${f2(ev.g)}, f = ${f2(ev.f)}.`,
          tone: 'improve',
        };
      }
      return {
        title: 'Node discovered',
        detail: `${name} discovered ${cellStr(ev.node)} from ${cellStr(ev.parent)} and added it to the open set with g = ${f2(ev.g)}, h = ${f2(ev.h)}, f = ${f2(ev.f)}.`,
        tone: 'discover',
      };
    }

    case 'update': {
      if (ev.extra?.lineOfSight) {
        return {
          title: 'Any-angle shortcut',
          detail: `Theta* found a cheaper any-angle route to ${cellStr(ev.node)}: connecting it directly to ${String(ev.extra.shortcutFrom)} (line-of-sight is clear) lowers its cost to g = ${f2(ev.g)}.`,
          tone: 'improve',
        };
      }
      if (algorithm === 'dstar') {
        const x = ev.extra ?? {};
        return {
          title: 'Vertex re-queued',
          detail: `${cellStr(ev.node)} became inconsistent (g = ${x.gValue}, rhs = ${x.rhsValue}) and was re-inserted into the queue with key [${x.k1}, ${x.k2}].`,
          tone: 'improve',
        };
      }
      return {
        title: 'Cheaper route found',
        detail: `${name} found a cheaper route to ${cellStr(ev.node)} via ${cellStr(ev.parent)} and lowered its cost to g = ${f2(ev.g)} (f = ${f2(ev.f)}). Its position in the open set improves accordingly.`,
        tone: 'improve',
      };
    }

    case 'close':
      return {
        title: 'Node closed',
        detail:
          algorithm === 'dstar'
            ? `${cellStr(ev.node)} is now consistent (g = rhs): its cost-to-goal is settled unless the map changes.`
            : `${cellStr(ev.node)} moved to the closed set — the cheapest route to it is now known and it will never be revisited.`,
        tone: 'neutral',
      };

    case 'sample':
      return ev.goalBiased
        ? {
            title: 'Goal-biased sample',
            detail: `${name} sampled the goal itself this iteration (goal bias). Pulling the tree toward the goal occasionally is what turns pure exploration into goal-directed growth.`,
            tone: 'discover',
          }
        : {
            title: 'Random sample',
            detail: `${name} drew a uniform random sample at ${ptStr(ev.point)}. The nearest tree node will try to grow toward it — large empty regions attract more samples (Voronoi bias), which is why the tree expands rapidly into unexplored space.`,
            tone: 'discover',
          };

    case 'treeNode': {
      if (ev.parent < 0) {
        return {
          title: 'Tree rooted',
          detail: `The tree is rooted at the start ${ptStr(ev.point)}.`,
          tone: 'discover',
        };
      }
      return {
        title: 'Tree extended',
        detail: `${name} added node #${ev.index} at ${ptStr(ev.point)}, wired to node #${ev.parent}${algorithm === 'rrtstar' ? ' — the neighbor giving the cheapest collision-free cost from the start (choose-parent)' : ' — its nearest neighbor'}. Cost from start: ${f2(ev.cost)}.`,
        tone: 'expand',
      };
    }

    case 'reject': {
      const reasons: Record<string, string> = {
        collision: `extending the tree${ev.from ? ` from ${ptStr(ev.from)}` : ''} toward ${ptStr(ev.point)} would cross an obstacle, so the extension is discarded`,
        outOfBounds: `the sample at ${ptStr(ev.point)} lies outside the workspace`,
        duplicate: `the steered point coincides with an existing tree node — nothing new to add`,
      };
      return {
        title: 'Extension rejected',
        detail: `${name} rejected this sample: ${reasons[ev.reason]}.`,
        tone: 'reject',
      };
    }

    case 'rewire':
      return {
        title: 'Rewire',
        detail: `RRT* re-parented node #${ev.index} at ${ptStr(ev.point)} from #${ev.oldParent} to the new node #${ev.newParent}: routing through it is cheaper by ${f2(ev.saving)}. The saving propagates to every descendant — this is the mechanism that makes RRT* asymptotically optimal.`,
        tone: 'improve',
      };

    case 'goalReached':
      return {
        title: 'Goal connected',
        detail: `The goal is now reachable with cost ${f2(ev.cost)}.${algorithm === 'rrtstar' ? ' RRT* keeps sampling — later rewires may still shorten this path.' : ''}`,
        tone: 'success',
      };

    case 'path':
      return {
        title: 'Path found 🎉',
        detail: `${name} finished with a path of ${ev.points.length} waypoints and total cost ${f2(ev.cost)}.`,
        tone: 'success',
      };

    case 'noPath':
      return {
        title: 'No path',
        detail: ev.reason,
        tone: 'failure',
      };
  }
}
