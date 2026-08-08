/**
 * Keyboard shortcut reference dialog.
 */

import { useAppStore } from '@/store/useAppStore';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Kbd } from '@/components/ui/kbd';

const GROUPS: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Playback',
    items: [
      ['Space', 'Play / pause'],
      ['← / →', 'Step backward / forward'],
      ['R', 'Run the planner'],
    ],
  },
  {
    title: 'Tools',
    items: [
      ['D', 'Draw obstacles'],
      ['E', 'Erase obstacles'],
      ['V', 'Drag obstacles'],
      ['S', 'Place start'],
      ['G', 'Place goal'],
      ['H', 'Pan the view'],
    ],
  },
  {
    title: 'Map',
    items: [
      ['M', 'Generate maze'],
      ['X', 'Random obstacles'],
      ['⌫', 'Clear obstacles'],
      ['+ / −', 'Zoom in / out'],
      ['0', 'Fit map to view'],
    ],
  },
  {
    title: 'View & algorithms',
    items: [
      ['1 – 6', 'Select algorithm'],
      ['C', 'Toggle comparison'],
      ['Q', 'Toggle grid lines'],
      ['F', 'Cycle heatmap'],
      ['U', 'Toggle mini-map'],
      ['T', 'Toggle dark mode'],
    ],
  },
];

export function HelpDialog() {
  const open = useAppStore((s) => s.helpOpen);
  const setHelpOpen = useAppStore((s) => s.setHelpOpen);

  return (
    <Dialog open={open} onOpenChange={setHelpOpen}>
      <DialogContent className="max-w-xl">
        <DialogTitle>Keyboard shortcuts</DialogTitle>
        <DialogDescription>
          Everything is reachable from the keyboard. Tip: right-drag with the draw tool
          erases; middle-drag pans anywhere.
        </DialogDescription>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                {g.title}
              </div>
              <div className="space-y-1.5">
                {g.items.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <Kbd>{key}</Kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
