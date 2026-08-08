/**
 * Scenario picker — the front door of the engineering sandbox.
 * Choosing a scenario generates a fresh world and adopts the suggested
 * algorithm match-up so the lesson is one click away.
 */

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAppStore } from '@/store/useAppStore';
import { ALGORITHM_META } from '@/algorithms/metadata';
import { SCENARIO_LIST, SCENARIOS } from '@/utils/scenarios';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/utils/cn';

export function ScenarioPicker() {
  const scenarioId = useAppStore((s) => s.scenarioId);
  const applyScenario = useAppStore((s) => s.applyScenario);
  const [open, setOpen] = useState(false);
  const current = SCENARIOS[scenarioId];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="gap-2 font-semibold">
          <span className="text-base leading-none">{current.emoji}</span>
          {current.name}
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Choose a scenario</DialogTitle>
        <DialogDescription>
          Each scenario is a real robotics engineering problem with a suggested algorithm
          match-up. Picking one generates a fresh world — run it, read the Coach, learn the lesson.
        </DialogDescription>
        <div className="mt-4 grid max-h-[60vh] grid-cols-1 gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {SCENARIO_LIST.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                applyScenario(s.id);
                setOpen(false);
              }}
              className={cn(
                'rounded-xl border p-3 text-left transition-all hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                s.id === scenarioId ? 'border-primary/60 bg-accent' : 'border-border bg-secondary/40',
              )}
            >
              <div className="flex items-center gap-2 text-sm font-bold">
                <span className="text-lg leading-none">{s.emoji}</span>
                {s.name}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.blurb}</p>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                {s.suggestCompare
                  ? `Compare ${ALGORITHM_META[s.suggestedA].shortName} vs ${ALGORITHM_META[s.suggestedB].shortName}`
                  : 'Free play'}
              </p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
