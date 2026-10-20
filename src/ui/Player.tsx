import { FRAMES_PER_HOUR } from '../engine/simulate';
import { pad2 } from '../lib/util';

interface Props {
  frame: number;
  playing: boolean;
  setPlaying: (update: (p: boolean) => boolean) => void;
  scrub: (frame: number) => void;
}

/** Play/pause button, time-of-day slider and clock readout for a `useClock`. */
export function Player({ frame, playing, setPlaying, scrub }: Props) {
  const f = frame % 144;
  return (
    <div className="player">
      <button type="button" className="play" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? (
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 3h3.2v12H4.5zM10.3 3h3.2v12h-3.2z" fill="#fff" /></svg>
        ) : (
          <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3.2v11.6L15 9z" fill="#fff" /></svg>
        )}
      </button>
      <input type="range" aria-label="Time of day" min={0} max={143} step={1} value={f} onChange={(e) => scrub(Number(e.target.value))} />
      <span className="mono clock">{pad2(Math.floor(f / FRAMES_PER_HOUR))}:{pad2((f % FRAMES_PER_HOUR) * 10)}</span>
    </div>
  );
}
