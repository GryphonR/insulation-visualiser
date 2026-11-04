// Runs the moisture model off the main thread: it takes a few hundred ms per build-up.
import { runMoisture } from './moisture';
import type { MoistureInput } from './moisture';

self.onmessage = (e: MessageEvent<Array<MoistureInput | null>>) => {
  postMessage(e.data.map((inp) => (inp ? runMoisture(inp) : null)));
};
