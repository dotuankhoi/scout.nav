/**
 * AI Coach — rule-based post-run analysis.
 *
 * Grades every completed run on four engineering axes (path quality,
 * speed, search efficiency, smoothness) and writes a plain-language
 * comparison of what just happened, including scenario-specific
 * insights. Pure functions over RunResult stats — no ML, no surprises.
 */

import type { PaneId, Vec2 } from '@/types';
import type { RunResult } from '@/algorithms/types';
import { ALGORITHM_META } from '@/algorithms/metadata';
import type { Scenario } from './scenarios';
import { fmtInt, fmtMs, fmtNum } from './format';

export interface ScoreBreakdown {
  label: string;
  /** Normalized 0..1. */
  score: number;
  note: string;
}

export interface RunGrade {
  pane: PaneId;
  run: RunResult;
  /** 0–5 stars. */
  stars: number;
  breakdown: ScoreBreakdown[];
}

export interface CoachReport {
  headline: string;
  bullets: string[];
  grades: RunGrade[];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Total absolute heading change per unit length (lower = smoother). */
export function turnsPerCell(path: Vec2[] | null): number | null {
  if (!path || path.length < 3) return path ? 0 : null;
  let totalTurn = 0;
  let length = 0;
  let prevAngle: number | null = null;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    const seg = Math.hypot(dx, dy);
    if (seg < 1e-9) continue;
    length += seg;
    const angle = Math.atan2(dy, dx);
    if (prevAngle !== null) {
      let d = Math.abs(angle - prevAngle);
      if (d > Math.PI) d = 2 * Math.PI - d;
      totalTurn += d;
    }
    prevAngle = angle;
  }
  return length > 0 ? totalTurn / length : 0;
}

/** Grade one run on the four axes. */
export function gradeRun(pane: PaneId, run: RunResult): RunGrade {
  const s = run.stats;
  const breakdown: ScoreBreakdown[] = [];

  // Path quality: how close to the optimal-cost reference.
  let quality: number;
  let qualityNote: string;
  if (!s.pathFound) {
    quality = 0;
    qualityNote = 'No path found.';
  } else if (s.optimality !== null) {
    quality = s.optimality;
    qualityNote =
      s.optimality >= 0.999
        ? 'Provably optimal cost.'
        : `${((1 - s.optimality) * 100).toFixed(1)}% costlier than the optimal route.`;
  } else {
    quality = 0.6;
    qualityNote = 'Terrain-blind planner: cost quality not comparable on weighted maps.';
  }
  breakdown.push({ label: 'Path quality', score: quality, note: qualityNote });

  // Speed: log-scaled wall-clock time (2 ms ⇒ 1.0, 1 s ⇒ ~0).
  const speed = clamp01(1 - (Math.log10(Math.max(1, s.timeMs)) - 0.3) / 2.7);
  breakdown.push({
    label: 'Speed',
    score: Math.max(0.05, speed),
    note: `Planned in ${fmtMs(s.timeMs)}.`,
  });

  // Search efficiency: path cells recovered per node expanded.
  const efficiency = s.pathFound
    ? clamp01((s.pathLength ?? 0) / Math.max(1, s.nodesExpanded) / 0.25)
    : 0;
  breakdown.push({
    label: 'Efficiency',
    score: efficiency,
    note: `${fmtInt(s.nodesExpanded)} nodes expanded for ${
      s.pathLength !== null ? fmtNum(s.pathLength, 1) : '—'
    } cells of path.`,
  });

  // Smoothness: heading change per unit length.
  const tpc = turnsPerCell(run.path);
  const smooth = tpc === null ? 0 : clamp01(1 - tpc / 1.2);
  breakdown.push({
    label: 'Smoothness',
    score: smooth,
    note:
      tpc === null
        ? 'No path to measure.'
        : tpc < 0.15
          ? 'Nearly straight-line motion.'
          : tpc < 0.5
            ? 'Gentle heading changes.'
            : 'Frequent sharp turns — a real robot would need smoothing.',
  });

  const avg = breakdown.reduce((acc, b) => acc + b.score, 0) / breakdown.length;
  const stars = s.pathFound ? Math.max(1, Math.round(avg * 5)) : 0;
  return { pane, run, stars, breakdown };
}

