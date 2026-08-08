/**
 * scout.nav application shell.
 * Layout: top bar / left toolbar / canvas + playback / right panel.
 */

import { useRef } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TopBar } from '@/components/panels/TopBar';
import { Toolbar } from '@/components/panels/Toolbar';
import { PlaybackControls } from '@/components/panels/PlaybackControls';
import { SidePanel } from '@/components/panels/SidePanel';
import { HelpDialog } from '@/components/panels/HelpDialog';
import { CanvasArea } from '@/components/canvas/CanvasArea';
import { createCamera } from '@/canvas/camera';
import { usePlaybackLoop } from '@/hooks/usePlaybackLoop';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

export default function App() {
  const cameraRef = useRef(createCamera());
  const hostRef = useRef<HTMLDivElement | null>(null);

  usePlaybackLoop();
  useKeyboardShortcuts({
    camera: cameraRef.current,
    viewportEl: () => hostRef.current,
  });

  return (
    <TooltipProvider delayDuration={300}>
      <div className="app-backdrop flex h-full flex-col gap-3 p-3">
        <TopBar />
        <div className="flex min-h-0 flex-1 gap-3">
          <Toolbar />
          <main className="flex min-w-0 flex-1 flex-col gap-3">
            <CanvasArea camera={cameraRef.current} hostRef={hostRef} />
            <PlaybackControls />
          </main>
          <SidePanel />
        </div>
        <HelpDialog />
      </div>
    </TooltipProvider>
  );
}
