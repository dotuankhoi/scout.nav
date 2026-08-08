/**
 * Playback bar: play / pause / restart / step / scrub / speed.
 */

import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { SPEED_OPTIONS, useAppStore } from '@/store/useAppStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WithTooltip } from '@/components/ui/tooltip';
import { fmtInt } from '@/utils/format';

export function PlaybackControls() {
  const playing = useAppStore((s) => s.playing);
  const speed = useAppStore((s) => s.speed);
  const index = useAppStore((s) => s.playbackIndex);
  const total = useAppStore((s) => s.maxEventCount());
  const store = useAppStore.getState();
  const disabled = total === 0;

  return (
    <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
      <WithTooltip label="Restart">
        <Button variant="ghost" size="iconSm" aria-label="Restart" disabled={disabled} onClick={store.restart}>
          <RotateCcw />
        </Button>
      </WithTooltip>
      <WithTooltip label="Step backward" shortcut="←">
        <Button variant="ghost" size="iconSm" aria-label="Step backward" disabled={disabled} onClick={store.stepBackward}>
          <SkipBack />
        </Button>
      </WithTooltip>
      <WithTooltip label={playing ? 'Pause' : 'Play'} shortcut="Space">
        <Button size="icon" aria-label={playing ? 'Pause' : 'Play'} disabled={disabled} onClick={store.togglePlay}>
          {playing ? <Pause /> : <Play />}
        </Button>
      </WithTooltip>
      <WithTooltip label="Step forward" shortcut="→">
        <Button variant="ghost" size="iconSm" aria-label="Step forward" disabled={disabled} onClick={store.stepForward}>
          <SkipForward />
        </Button>
      </WithTooltip>

      <Slider
        className="mx-2 flex-1"
        value={[Math.min(index, total)]}
        min={0}
        max={Math.max(1, total)}
        step={1}
        disabled={disabled}
        onValueChange={([v]) => store.setPlaybackIndex(v)}
        aria-label="Playback position"
      />

      <span className="w-28 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
        {fmtInt(Math.floor(Math.min(index, total)))} / {fmtInt(total)}
      </span>

      <Select value={String(speed)} onValueChange={(v) => store.setSpeed(Number(v))}>
        <SelectTrigger className="h-8 w-20 rounded-lg text-xs" aria-label="Playback speed">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SPEED_OPTIONS.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}×
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
