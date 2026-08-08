/**
 * TraceView — replays a planner's trace events into a visualizable
 * snapshot at any playback position.
 *
 * Forward stepping is O(1) amortized (events are applied incrementally);
 * seeking backwards rebuilds from the start, which stays comfortably
 * under a millisecond for typical traces.
 */

import type { Cell, Vec2 } from '@/types';
import { cellIndex } from '@/types';
import type { RunResult, TraceEvent } from '@/algorithms/types';

export interface VisOpenNode {
  g: number;
  h: number;
  f: number;
}

export interface VisTreeNode {
  x: number;
  y: number;
  parent: number;
}

export interface TimedMarker {
  point: Vec2;
  from?: Vec2;
  /** Event index at which the marker appeared (drives fade-out). */
  at: number;
  goalBiased?: boolean;
}

export class TraceView {
  readonly events: TraceEvent[];
  readonly width: number;
  readonly height: number;

  /** Number of events currently applied. */
  index = 0;

  open = new Map<number, VisOpenNode>();
  closed = new Set<number>();
  current: Cell | null = null;
  /** Event under the cursor (the most recently applied one). */
  lastEvent: TraceEvent | null = null;

  /** Per-cell touch count — the "visited frequency" heat source. */
  visits: Uint16Array;
  /** First-touch ordinal per cell (-1 = untouched) — "exploration order". */
  order: Int32Array;
  touchCounter = 0;
  maxVisits = 1;

  /** Sampling-tree nodes (RRT family). */
  tree: VisTreeNode[] = [];
  lastSample: TimedMarker | null = null;
  lastReject: TimedMarker | null = null;
  lastRewire: { point: Vec2; at: number } | null = null;

  path: Vec2[] | null = null;
  pathCost: number | null = null;
  goalReachedAt: number | null = null;
  noPath = false;

  constructor(run: RunResult, width: number, height: number) {
    this.events = run.events;
    this.width = width;
    this.height = height;
    this.visits = new Uint16Array(width * height);
    this.order = new Int32Array(width * height).fill(-1);
  }

  /** Move the cursor to `target` applied events (clamped). */
  seek(target: number): void {
    const t = Math.max(0, Math.min(this.events.length, Math.floor(target)));
    if (t < this.index) this.reset();
    while (this.index < t) {
      this.apply(this.events[this.index]);
      this.index++;
      this.lastEvent = this.events[this.index - 1];
    }
    if (this.index === 0) this.lastEvent = null;
  }

  private reset(): void {
    this.index = 0;
    this.open.clear();
    this.closed.clear();
    this.current = null;
    this.lastEvent = null;
    this.visits.fill(0);
    this.order.fill(-1);
    this.touchCounter = 0;
    this.maxVisits = 1;
    this.tree = [];
    this.lastSample = null;
    this.lastReject = null;
    this.lastRewire = null;
    this.path = null;
    this.pathCost = null;
    this.goalReachedAt = null;
    this.noPath = false;
  }

  private touch(x: number, y: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = cellIndex(x, y, this.width);
    if (this.visits[i] < 0xffff) this.visits[i]++;
    if (this.visits[i] > this.maxVisits) this.maxVisits = this.visits[i];
    if (this.order[i] < 0) this.order[i] = this.touchCounter++;
  }

  private apply(ev: TraceEvent): void {
    switch (ev.type) {
      case 'open':
      case 'update': {
        const i = cellIndex(ev.node.x, ev.node.y, this.width);
        this.open.set(i, { g: ev.g, h: ev.h, f: ev.f });
        this.touch(ev.node.x, ev.node.y);
        break;
      }
      case 'current': {
        const i = cellIndex(ev.node.x, ev.node.y, this.width);
        this.open.delete(i);
        this.current = ev.node;
        this.touch(ev.node.x, ev.node.y);
        break;
      }
      case 'close': {
        const i = cellIndex(ev.node.x, ev.node.y, this.width);
        this.open.delete(i);
        this.closed.add(i);
        break;
      }
      case 'sample':
        this.lastSample = { point: ev.point, at: this.index, goalBiased: ev.goalBiased };
        break;
      case 'treeNode':
        this.tree[ev.index] = { x: ev.point.x, y: ev.point.y, parent: ev.parent };
        this.touch(Math.floor(ev.point.x), Math.floor(ev.point.y));
        break;
      case 'reject':
        this.lastReject = { point: ev.point, from: ev.from, at: this.index };
        break;
      case 'rewire': {
        const node = this.tree[ev.index];
        if (node) node.parent = ev.newParent;
        this.lastRewire = { point: ev.point, at: this.index };
        break;
      }
      case 'goalReached':
        this.goalReachedAt = this.index;
        break;
      case 'path':
        this.path = ev.points;
        this.pathCost = ev.cost;
        break;
      case 'noPath':
        this.noPath = true;
        break;
    }
  }
}
