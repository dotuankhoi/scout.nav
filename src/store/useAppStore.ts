/**
 * Global application store (Zustand).
 *
 * Holds the world model (grid + endpoints), editing state, planner
 * configuration, completed run traces and playback state. Algorithms
 * never touch this store — they run in a Web Worker and communicate
 * through {@link planInWorker}.
 */

import { create } from 'zustand';
import type {
  AlgorithmId,
  Cell,
  GridMap,
  HeatmapMode,
  PaneId,
  ToolId,
} from '@/types';
import { cellIndex } from '@/types';
import type { PlannerOptions, RunResult } from '@/algorithms/types';
import { planInWorker } from '@/workers/plannerClient';
import { generateMaze, randomObstacles } from '@/utils/maze';
import { deserializeMap, serializeMap } from '@/utils/mapio';
import { randomSeed } from '@/utils/rng';
import { generateScenario, SCENARIOS, type ScenarioId } from '@/utils/scenarios';

/** Available playback speed multipliers. */
export const SPEED_OPTIONS = [0.25, 0.5, 1, 2, 5] as const;

/** Baseline playback rate at 1× speed, in trace events per second. */
export const BASE_EVENTS_PER_SECOND = 120;

/** Deterministic seed for the first-load world (a nice-looking warehouse). */
const FIRST_LOAD_SEED = 1337;

export type Theme = 'dark' | 'light';
/**
 * Which design profile is active. `classic` is the original glassmorphism
 * UI; `minimal` is the Monkeytype-inspired profile in themes/minimal.css.
 * Swapping the flag restamps <html> classes — instant, lossless revert.
 */
export type UiTheme = 'classic' | 'minimal';
export type PanelTab = 'coach' | 'inspector' | 'stats' | 'learn';

interface AppState {
  // --- World -------------------------------------------------------------
  map: GridMap;
  /** Bumped on every map mutation; cheap dirty-flag for canvas layers. */
  mapVersion: number;
  start: Cell;
  goal: Cell;

  /** Which engineering scenario generated the current world. */
  scenarioId: ScenarioId;

  // --- Editing -----------------------------------------------------------
  tool: ToolId;

  // --- Planning ----------------------------------------------------------
  algorithmA: AlgorithmId;
  algorithmB: AlgorithmId;
  compareMode: boolean;
  options: PlannerOptions;
  runs: Record<PaneId, RunResult | null>;
  running: boolean;
  runId: number;
  runError: string | null;

  // --- Playback ----------------------------------------------------------
  playing: boolean;
  speed: number;
  /** Fractional event cursor; floor(playbackIndex) events are applied. */
  playbackIndex: number;

  // --- UI ----------------------------------------------------------------
  theme: Theme;
  uiTheme: UiTheme;
  showGrid: boolean;
  showMinimap: boolean;
  smoothPath: boolean;
  liveReplan: boolean;
  heatmap: HeatmapMode;
  panelTab: PanelTab;
  helpOpen: boolean;

  // --- Actions -----------------------------------------------------------
  setTool: (tool: ToolId) => void;
  paintCell: (x: number, y: number, value: 0 | 1) => void;
  paintLine: (from: Cell, to: Cell, value: 0 | 1) => void;
  /** Translate an obstacle blob; returns the moved cell set or null on collision. */
  translateBlob: (blob: Set<number>, dx: number, dy: number) => Set<number> | null;
  setStart: (c: Cell) => void;
  setGoal: (c: Cell) => void;
  resizeMap: (width: number, height: number) => void;
  clearObstacles: () => void;
  randomizeMap: (density: number) => void;
  mazeMap: () => void;
  saveMapJson: () => string;
  loadMapJson: (json: string) => void;
  /** Generate a fresh world for a scenario and adopt its suggested setup. */
  applyScenario: (id: ScenarioId) => void;

