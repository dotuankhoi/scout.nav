/**
 * CanvasArea — hosts one or two (compare mode) planning viewports,
 * pane overlay chips, the mini-map and transient hints.
 */

import { useMemo, useRef, type RefObject } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import type { PaneId } from '@/types';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import type { Camera } from '@/canvas/camera';
import { fmtInt, fmtMs, fmtNum } from '@/utils/format';
import { MapCanvas } from './MapCanvas';
import { MiniMap } from './MiniMap';

function PaneChip({ pane }: { pane: PaneId }) {
  const run = useAppStore((s) => (pane === 'A' ? s.runs.A : s.runs.B));
  const running = useAppStore((s) => s.running);
  const algorithm = useAppStore((s) => (pane === 'A' ? s.algorithmA : s.algorithmB));
  const compareMode = useAppStore((s) => s.compareMode);
  const meta = ALGORITHM_META[run?.algorithm ?? algorithm];

  return (
    <div className="glass pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-xl px-3 py-1.5">
      <span className="size-2 rounded-full" style={{ background: meta.color }} />
      <span className="text-xs font-bold">
        {compareMode ? `${pane} · ` : ''}
        {meta.shortName}
      </span>
      {running && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      {run && !running && (
        <span className="font-mono text-[10px] text-muted-foreground">
          {fmtMs(run.stats.timeMs)} · {fmtInt(run.stats.nodesExpanded)} nodes ·{' '}
          {run.stats.pathFound ? (
            <>len {fmtNum(run.stats.pathLength ?? 0, 1)}</>
          ) : (
            <span className="font-semibold text-red-400">no path</span>
          )}
        </span>
      )}
    </div>
  );
}

/** Legend for weighted-terrain maps (rendered only when terrain exists). */
function TerrainLegend() {
  const mapVersion = useAppStore((s) => s.mapVersion);
  const uiTheme = useAppStore((s) => s.uiTheme);
  const hasTerrain = useMemo(() => {
    const { map } = useAppStore.getState();
    return map.terrain.some((t) => t !== 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVersion]);
  if (!hasTerrain) return null;
  const items: Array<[string, string, string]> =
    uiTheme === 'minimal'
      ? [
          ['Rough', 'rgba(126,116,88,0.9)', '1.8× cost'],
          ['Sand', 'rgba(150,138,92,0.9)', '2.6× cost'],
          ['Hazard', 'rgba(229,72,77,0.9)', '4.5× cost'],
        ]
      : [
          ['Rough', 'rgba(180,120,60,0.9)', '1.8× cost'],
          ['Sand', 'rgba(217,175,80,0.9)', '2.6× cost'],
          ['Hazard', 'rgba(220,60,60,0.9)', '4.5× cost'],
        ];
  return (
    <div className="glass pointer-events-none absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-xl px-3 py-1.5">
      {items.map(([label, color, cost]) => (
        <span key={label} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="size-2.5 rounded-sm" style={{ background: color }} />
          <span className="font-semibold text-foreground">{label}</span>
          {cost}
        </span>
      ))}
    </div>
  );
}

export function CanvasArea({
  camera,
  hostRef,
}: {
  camera: Camera;
  hostRef: RefObject<HTMLDivElement | null>;
}) {
  const compareMode = useAppStore((s) => s.compareMode);
  const showMinimap = useAppStore((s) => s.showMinimap);
  const hasRun = useAppStore((s) => s.runs.A !== null || s.runs.B !== null);
  const running = useAppStore((s) => s.running);
  const paneARef = useRef<HTMLDivElement>(null);

  return (
    <div ref={hostRef} className="relative flex min-h-0 flex-1 gap-3">
      <div ref={paneARef} className="glass relative min-w-0 flex-1 overflow-hidden rounded-2xl">
        <MapCanvas pane="A" camera={camera} primary />
        <PaneChip pane="A" />
      </div>
      {compareMode && (
        <div className="glass relative min-w-0 flex-1 overflow-hidden rounded-2xl">
          <MapCanvas pane="B" camera={camera} />
          <PaneChip pane="B" />
        </div>
      )}

      {showMinimap && (
        <div className="absolute bottom-3 right-3 z-10">
          <MiniMap camera={camera} viewportEl={() => paneARef.current} />
        </div>
      )}

      <TerrainLegend />

      <AnimatePresence>
        {!hasRun && !running && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-xl px-4 py-2 text-xs text-muted-foreground"
          >
            Draw obstacles, drag the robot &amp; flag, then press{' '}
            <span className="font-bold text-foreground">Run</span> (R)
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
