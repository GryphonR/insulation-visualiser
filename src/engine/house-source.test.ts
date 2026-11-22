import { describe, expect, it } from 'vitest';
import { SOURCE_FLOW, calcHouse, setSource, useTypicalFlow } from './house';
import { defaultHouse } from './house-default';

describe('choosing a heat source', () => {
  it('keeps the flow settings; the typical ones are applied only when asked', () => {
    const h = defaultHouse();
    h.hp.maxFlow = 52; h.heating.dT = 7;
    for (const s of ['boiler', 'condensing', 'ashp', 'gshp'] as const) {
      setSource(h, s);
      expect([h.hp.source, h.hp.maxFlow, h.heating.dT]).toEqual([s, 52, 7]);
    }
    useTypicalFlow(h);
    expect([h.hp.maxFlow, h.heating.dT]).toEqual([SOURCE_FLOW.gshp.maxFlow, SOURCE_FLOW.gshp.dT]);
  });

  it('the same radiators give more at a boiler’s hotter flow', () => {
    const hp = defaultHouse(), boiler = structuredClone(hp);
    setSource(hp, 'ashp'); setSource(boiler, 'condensing'); useTypicalFlow(hp); useTypicalFlow(boiler);
    const cover = (h: typeof hp) => calcHouse(h).heat.rooms.filter((r) => r.has).reduce((t, r) => t + r.out, 0);
    expect(cover(boiler)).toBeGreaterThan(cover(hp) * 1.5);
  });
});