  setAlgorithm: (pane: PaneId, id: AlgorithmId) => void;
  setCompareMode: (on: boolean) => void;
  setOptions: (patch: Partial<PlannerOptions>) => void;
  setRrtOption: <K extends keyof PlannerOptions['rrt']>(
    key: K,
    value: PlannerOptions['rrt'][K],
  ) => void;
  run: () => Promise<void>;

  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  restart: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  setSpeed: (s: number) => void;
  setPlaybackIndex: (i: number) => void;
  /** Advance the cursor by `events` (called from the playback rAF loop). */
  advancePlayback: (events: number) => void;
  /** Largest event count across active panes. */
  maxEventCount: () => number;

  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  setUiTheme: (t: UiTheme) => void;
  toggleUiTheme: () => void;
  setShowGrid: (v: boolean) => void;
  setShowMinimap: (v: boolean) => void;
  setSmoothPath: (v: boolean) => void;
  setLiveReplan: (v: boolean) => void;
  setHeatmap: (m: HeatmapMode) => void;
  cycleHeatmap: () => void;
  setPanelTab: (t: PanelTab) => void;
  setHelpOpen: (v: boolean) => void;
}

function defaultOptions(): PlannerOptions {
  return {
    allowDiagonal: true,
    heuristic: 'octile',
    heuristicWeight: 1,
    rrt: {
      maxIterations: 2500,
      stepSize: 2,
      goalBias: 0.08,
      goalRadius: 2,
      rewireRadius: 4,
      seed: randomSeed(),
    },
  };
}

function initialWorld(): { map: GridMap; start: Cell; goal: Cell } {
  const world = generateScenario('warehouse', FIRST_LOAD_SEED);
  return {
    map: {
      width: world.width,
      height: world.height,
      cells: world.cells,
      terrain: world.terrain,
    },
    start: world.start,
    goal: world.goal,
  };
}

function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem('scout-nav-theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* SSR / privacy mode */
  }
  return 'dark';
}

function loadUiTheme(): UiTheme {
  try {
    const saved = localStorage.getItem('scout-nav-ui-theme');
    if (saved === 'classic' || saved === 'minimal') return saved;
  } catch {
    /* ignore */
  }
  // The minimal profile is the default design; classic remains one
  // click away behind the paintbrush toggle (and persists once chosen).
  return 'minimal';
}

/**
 * Stamp both theme axes on <html>: the design profile (theme-classic /
 * theme-minimal) and the classic light/dark mode. The minimal profile is
 * inherently dark, so it forces the `dark` class for any dark: variants.
 */
function applyThemeToDom(theme: Theme, uiTheme: UiTheme): void {
  const root = document.documentElement;
  root.classList.toggle('theme-classic', uiTheme === 'classic');
  root.classList.toggle('theme-minimal', uiTheme === 'minimal');
  root.classList.toggle('dark', uiTheme === 'minimal' || theme === 'dark');
  try {
    localStorage.setItem('scout-nav-theme', theme);
    localStorage.setItem('scout-nav-ui-theme', uiTheme);
  } catch {
    /* ignore */
  }
}

/** Debounced auto-replan after edits when live replanning is enabled. */
let replanTimer: ReturnType<typeof setTimeout> | null = null;

