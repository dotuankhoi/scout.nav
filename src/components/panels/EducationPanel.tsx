/**
 * Learn panel: educational deep-dive for the selected algorithm —
 * overview, complexity, guarantees, trade-offs, applications, pseudocode.
 */

import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import { Badge } from '@/components/ui/badge';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function EducationPanel() {
  const algorithmA = useAppStore((s) => s.algorithmA);
  const meta = ALGORITHM_META[algorithmA];

  return (
    <motion.div
      key={meta.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="space-y-4"
    >
      <div>
        <div className="flex items-center gap-2">
          <Badge color={meta.color}>{meta.category === 'grid' ? 'Grid search' : 'Sampling-based'}</Badge>
        </div>
        <h2 className="mt-2 text-lg font-bold tracking-tight">{meta.name}</h2>
        <p className="text-xs italic text-muted-foreground">{meta.tagline}</p>
      </div>

      <Section title="Overview">
        <p className="text-xs leading-relaxed text-muted-foreground">{meta.overview}</p>
      </Section>

      <Section title="Complexity & guarantees">
        <div className="space-y-1.5 text-xs">
          {[
            ['Time', meta.timeComplexity],
            ['Space', meta.spaceComplexity],
            ['Complete', meta.complete],
            ['Optimal', meta.optimal],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="w-16 shrink-0 font-semibold">{k}</span>
              <span className="text-muted-foreground">{v}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Strengths">
        <ul className="space-y-1 text-xs text-muted-foreground">
          {meta.strengths.map((s) => (
            <li key={s} className="flex gap-1.5">
              <Check className="mt-0.5 size-3 shrink-0 text-emerald-500" />
              {s}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Weaknesses">
        <ul className="space-y-1 text-xs text-muted-foreground">
          {meta.weaknesses.map((s) => (
            <li key={s} className="flex gap-1.5">
              <X className="mt-0.5 size-3 shrink-0 text-red-400" />
              {s}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Robotics applications">
        <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
          {meta.applications.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Section>

      <Section title="Pseudocode">
        <pre className="overflow-x-auto rounded-xl border border-border bg-secondary/60 p-3 font-mono text-[10.5px] leading-relaxed">
          {meta.pseudocode}
        </pre>
      </Section>
    </motion.div>
  );
}
