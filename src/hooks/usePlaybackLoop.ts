/**
 * Drives playback: advances the fractional event cursor every animation
 * frame while `playing` is true. Speed is expressed as a multiplier of
 * {@link BASE_EVENTS_PER_SECOND}.
 */

import { useEffect } from 'react';
import { BASE_EVENTS_PER_SECOND, useAppStore } from '@/store/useAppStore';

export function usePlaybackLoop(): void {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useAppStore.getState();
      if (!s.playing) return;
      s.advancePlayback(dt * BASE_EVENTS_PER_SECOND * s.speed);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}
