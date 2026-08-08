/**
 * Algorithm Inspector — narrates, on every playback frame, why the
 * algorithm under the cursor made its current decision.
 */

import { AnimatePresence, motion } from 'framer-motion';
import type { PaneId } from '@/types';
import type { TraceEvent } from '@/algorithms/types';
import { explainEvent, type Explanation } from '@/algorithms/explain';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';
import { fmtInt, fmtNum } from '@/utils/format';
import { cn } from '@/utils/cn';

const TONE_STYLES: Record<Explanation['tone'], string> = {
  neutral: 'border-border',
  expand: 'border-pink-400/40',
  discover: 'border-sky-400/40',
  improve: 'border-emerald-400/40',
  reject: 'border-red-400/50',
  success: 'border-emerald-400/60',
  failure: 'border-red-400/60',
};

function eventChips(ev: TraceEvent): Array<{ label: string; value: string }> {
  switch (ev.type) {
    case 'current':
      return [
        { label: 'g', value: fmtNum(ev.g) },
        { label: 'h', value: fmtNum(ev.h) },
        { label: 'f', value: fmtNum(ev.f) },
        { label: 'open', value: fmtInt(ev.openSize) },
      ];
    case 'open':
    case 'update':
      return [
        { label: 'g', value: fmtNum(ev.g) },
        { label: 'h', value: fmtNum(ev.h) },
        { label: 'f', value: fmtNum(ev.f) },
      ];
    case 'treeNode':
      return [
        { label: 'node', value: `#${ev.index}` },
        { label: 'cost', value: fmtNum(ev.cost) },
      ];
    case 'rewire':
      return [
        { label: 'node', value: `#${ev.index}` },
        { label: 'saved', value: fmtNum(ev.saving) },
      ];
    case 'goalReached':
    case 'path':
      return [{ label: 'cost', value: fmtNum(ev.cost) }];
    default:
      return [];
  }
}

function PaneInspector({ pane }: { pane: PaneId }) {
  const run = useAppStore((s) => (pane === 'A' ? s.runs.A : s.runs.B));
  const playbackIndex = useAppStore((s) => s.playbackIndex);
  const fallbackAlgo = useAppStore((s) => (pane === 'A' ? s.algorithmA : s.algorithmB));
  const compareMode = useAppStore((s) => s.compareMode);

  const algorithm = run?.algorithm ?? fallbackAlgo;
  const meta = ALGORITHM_META[algorithm];
  const total = run?.events.length ?? 0;
  const applied = run ? Math.min(Math.floor(playbackIndex), total) : 0;
  const ev = run && applied > 0 ? run.events[applied - 1] : null;
  const explanation = ev ? explainEvent(algorithm, ev) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Badge color={meta.color}>
          {compareMode ? `${pane} · ` : ''}
          {meta.shortName}
        </Badge>
        <span className="font-mono text-[11px] text-muted-foreground">
          step {fmtInt(applied)} / {fmtInt(total)}
        </span>
      </div>

      {/* progress */}
      <div className="h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full transition-[width] duration-100"
          style={{
            width: `${total > 0 ? (applied / total) * 100 : 0}%`,
            background: meta.color,
          }}
        />
      </div>

      {explanation && ev ? (
        <div
          className={cn(
            'rounded-xl border bg-secondary/50 p-3 transition-colors',
            TONE_STYLES[explanation.tone],
          )}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={explanation.title}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              <div className="text-xs font-bold tracking-wide">{explanation.title}</div>
            </motion.div>
          </AnimatePresence>
          <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
            {explanation.detail}
          </p>
          {eventChips(ev).length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {eventChips(ev).map((c) => (
                <span
                  key={c.label}
                  className="rounded-md border border-border bg-background/50 px-1.5 py-0.5 font-mono text-[10px]"
                >
                  <span className="text-muted-foreground">{c.label}=</span>
                  {c.value}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {run
            ? 'Press play or step forward to inspect decisions.'
            : 'Run the planner to inspect its decisions step by step.'}
        </div>
      )}
    </div>
  );
}

export function InspectorPanel() {
  const compareMode = useAppStore((s) => s.compareMode);
  return (
    <div className="space-y-4">
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        The inspector explains <em>why</em> the algorithm made the decision under the
        playback cursor. Scrub or step through the timeline to interrogate any moment
        of the search.
      </p>
      <PaneInspector pane="A" />
      {compareMode && <PaneInspector pane="B" />}
    </div>
  );
}
