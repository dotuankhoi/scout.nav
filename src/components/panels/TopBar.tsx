/**
 * Top bar: branding, algorithm selection (A and, in compare mode, B),
 * the Run button, view options and file operations.
 */

import { motion } from 'framer-motion';
import {
  Bot,
  CircleHelp,
  Columns2,
  Download,
  Flame,
  Grid2x2,
  Image,
  Loader2,
  Map as MapIcon,
  Moon,
  Paintbrush,
  Play,
  Sun,
  Upload,
} from 'lucide-react';
import type { AlgorithmId, HeatmapMode, PaneId } from '@/types';
import { ALGORITHM_LIST, ALGORITHM_META } from '@/algorithms/metadata';
import { useAppStore } from '@/store/useAppStore';
import { canvasRegistry } from '@/canvas/registry';
import { downloadText, exportCanvasPng, pickTextFile } from '@/utils/mapio';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WithTooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScenarioPicker } from './ScenarioPicker';
import { BenchmarkDialog } from './BenchmarkDialog';

function AlgorithmSelect({ pane }: { pane: PaneId }) {
  const value = useAppStore((s) => (pane === 'A' ? s.algorithmA : s.algorithmB));
  const setAlgorithm = useAppStore((s) => s.setAlgorithm);
  return (
    <Select value={value} onValueChange={(v) => setAlgorithm(pane, v as AlgorithmId)}>
      <SelectTrigger className="w-36" aria-label={`Algorithm ${pane}`}>
        <span className="flex items-center gap-2 truncate">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: ALGORITHM_META[value].color }}
          />
          <SelectValue />
        </span>
      </SelectTrigger>
      <SelectContent>
        {ALGORITHM_LIST.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full" style={{ background: m.color }} />
              {m.name}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function TopBar() {
  const compareMode = useAppStore((s) => s.compareMode);
  const running = useAppStore((s) => s.running);
  const theme = useAppStore((s) => s.theme);
  const uiTheme = useAppStore((s) => s.uiTheme);
  const showGrid = useAppStore((s) => s.showGrid);
  const showMinimap = useAppStore((s) => s.showMinimap);
  const heatmap = useAppStore((s) => s.heatmap);
  const store = useAppStore.getState();

  const onExportPng = () => {
    const canvas = canvasRegistry.A ?? canvasRegistry.B;
    if (canvas) exportCanvasPng(canvas, 'scout-nav.png');
  };
  const onSaveMap = () => downloadText('scout-nav-map.json', store.saveMapJson());
  const onLoadMap = async () => {
    const text = await pickTextFile('.json');
    if (!text) return;
    try {
      store.loadMapJson(text);
    } catch {
      useAppStore.setState({ runError: 'Could not load map: invalid file.' });
    }
  };

  return (
    <header className="glass flex flex-wrap items-center gap-2.5 rounded-2xl px-3 py-2">
      {/* Brand */}
      <div className="flex items-center gap-2 pr-2">
        <motion.div
          animate={{ rotate: [0, -8, 8, 0] }}
          transition={{ repeat: Infinity, duration: 5, repeatDelay: 3 }}
          className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 to-indigo-500 text-white shadow-lg shadow-cyan-500/25"
        >
          <Bot className="size-5" />
        </motion.div>
        <div className="leading-tight">
          <div className="bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-sm font-extrabold tracking-tight text-transparent">
            scout.nav
          </div>
          <div className="text-[10px] text-muted-foreground">robotics engineering sandbox</div>
        </div>
      </div>

      {/* Scenario first — the algorithm serves the mission. */}
      <ScenarioPicker />

      {/* Algorithm selection */}
      <AlgorithmSelect pane="A" />
      {compareMode && (
        <>
          <span className="text-xs font-bold text-muted-foreground">vs</span>
          <AlgorithmSelect pane="B" />
        </>
      )}
      <WithTooltip label="Side-by-side comparison" shortcut="C">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-border bg-secondary px-2.5 py-1.5">
          <Columns2 className="size-4 text-muted-foreground" />
          <Switch checked={compareMode} onCheckedChange={store.setCompareMode} aria-label="Compare mode" />
        </label>
      </WithTooltip>

      <WithTooltip label="Run the planner" shortcut="R">
        <Button onClick={() => void store.run()} disabled={running} className="min-w-24">
          {running ? <Loader2 className="animate-spin" /> : <Play />}
          {running ? 'Planning…' : 'Run'}
        </Button>
      </WithTooltip>

      <div className="grow" />

      <BenchmarkDialog />

      {/* Heatmap mode */}
      <WithTooltip label="Heatmap overlay" shortcut="F">
        <div className="flex items-center gap-1.5">
          <Flame className="size-4 text-muted-foreground" />
          <Select value={heatmap} onValueChange={(v) => store.setHeatmap(v as HeatmapMode)}>
            <SelectTrigger className="h-8 w-32 rounded-lg text-xs" aria-label="Heatmap mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No heatmap</SelectItem>
              <SelectItem value="frequency">Visit frequency</SelectItem>
              <SelectItem value="density">Search density</SelectItem>
              <SelectItem value="order">Exploration order</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </WithTooltip>

      <WithTooltip label={showGrid ? 'Hide grid lines' : 'Show grid lines'} shortcut="Q">
        <Button
          variant={showGrid ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Toggle grid"
          onClick={() => store.setShowGrid(!showGrid)}
        >
          <Grid2x2 />
        </Button>
      </WithTooltip>
      <WithTooltip label={showMinimap ? 'Hide mini-map' : 'Show mini-map'} shortcut="U">
        <Button
          variant={showMinimap ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Toggle mini-map"
          onClick={() => store.setShowMinimap(!showMinimap)}
        >
          <MapIcon />
        </Button>
      </WithTooltip>
      <WithTooltip
        label={uiTheme === 'classic' ? 'Switch to the minimal UI' : 'Switch back to the classic UI'}
      >
        <Button
          variant={uiTheme === 'minimal' ? 'secondary' : 'ghost'}
          size="icon"
          aria-label="Toggle UI theme"
          onClick={store.toggleUiTheme}
        >
          <Paintbrush />
        </Button>
      </WithTooltip>
      {uiTheme === 'classic' && (
        <WithTooltip label="Toggle dark mode" shortcut="T">
          <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={store.toggleTheme}>
            {theme === 'dark' ? <Sun /> : <Moon />}
          </Button>
        </WithTooltip>
      )}

      <DropdownMenu>
        <WithTooltip label="Save / load / export">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="File menu">
              <Download />
            </Button>
          </DropdownMenuTrigger>
        </WithTooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onSaveMap}>
            <Download /> Save map (JSON)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onLoadMap()}>
            <Upload /> Load map (JSON)
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onExportPng}>
            <Image /> Export view as PNG
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <WithTooltip label="Keyboard shortcuts" shortcut="?">
        <Button variant="ghost" size="icon" aria-label="Help" onClick={() => store.setHelpOpen(true)}>
          <CircleHelp />
        </Button>
      </WithTooltip>
    </header>
  );
}
