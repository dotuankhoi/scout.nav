/**
 * AI Coach panel — mission briefing, star grades per run, and a
 * plain-language engineering analysis of what just happened.
 */

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Star } from 'lucide-react';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import { coachReport } from '@/utils/coach';
import { SCENARIOS } from '@/utils/scenarios';
import { Badge } from '@/components/ui/badge';

function Stars({ count }: { count: number }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${count} of 5 stars`}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          className={`size-3.5 ${i < count ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  );
}

export function CoachPanel() {
  const runs = useAppStore((s) => s.runs);
  const compareMode = useAppStore((s) => s.compareMode);
  const scenarioId = useAppStore((s) => s.scenarioId);
  const mapVersion = useAppStore((s) => s.mapVersion);
  const running = useAppStore((s) => s.running);

  const scenario = SCENARIOS[scenarioId];
  const hasTerrain = useMemo(() => {
    const { map } = useAppStore.getState();
    return map.terrain.some((t) => t !== 0);
    // Recompute when the map is edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapVersion]);

  const report = useMemo(
    () => coachReport(runs.A, compareMode ? runs.B : null, hasTerrain, scenario),
    [runs, compareMode, hasTerrain, scenario],
  );

  return (
    <div className="space-y-4">
      {/* Mission briefing */}
      <div className="rounded-xl border border-border bg-secondary/50 p-3">
        <div className="flex items-center gap-2 text-xs font-bold">
          <span className="text-base leading-none">{scenario.emoji}</span>
          {scenario.name}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{scenario.mission}</p>
      </div>

      {/* Headline */}
      <motion.div
        key={report.headline}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start gap-2 text-sm font-semibold leading-snug"
      >
        <Sparkles className="mt-0.5 size-4 shrink-0 text-amber-400" />
        {running ? 'Planning…' : report.headline}
      </motion.div>

      {/* Grades */}
      {report.grades.map((g) => {
        const meta = ALGORITHM_META[g.run.algorithm];
        return (
          <div key={g.pane} className="rounded-xl border border-border bg-secondary/40 p-3">
            <div className="flex items-center justify-between">
              <Badge color={meta.color}>
                {compareMode ? `${g.pane} · ` : ''}
                {meta.shortName}
              </Badge>
              <Stars count={g.stars} />
            </div>
            <div className="mt-2.5 space-y-2">
              {g.breakdown.map((b) => (
                <div key={b.label}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-medium">{b.label}</span>
                    <span className="text-muted-foreground">{Math.round(b.score * 100)}</span>
                  </div>
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${b.score * 100}%`, background: meta.color }}
                    />
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Analysis bullets */}
      {report.grades.length > 0 && (
        <div>
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Analysis
          </div>
          <ul className="space-y-1.5">
            {report.bullets.map((b, i) => (
              <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <span className="mt-1 size-1 shrink-0 rounded-full bg-primary" />
                {b}
              </li>
            ))}
          </ul>
        </div>
      )}

      {report.grades.length === 0 && !running && (
        <div className="rounded-xl border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          Press <span className="font-bold text-foreground">Run</span> (R) to attempt the mission
          and receive your graded engineering report.
        </div>
      )}
    </div>
  );
}
