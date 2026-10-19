import { useEffect, useState } from 'react';

/** Drives a shared 0..143 (10-minute step) clock across the day, with play/pause and manual scrub. */
export function useClock(initial = 90) {
  const [frame, setFrame] = useState(initial);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setFrame((f) => (f + 1) % 144), 110);
    return () => clearInterval(t);
  }, [playing]);

  const scrub = (v: number) => {
    setFrame(v);
    setPlaying(false);
  };

  return { frame, setFrame, playing, setPlaying, scrub };
}