/** Build the full coach report for the current run(s). */
export function coachReport(
  a: RunResult | null,
  b: RunResult | null,
  hasTerrain: boolean,
  scenario: Scenario,
): CoachReport {
  const grades: RunGrade[] = [];
  if (a) grades.push(gradeRun('A', a));
  if (b) grades.push(gradeRun('B', b));
  const bullets: string[] = [];

  const name = (r: RunResult) => ALGORITHM_META[r.algorithm].shortName;

  // Pairwise comparisons.
  if (a && b) {
    const fast = a.stats.timeMs <= b.stats.timeMs ? a : b;
    const slow = fast === a ? b : a;
    if (slow.stats.timeMs > 0.01) {
      const ratio = slow.stats.timeMs / Math.max(0.01, fast.stats.timeMs);
      bullets.push(
        `${name(fast)} was ${ratio >= 1.15 ? `${ratio.toFixed(1)}× faster than` : 'about as fast as'} ${name(slow)} (${fmtMs(fast.stats.timeMs)} vs ${fmtMs(slow.stats.timeMs)}).`,
      );
    }

    const lessNodes = a.stats.nodesExpanded <= b.stats.nodesExpanded ? a : b;
    const moreNodes = lessNodes === a ? b : a;
    if (moreNodes.stats.nodesExpanded > lessNodes.stats.nodesExpanded * 1.3) {
      bullets.push(
        `${name(moreNodes)} explored ${(moreNodes.stats.nodesExpanded / Math.max(1, lessNodes.stats.nodesExpanded)).toFixed(1)}× more nodes than ${name(lessNodes)} (${fmtInt(moreNodes.stats.nodesExpanded)} vs ${fmtInt(lessNodes.stats.nodesExpanded)}).`,
      );
    }

    if (a.stats.pathLength !== null && b.stats.pathLength !== null) {
      const short = a.stats.pathLength <= b.stats.pathLength ? a : b;
      const long = short === a ? b : a;
      const pct = ((long.stats.pathLength! - short.stats.pathLength!) / short.stats.pathLength!) * 100;
      const shortIsTerrainBlind =
        hasTerrain && ALGORITHM_META[short.algorithm].category === 'sampling';
      if (pct > 3 && !shortIsTerrainBlind) {
        bullets.push(
          `${name(long)}'s path is ${pct.toFixed(0)}% longer than ${name(short)}'s (${fmtNum(long.stats.pathLength!, 1)} vs ${fmtNum(short.stats.pathLength!, 1)} cells).`,
        );
      } else if (pct > 3 && shortIsTerrainBlind) {
        bullets.push(
          `${name(short)}'s route is ${pct.toFixed(0)}% shorter in raw distance — but distance isn't the objective here. ${name(long)} deliberately detours around costly terrain.`,
        );
      }
    }

    const ta = turnsPerCell(a.path);
    const tb = turnsPerCell(b.path);
    if (ta !== null && tb !== null && Math.abs(ta - tb) > 0.12) {
      const smooth = ta < tb ? a : b;
      bullets.push(`${name(smooth)} produced the smoother trajectory — fewer sharp heading changes for a real robot to execute.`);
    }
  }

  // Failure diagnoses.
  for (const r of [a, b]) {
    if (r && !r.stats.pathFound) {
      const meta = ALGORITHM_META[r.algorithm];
      bullets.push(
        meta.category === 'sampling'
          ? `${meta.shortName} failed to connect — random sampling struggles with narrow passages. Try more iterations, a smaller step size, or a higher goal bias.`
          : `${meta.shortName} exhausted the search without reaching the goal — the goal is walled off. Erase an obstacle to open a route.`,
      );
    }
  }

  // Terrain awareness.
  const samplingRun = [a, b].find((r) => r && ALGORITHM_META[r.algorithm].category === 'sampling');
  if (hasTerrain && samplingRun) {
    bullets.push(
      `${name(samplingRun)} is terrain-blind: its tree treats sand, rubble and flood water as free space, so its route may look short while costing far more energy. Grid planners on this map pay the true cost per cell.`,
    );
  }

  // D* teaching moment.
  const dstarRun = [a, b].find((r) => r && r.algorithm === 'dstar');
  if (dstarRun) {
    bullets.push(
      `D* Lite's first search does A*-like work — its superpower is *repairing* the plan when the world changes. With live replan on, drop an obstacle onto the path and watch it adapt.`,
    );
  }

  // Scenario insight.
  bullets.push(`Scenario insight: ${scenario.lesson}`);

  // Headline.
  let headline: string;
  if (grades.length === 0) {
    headline = 'Run the mission to get your engineering report.';
  } else if (grades.length === 1) {
    const g = grades[0];
    headline = g.run.stats.pathFound
      ? `${name(g.run)} completed the mission — ${g.stars}/5 stars.`
      : `${name(g.run)} did not complete the mission.`;
  } else {
    const [ga, gb] = grades;
    if (ga.stars === gb.stars) {
      headline = `Draw: both planners scored ${ga.stars}/5 on this mission.`;
    } else {
      const win = ga.stars > gb.stars ? ga : gb;
      headline = `${name(win.run)} wins this mission with ${win.stars}/5 stars.`;
    }
  }

  return { headline, bullets, grades };
}
