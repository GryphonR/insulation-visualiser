import { describe, expect, it } from 'vitest';
import { SOURCE_FLOW, calcHouse, setSource } from './house';
import { defaultHouse } from './house-default';

describe('choosing a heat source', () => {
  it('sets that source’s typical max flow and flow − return drop', () => {
    const h = defaultHouse();
    for (const s of ['boiler', 'condensing', 'ashp', 'gshp'] as const) {
      setSource(h, s);
      expect([h.hp.source, h.hp.maxFlow, h.heating.dT]).toEqual([s, SOURCE_FLOW[s].maxFlow, SOURCE_FLOW[s].dT]);
    }
  });

  it('the same radiators give more at a boiler’s hotter flow', () => {
    const hp = defaultHouse(), boiler = structuredClone(hp);
    setSource(hp, 'ashp'); setSource(boiler, 'condensing');
    const cover = (h: typeof hp) => calcHouse(h).heat.rooms.filter((r) => r.has).reduce((t, r) => t + r.out, 0);
    expect(cover(boiler)).toBeGreaterThan(cover(hp) * 1.5);
  });
});