export const useAppStore = create<AppState>()((set, get) => {
  const world = initialWorld();
  const theme = loadTheme();
  const uiTheme = loadUiTheme();
  if (typeof document !== 'undefined') applyThemeToDom(theme, uiTheme);

  /** Invalidate traces after an edit and optionally schedule a replan. */
  const afterEdit = () => {
    const s = get();
    const hadRuns = s.runs.A !== null || s.runs.B !== null;
    if (s.liveReplan && hadRuns) {
      if (replanTimer) clearTimeout(replanTimer);
      replanTimer = setTimeout(() => {
        void get().run();
      }, 250);
    }
  };

  return {
    map: world.map,
    mapVersion: 0,
    start: world.start,
    goal: world.goal,
    scenarioId: 'warehouse',

    tool: 'draw',

    algorithmA: 'astar',
    algorithmB: 'rrtstar',
    compareMode: false,
    options: defaultOptions(),
    runs: { A: null, B: null },
    running: false,
    runId: 0,
    runError: null,

    playing: false,
    speed: 1,
    playbackIndex: 0,

    theme,
    uiTheme,
    showGrid: true,
    showMinimap: true,
    smoothPath: false,
    liveReplan: true,
    heatmap: 'none',
    panelTab: 'coach',
    helpOpen: false,

    setTool: (tool) => set({ tool }),

    paintCell: (x, y, value) => {
      const { map, start, goal } = get();
      if (x < 0 || y < 0 || x >= map.width || y >= map.height) return;
      if ((x === start.x && y === start.y) || (x === goal.x && y === goal.y)) return;
      const i = cellIndex(x, y, map.width);
      if (map.cells[i] === value) return;
      map.cells[i] = value;
      set((s) => ({ mapVersion: s.mapVersion + 1 }));
      afterEdit();
    },

    paintLine: (from, to, value) => {
      // Bresenham so fast pointer strokes leave no gaps.
      const { map, start, goal } = get();
      let x0 = from.x;
      let y0 = from.y;
      const dx = Math.abs(to.x - x0);
      const dy = Math.abs(to.y - y0);
      const sx = x0 < to.x ? 1 : -1;
      const sy = y0 < to.y ? 1 : -1;
      let err = dx - dy;
      let changed = false;
      for (;;) {
        if (
          x0 >= 0 &&
          y0 >= 0 &&
          x0 < map.width &&
          y0 < map.height &&
          !(x0 === start.x && y0 === start.y) &&
          !(x0 === goal.x && y0 === goal.y)
        ) {
          const i = cellIndex(x0, y0, map.width);
          if (map.cells[i] !== value) {
            map.cells[i] = value;
            changed = true;
          }
        }
        if (x0 === to.x && y0 === to.y) break;
        const e2 = 2 * err;
        if (e2 > -dy) {
          err -= dy;
          x0 += sx;
        }
        if (e2 < dx) {
          err += dx;
          y0 += sy;
        }
      }
      if (changed) {
        set((s) => ({ mapVersion: s.mapVersion + 1 }));
        afterEdit();
      }
    },

    translateBlob: (blob, dx, dy) => {
      if (dx === 0 && dy === 0) return blob;
      const { map, start, goal } = get();
      const targets: number[] = [];
      for (const i of blob) {
        const x = (i % map.width) + dx;
        const y = Math.floor(i / map.width) + dy;
        if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
        if ((x === start.x && y === start.y) || (x === goal.x && y === goal.y)) return null;
        const ti = cellIndex(x, y, map.width);
        if (map.cells[ti] === 1 && !blob.has(ti)) return null; // merge collision
        targets.push(ti);
      }
      for (const i of blob) map.cells[i] = 0;
      const moved = new Set<number>();
      for (const t of targets) {
        map.cells[t] = 1;
        moved.add(t);
      }
      set((s) => ({ mapVersion: s.mapVersion + 1 }));
      afterEdit();
      return moved;
    },

    setStart: (c) => {
      const { map, goal } = get();
      const x = Math.max(0, Math.min(map.width - 1, Math.round(c.x)));
      const y = Math.max(0, Math.min(map.height - 1, Math.round(c.y)));
      if (x === goal.x && y === goal.y) return;
      if (map.cells[cellIndex(x, y, map.width)] === 1) return;
      const s = get().start;
      if (s.x === x && s.y === y) return;
      set({ start: { x, y } });
      afterEdit();
    },

    setGoal: (c) => {
      const { map, start } = get();
      const x = Math.max(0, Math.min(map.width - 1, Math.round(c.x)));
      const y = Math.max(0, Math.min(map.height - 1, Math.round(c.y)));
      if (x === start.x && y === start.y) return;
      if (map.cells[cellIndex(x, y, map.width)] === 1) return;
      const g = get().goal;
      if (g.x === x && g.y === y) return;
      set({ goal: { x, y } });
      afterEdit();
    },

    resizeMap: (width, height) => {
      const w = Math.max(8, Math.min(200, Math.floor(width)));
      const h = Math.max(8, Math.min(200, Math.floor(height)));
      const { map } = get();
      if (w === map.width && h === map.height) return;
      const cells = new Uint8Array(w * h);
      const terrain = new Uint8Array(w * h);
      for (let y = 0; y < Math.min(h, map.height); y++) {
        for (let x = 0; x < Math.min(w, map.width); x++) {
          cells[cellIndex(x, y, w)] = map.cells[cellIndex(x, y, map.width)];
          terrain[cellIndex(x, y, w)] = map.terrain[cellIndex(x, y, map.width)];
        }
      }
      const clamp = (c: Cell): Cell => ({
        x: Math.min(w - 1, c.x),
        y: Math.min(h - 1, c.y),
      });
      const start = clamp(get().start);
      const goal = clamp(get().goal);
      cells[cellIndex(start.x, start.y, w)] = 0;
      cells[cellIndex(goal.x, goal.y, w)] = 0;
      set((s) => ({
        map: { width: w, height: h, cells, terrain },
        start,
        goal,
        mapVersion: s.mapVersion + 1,
        runs: { A: null, B: null },
        playbackIndex: 0,
        playing: false,
      }));
    },

    clearObstacles: () => {
      const { map } = get();
      map.cells.fill(0);
      map.terrain.fill(0);
      set((s) => ({ mapVersion: s.mapVersion + 1 }));
      afterEdit();
    },

    randomizeMap: (density) => {
      const { map, start, goal } = get();
      const cells = randomObstacles(map.width, map.height, density, start, goal);
      set((s) => ({
        map: { ...map, cells, terrain: new Uint8Array(map.width * map.height) },
        mapVersion: s.mapVersion + 1,
      }));
      afterEdit();
    },

    mazeMap: () => {
      const { map, start, goal } = get();
      const cells = generateMaze(map.width, map.height, start, goal);
      set((s) => ({
        map: { ...map, cells, terrain: new Uint8Array(map.width * map.height) },
        mapVersion: s.mapVersion + 1,
      }));
      afterEdit();
    },

    saveMapJson: () => {
      const { map, start, goal } = get();
      return serializeMap(map, start, goal);
    },

    loadMapJson: (json) => {
      const { map, start, goal } = deserializeMap(json);
      set((s) => ({
        map,
        start,
        goal,
        mapVersion: s.mapVersion + 1,
        runs: { A: null, B: null },
        playbackIndex: 0,
        playing: false,
      }));
    },

    applyScenario: (id) => {
      const scenario = SCENARIOS[id];
      const world = generateScenario(id);
      set((s) => ({
        map: {
          width: world.width,
          height: world.height,
          cells: world.cells,
          terrain: world.terrain,
        },
        start: world.start,
        goal: world.goal,
        scenarioId: id,
        algorithmA: scenario.suggestedA,
        algorithmB: scenario.suggestedB,
        compareMode: scenario.suggestCompare,
        mapVersion: s.mapVersion + 1,
        runs: { A: null, B: null },
        playbackIndex: 0,
        playing: false,
      }));
    },

    setAlgorithm: (pane, id) => {
      set(pane === 'A' ? { algorithmA: id } : { algorithmB: id });
      afterEdit();
    },

    setCompareMode: (on) =>
      set({ compareMode: on, runs: { A: null, B: null }, playbackIndex: 0, playing: false }),

    setOptions: (patch) => {
      set((s) => ({ options: { ...s.options, ...patch } }));
      afterEdit();
    },

    setRrtOption: (key, value) => {
      set((s) => ({
        options: { ...s.options, rrt: { ...s.options.rrt, [key]: value } },
      }));
      afterEdit();
    },

    run: async () => {
      const { map, start, goal, algorithmA, algorithmB, compareMode, options } = get();
      const runId = get().runId + 1;
      set({
        runId,
        running: true,
        runError: null,
        playing: false,
        playbackIndex: 0,
        runs: { A: null, B: null },
      });
      // Fresh seed per run, but identical for both panes so comparisons
      // of two sampling planners share the same random sequence.
      const opts: PlannerOptions = {
        ...options,
        rrt: { ...options.rrt, seed: randomSeed() },
      };
      try {
        const jobs: Array<Promise<RunResult>> = [
          planInWorker(algorithmA, map, start, goal, opts),
        ];
        if (compareMode) {
          jobs.push(planInWorker(algorithmB, map, start, goal, opts));
        }
        const results = await Promise.all(jobs);
        if (get().runId !== runId) return; // superseded by a newer run
        set({
          runs: { A: results[0], B: results[1] ?? null },
          running: false,
          playing: true,
          playbackIndex: 0,
        });
      } catch (err) {
        if (get().runId !== runId) return;
        set({
          running: false,
          runError: err instanceof Error ? err.message : String(err),
        });
      }
    },

    play: () => {
      const s = get();
      if (s.maxEventCount() === 0) return;
      // Replay from the top when the cursor sits at the end.
      if (s.playbackIndex >= s.maxEventCount()) set({ playbackIndex: 0 });
      set({ playing: true });
    },
    pause: () => set({ playing: false }),
    togglePlay: () => {
      const s = get();
      if (s.playing) s.pause();
      else s.play();
    },
    restart: () => {
      if (get().maxEventCount() === 0) return;
      set({ playbackIndex: 0, playing: true });
    },
    stepForward: () => {
      const s = get();
      const max = s.maxEventCount();
      set({
        playing: false,
        playbackIndex: Math.min(max, Math.floor(s.playbackIndex) + 1),
      });
    },
    stepBackward: () => {
      const s = get();
      set({
        playing: false,
        playbackIndex: Math.max(0, Math.ceil(s.playbackIndex) - 1),
      });
    },
    setSpeed: (speed) => set({ speed }),
    setPlaybackIndex: (i) => {
      const max = get().maxEventCount();
      set({ playbackIndex: Math.max(0, Math.min(max, i)), playing: false });
    },
    advancePlayback: (events) => {
      const s = get();
      const max = s.maxEventCount();
      const next = s.playbackIndex + events;
      if (next >= max) {
        set({ playbackIndex: max, playing: false });
      } else {
        set({ playbackIndex: next });
      }
    },
    maxEventCount: () => {
      const { runs, compareMode } = get();
      return Math.max(
        runs.A?.events.length ?? 0,
        compareMode ? runs.B?.events.length ?? 0 : 0,
      );
    },

    setTheme: (t) => {
      applyThemeToDom(t, get().uiTheme);
      set({ theme: t });
    },
    toggleTheme: () => {
      const next: Theme = get().theme === 'dark' ? 'light' : 'dark';
      applyThemeToDom(next, get().uiTheme);
      set({ theme: next });
    },
    setUiTheme: (t) => {
      applyThemeToDom(get().theme, t);
      set({ uiTheme: t });
    },
    toggleUiTheme: () => {
      const next: UiTheme = get().uiTheme === 'classic' ? 'minimal' : 'classic';
      applyThemeToDom(get().theme, next);
      set({ uiTheme: next });
    },
    setShowGrid: (v) => set({ showGrid: v }),
    setShowMinimap: (v) => set({ showMinimap: v }),
    setSmoothPath: (v) => set({ smoothPath: v }),
    setLiveReplan: (v) => set({ liveReplan: v }),
    setHeatmap: (m) => set({ heatmap: m }),
    cycleHeatmap: () => {
      const order: HeatmapMode[] = ['none', 'frequency', 'density', 'order'];
      const cur = get().heatmap;
      set({ heatmap: order[(order.indexOf(cur) + 1) % order.length] });
    },
    setPanelTab: (t) => set({ panelTab: t }),
    setHelpOpen: (v) => set({ helpOpen: v }),
  };
});
