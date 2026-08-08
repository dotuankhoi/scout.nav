/**
 * Left toolbar: editing tools, map generation, map size, and planner
 * parameters (motion model, heuristic, RRT tuning).
 */

import type { ReactNode } from 'react';
import {
  Eraser,
  Flag,
  Grid3x3,
  Hand,
  MapPin,
  Move,
  Pencil,
  Shuffle,
  Trash2,
} from 'lucide-react';
import type { HeuristicId, ToolId } from '@/types';
import { useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WithTooltip } from '@/components/ui/tooltip';
import { cn } from '@/utils/cn';

const TOOLS: Array<{ id: ToolId; icon: typeof Pencil; label: string; key: string }> = [
  { id: 'draw', icon: Pencil, label: 'Draw obstacles (right-drag erases)', key: 'D' },
  { id: 'erase', icon: Eraser, label: 'Erase obstacles', key: 'E' },
  { id: 'move', icon: Move, label: 'Drag obstacles', key: 'V' },
  { id: 'start', icon: MapPin, label: 'Place robot start', key: 'S' },
  { id: 'goal', icon: Flag, label: 'Place goal', key: 'G' },
  { id: 'pan', icon: Hand, label: 'Pan the view', key: 'H' },
];

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-1 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </div>
  );
}

function LabeledSlider({
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="px-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-[11px]">{display}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function LabeledSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between px-1 py-1 text-xs text-muted-foreground">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

export function Toolbar() {
  const tool = useAppStore((s) => s.tool);
  const setTool = useAppStore((s) => s.setTool);
  const map = useAppStore((s) => s.map);
  const options = useAppStore((s) => s.options);
  const algorithmA = useAppStore((s) => s.algorithmA);
  const algorithmB = useAppStore((s) => s.algorithmB);
  const compareMode = useAppStore((s) => s.compareMode);
  const smoothPath = useAppStore((s) => s.smoothPath);
  const liveReplan = useAppStore((s) => s.liveReplan);
  const store = useAppStore.getState();

  const usesSampling =
    algorithmA === 'rrt' ||
    algorithmA === 'rrtstar' ||
    (compareMode && (algorithmB === 'rrt' || algorithmB === 'rrtstar'));
  const usesGrid =
    !['rrt', 'rrtstar'].includes(algorithmA) ||
    (compareMode && !['rrt', 'rrtstar'].includes(algorithmB));

  return (
    <aside className="glass hidden w-60 shrink-0 flex-col overflow-y-auto rounded-2xl p-3 md:flex">
      <SectionLabel>Tools</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        {TOOLS.map(({ id, icon: Icon, label, key }) => (
          <WithTooltip key={id} label={label} shortcut={key} side="right">
            <Button
              variant={tool === id ? 'default' : 'secondary'}
              size="icon"
              aria-label={label}
              className={cn('w-full', tool === id && 'shadow-md')}
              onClick={() => setTool(id)}
            >
              <Icon />
            </Button>
          </WithTooltip>
        ))}
      </div>

      <SectionLabel>Map</SectionLabel>
      <div className="grid grid-cols-3 gap-1.5">
        <WithTooltip label="Random obstacles" shortcut="X" side="bottom">
          <Button variant="secondary" size="icon" className="w-full" aria-label="Random obstacles" onClick={() => store.randomizeMap(0.25)}>
            <Shuffle />
          </Button>
        </WithTooltip>
        <WithTooltip label="Generate maze" shortcut="M" side="bottom">
          <Button variant="secondary" size="icon" className="w-full" aria-label="Generate maze" onClick={() => store.mazeMap()}>
            <Grid3x3 />
          </Button>
        </WithTooltip>
        <WithTooltip label="Clear all obstacles" shortcut="⌫" side="bottom">
          <Button variant="secondary" size="icon" className="w-full" aria-label="Clear obstacles" onClick={() => store.clearObstacles()}>
            <Trash2 />
          </Button>
        </WithTooltip>
      </div>
      <div className="mt-2 space-y-1">
        <LabeledSlider
          label="Width"
          value={map.width}
          display={`${map.width}`}
          min={12}
          max={120}
          step={2}
          onChange={(v) => store.resizeMap(v, useAppStore.getState().map.height)}
        />
        <LabeledSlider
          label="Height"
          value={map.height}
          display={`${map.height}`}
          min={12}
          max={120}
          step={2}
          onChange={(v) => store.resizeMap(useAppStore.getState().map.width, v)}
        />
      </div>

      {usesGrid && (
        <>
          <SectionLabel>Grid search</SectionLabel>
          <LabeledSwitch
            label="Diagonal movement"
            checked={options.allowDiagonal}
            onChange={(v) => store.setOptions({ allowDiagonal: v })}
          />
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <span className="text-xs text-muted-foreground">Heuristic</span>
            <Select
              value={options.heuristic}
              onValueChange={(v) => store.setOptions({ heuristic: v as HeuristicId })}
            >
              <SelectTrigger className="h-7 w-28 rounded-lg text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="octile">Octile</SelectItem>
                <SelectItem value="euclidean">Euclidean</SelectItem>
                <SelectItem value="manhattan">Manhattan</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <LabeledSlider
            label="Heuristic weight"
            value={options.heuristicWeight}
            display={`${options.heuristicWeight.toFixed(2)}×`}
            min={1}
            max={2.5}
            step={0.05}
            onChange={(v) => store.setOptions({ heuristicWeight: v })}
          />
        </>
      )}

      {usesSampling && (
        <>
          <SectionLabel>Sampling (RRT)</SectionLabel>
          <div className="space-y-1">
            <LabeledSlider
              label="Max iterations"
              value={options.rrt.maxIterations}
              display={`${options.rrt.maxIterations}`}
              min={500}
              max={8000}
              step={250}
              onChange={(v) => store.setRrtOption('maxIterations', v)}
            />
            <LabeledSlider
              label="Step size"
              value={options.rrt.stepSize}
              display={`${options.rrt.stepSize.toFixed(1)}`}
              min={0.5}
              max={6}
              step={0.25}
              onChange={(v) => store.setRrtOption('stepSize', v)}
            />
            <LabeledSlider
              label="Goal bias"
              value={options.rrt.goalBias}
              display={`${Math.round(options.rrt.goalBias * 100)}%`}
              min={0}
              max={0.4}
              step={0.01}
              onChange={(v) => store.setRrtOption('goalBias', v)}
            />
            <LabeledSlider
              label="Rewire radius"
              value={options.rrt.rewireRadius}
              display={`${options.rrt.rewireRadius.toFixed(1)}`}
              min={1}
              max={10}
              step={0.5}
              onChange={(v) => store.setRrtOption('rewireRadius', v)}
            />
          </div>
        </>
      )}

      <SectionLabel>View</SectionLabel>
      <LabeledSwitch label="Smooth path (Chaikin)" checked={smoothPath} onChange={store.setSmoothPath} />
      <LabeledSwitch label="Live replan on edit" checked={liveReplan} onChange={store.setLiveReplan} />
    </aside>
  );
}
