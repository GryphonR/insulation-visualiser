// Runs the typical-year simulation off the main thread: it takes the best part of a second for a whole house.
// The design calc comes in ready-made: custom materials live in the page's localStorage, which a worker can't read.
import { simulate } from './house-sim';
import type { House, HouseResult } from './house';
import type { Tmy } from './weather-tmy';

self.onmessage = (e: MessageEvent<{ house: House; base: HouseResult; tmy?: Tmy }>) => {
  postMessage(simulate(e.data.house, 'year', e.data.base, e.data.tmy));
};
