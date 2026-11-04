// Runs the moisture model off the main thread: it takes a few hundred ms per build-up.
// Custom materials come with each run: they live in the page's localStorage, which a worker can't read.
import { MAT } from './data';
import type { Material } from './data';
import { runMoisture } from './moisture';
import type { MoistureInput } from './moisture';

self.onmessage = (e: MessageEvent<{ inputs: Array<MoistureInput | null>; mats: Material[] }>) => {
  for (const m of e.data.mats) MAT[m.id] = m;
  postMessage(e.data.inputs.map((inp) => (inp ? runMoisture(inp) : null)));
};
