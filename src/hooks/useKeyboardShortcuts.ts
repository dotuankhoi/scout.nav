/**
 * Global keyboard shortcuts. Inert while the user is typing in an input.
 */

import { useEffect } from 'react';
import type { AlgorithmId } from '@/types';
import { ALGORITHM_ORDER } from '@/algorithms/registry';
import { useAppStore } from '@/store/useAppStore';
import { fitToMap, zoomAt, type Camera } from '@/canvas/camera';

export interface ShortcutDeps {
  camera: Camera;
  /** The canvas host element, for zoom-at-center and fit-to-view. */
  viewportEl: () => HTMLElement | null;
}

export function useKeyboardShortcuts({ camera, viewportEl }: ShortcutDeps): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const s = useAppStore.getState();
      const zoomAtCenter = (factor: number) => {
        const host = viewportEl();
        if (!host) return;
        const r = host.getBoundingClientRect();
        zoomAt(camera, r.width / 2, r.height / 2, factor);
      };

      switch (e.key) {
        case ' ':
          e.preventDefault();
          s.togglePlay();
          break;
        case 'ArrowRight':
          e.preventDefault();
          s.stepForward();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          s.stepBackward();
          break;
        case 'r':
        case 'R':
          void s.run();
          break;
        case 'd':
        case 'D':
          s.setTool('draw');
          break;
        case 'e':
        case 'E':
          s.setTool('erase');
          break;
        case 'v':
        case 'V':
          s.setTool('move');
          break;
        case 's':
        case 'S':
          s.setTool('start');
          break;
        case 'g':
        case 'G':
          s.setTool('goal');
          break;
        case 'h':
        case 'H':
          s.setTool('pan');
          break;
        case 'c':
        case 'C':
          s.setCompareMode(!s.compareMode);
          break;
        case 'm':
        case 'M':
          s.mazeMap();
          break;
        case 'x':
        case 'X':
          s.randomizeMap(0.25);
          break;
        case 'Backspace':
        case 'Delete':
          s.clearObstacles();
          break;
        case 'q':
        case 'Q':
          s.setShowGrid(!s.showGrid);
          break;
        case 'f':
        case 'F':
          s.cycleHeatmap();
          break;
        case 't':
        case 'T':
          s.toggleTheme();
          break;
        case 'u':
        case 'U':
          s.setShowMinimap(!s.showMinimap);
          break;
        case '+':
        case '=':
          zoomAtCenter(1.2);
          break;
        case '-':
        case '_':
          zoomAtCenter(1 / 1.2);
          break;
        case '0': {
          const host = viewportEl();
          if (host) {
            const r = host.getBoundingClientRect();
            fitToMap(camera, s.map.width, s.map.height, r.width, r.height);
          }
          break;
        }
        case '?':
          s.setHelpOpen(!s.helpOpen);
          break;
        default: {
          const n = Number(e.key);
          if (n >= 1 && n <= ALGORITHM_ORDER.length) {
            s.setAlgorithm('A', ALGORITHM_ORDER[n - 1] as AlgorithmId);
          }
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [camera, viewportEl]);
}
